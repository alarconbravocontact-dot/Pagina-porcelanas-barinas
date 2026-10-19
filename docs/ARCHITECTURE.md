# Arquitectura

```
porcelanas/
├── packages/shared   Contratos Zod, enums, cálculos (cajas/m², USD/Bs), permisos, fechas por zona horaria
├── apps/api          Fastify + Prisma + Socket.IO (API, reglas de negocio, tareas programadas)
│   ├── prisma/       schema.prisma, migraciones versionadas, semillas
│   ├── src/lib       auth (sesiones, CSRF), errores, almacenamiento, multipart, auditoría, tiempo real
│   ├── src/services  catálogo, inventario, cotizaciones, carrito, retiro, órdenes, pagos, chat, reportes, tasa
│   ├── src/routes    endpoints HTTP agrupados por área
│   └── test/         integración contra PostgreSQL (base nueva por ejecución)
├── apps/web          React SPA (páginas públicas, cuenta de cliente, panel de vendedor, administración)
└── e2e/              Playwright contra la aplicación compilada
```

Un único proceso Node sirve la API (`/api`), los archivos públicos (`/media`), Socket.IO (`/socket.io`) y el frontend compilado. No hay microservicios.

## Decisiones clave
- **Fuente de verdad en el servidor.** El frontend calcula una vista previa con el mismo código de `packages/shared`, pero el servidor recalcula precios, cajas, totales, tasa e inventario en cada carrito, cotización y confirmación. Los campos enviados por el cliente como `totalCents` o `status` se ignoran (probado).
- **Dinero sin flotantes.** Importes en céntimos enteros; superficies en cm² enteros (1 m² = 10 000); tasas `Decimal(20,8)` con decimal.js. Bs = USD × tasa con redondeo *half‑up*; abonos en Bs → USD con redondeo hacia abajo.
- **Precio canónico por caja.** El administrador fija el precio por m² o por caja; el otro se deriva y ambos se guardan. Siempre se venden cajas completas (`ceil`).
- **Tasa fijada por operación.** Cada cotización guarda la tasa usada y vence según `quote.validityMinutes`. Al confirmar: si la cotización sigue vigente y coincide exactamente con el cálculo actual se usa su tasa; si no, el servidor responde `409 QUOTE_CHANGED/QUOTE_EXPIRED` con una cotización nueva para reconfirmar. La orden guarda `rateValue` y `exchangeRateId` para siempre.
- **Concurrencia de inventario.** `UPDATE … WHERE onHand + Δ >= 0 AND reserved + Δ <= onHand + Δ RETURNING` dentro de transacciones, más restricciones `CHECK` en la base de datos. El cupo diario de retiro usa el mismo patrón (`PickupDay.booked < capacity`). Probado con 5 compras simultáneas por el mismo stock.
- **Idempotencia.** Checkout y registro de pagos exigen la cabecera `Idempotency-Key` (únicas por cliente/orden). Reintentos concurrentes devuelven la operación original. La revisión de pagos usa actualizaciones condicionales (`status = PENDING`) y un índice único parcial impide aprobar dos veces la misma referencia por método.
- **Estados controlados por el backend.** Orden: `PENDING_PAYMENT → CONFIRMED → READY_FOR_PICKUP → DELIVERED`, o `CANCELLED`/`EXPIRED`. Se confirma al acreditar `requiredCents` (100 % en compra con retiro, `prepayMinPercent` en prepago). La entrega exige saldo cero y descuenta existencias. Nada se borra físicamente: cancelaciones y vencimientos liberan reserva/cupo y quedan en `OrderEvent`, `InventoryMovement` y `AuditLog`.
- **Vencimiento de reservas.** Tarea cada `JOBS_INTERVAL_SECONDS`: vence órdenes sin el pago requerido tras `holdHours` (opcionalmente no mientras haya un pago en revisión), rechaza pagos pendientes de esas órdenes y libera inventario. También avisa de retiros vencidos (`pickupGraceDays`) y, si se configura, los cancela.
- **Seguridad.** Argon2id; sesiones con token aleatorio en cookie `httpOnly; SameSite=Lax` (solo el hash SHA‑256 en BD); CSRF de doble envío en todo método no seguro; autorización por rol y por recurso (vendedor solo ve lo asignado; clientes solo lo propio, con 404 para no revelar existencia); Helmet/CSP; límites de solicitudes; validación Zod en cada endpoint; Prisma parametrizado; rechazo de bytes nulos; errores centralizados sin filtrar detalles.
- **Comprobantes privados.** Se valida extensión, MIME declarado y firma real (JPG/PNG/WebP), tamaño configurable; se guardan en `STORAGE_DIR/private` con nombre aleatorio y SHA‑256; solo se descargan por `/api/proofs/:id` tras verificar acceso (`Cache-Control: no-store`, `nosniff`, CSP restrictiva).
- **Tiempo real.** Socket.IO autenticado con la cookie de sesión; salas por usuario y por conversación (la unión a una sala se autoriza en el servidor). Si el socket no conecta, la interfaz sondea periódicamente. Los mensajes siempre se persisten vía REST antes de emitirse.
- **Zona horaria.** Instantes en UTC; fechas comerciales (`pickupDate`, `effectiveDate`) como `DATE` en la zona configurada (`store.timezone`, por defecto America/Caracas). Indicadores agrupados por día local.

## Vendedores, métodos de pago y catálogo de Barinas
- **Vendedor obligatorio y confirmado**: el checkout exige `sellerId` de un vendedor activo y `sellerConfirmed: true`. Con un solo vendedor activo se preselecciona, pero el comprador debe confirmarlo. Los vendedores nuevos aparecen sin cambiar código (`GET /api/sellers`).
- **Contacto público del vendedor**: `city`, `branch`, `publicPhone`, `publicEmail` y `whatsapp` (derivado del teléfono con `toWhatsappNumber`: +58 sin el 0 inicial). Es independiente del teléfono interno, que nunca se publica.
- **Activación de cuentas**: `UserToken` guarda solo el hash de un token de un solo uso (72 h). El administrador lo genera (`POST /api/admin/users/:id/activation-link` o `npm run user:activation-link`) y el usuario define su propia contraseña en `/activar`. No se inventan contraseñas.
- **Métodos de pago**: nombre, estado, moneda, instrucciones, datos de recepción, texto adicional, requisitos de comprobante y orden. `configured` = tiene datos de recepción (o es efectivo). Los no configurados se muestran deshabilitados, no exponen instrucciones y el servidor rechaza elegirlos (`PAYMENT_METHOD_NOT_CONFIGURED`) o pagar con ellos.
- **Método elegido ≠ estado de pago**: `Order.preferredMethodId` guarda la elección; `paymentStatus` (UNPAID/PARTIAL/PAID) solo cambia con pagos aprobados. Al comprador se le muestra `paymentReviewState`: pago pendiente → comprobante recibido (en revisión) → pago aprobado / rechazado.
- **Listas de precios**: `Product.priceBcvM2Cents/priceBcvBoxCents` (nulo = igual a divisas). `Order.priceList` = `BCV` si el método es en Bs, `DIVISA` si es en USD; importes e ítems se guardan en esa lista y `totalVesCents` = total BCV × tasa fijada. Pagos en otra moneda → `PRICE_LIST_MISMATCH`.
- **Guía de uso**: `Product.slipRating` (R11, R10, moderado, medio‑bajo, resbaladizo) y `usageGuide` (salas, cocina, piso de baño, ducha, exterior, paredes = recomendado / precaución / no recomendado). Filtros `?use=ducha` y `?slip=R10`.
- **Importación idempotente** (`src/seed/business.ts`): crea por SKU solo lo que falta; no toca existencias ni productos editados; sin `--demo` desactiva los datos de demostración.

## Roles y permisos
| Permiso | Admin | Vendedor | Cliente |
|---|---|---|---|
| Catálogo, inventario, precios, tasas, configuración, vendedores, usuarios, auditoría, indicadores | ✔ | ✘ | ✘ |
| Ver/operar operaciones | todas | solo asignadas | solo propias (lectura, pagos, reprogramación, cancelación según política) |
| Revisar pagos | ✔ | si `canReviewPayments` (solo sus operaciones) | ✘ |
| Ver comprobantes | ✔ | si `canViewProofs` (solo sus operaciones) | los propios |
| Cancelar operaciones | ✔ | ✘ | propias sin pagos acreditados y con la anticipación configurada |
| Chat | supervisión de solo lectura | sus conversaciones | las propias |

## Modelo de datos (31 modelos)
`User`, `Session`, `CustomerProfile`, `Seller` · `Category`, `Product`, `ProductCategory`, `ProductImage`, `Inventory`, `InventoryMovement`, `PriceHistory` · `ExchangeRate`, `Quote` · `Cart`, `CartItem` · `Order`, `OrderItem` (copia histórica de producto, precio y cantidades), `Reservation`, `PickupDay`, `BlockedPickupDate`, `OrderEvent`, `OrderNote` · `PaymentMethod`, `Payment`, `PaymentProof` · `Conversation`, `Message`, `Notification` · `AuditLog`, `BusinessSetting` · `UserToken` (activación de cuentas).

Los roles son un enum con permisos definidos en código (`packages/shared/src/permissions.ts`) más banderas por vendedor; no se creó una tabla de permisos porque no hay requisitos de permisos dinámicos.

Migraciones: `20261018210412_init` y `20261019003908_catalogo_vendedor_pagos` (precios BCV, guía de uso, contacto del vendedor, datos de recepción, lista de precios de la orden, tokens de activación). La inicial (incluye `CHECK` de existencias e importes, índice único parcial de referencias aprobadas y la restricción de dueño del carrito).

## Endpoints (83)
| Método | Ruta |
|---|---|
| GET | `/api/health` |
| GET | `/api/settings/public` |
| GET | `/api/catalog` |
| GET | `/api/catalog/facets` |
| GET | `/api/products/:idOrSku` |
| GET | `/api/categories` |
| GET | `/api/rates/current` |
| POST | `/api/quotes` |
| GET | `/api/sellers` |
| GET | `/api/payment-methods` |
| GET | `/api/pickup/availability` |
| GET | `/api/auth/session` |
| POST | `/api/auth/register` |
| POST | `/api/auth/login` |
| POST | `/api/auth/activation/check` |
| POST | `/api/auth/activate` |
| POST | `/api/auth/logout` |
| PATCH | `/api/auth/profile` |
| POST | `/api/auth/password` |
| GET | `/api/cart` |
| POST | `/api/cart/items` |
| PATCH | `/api/cart/items/:id` |
| DELETE | `/api/cart/items/:id` |
| DELETE | `/api/cart` |
| POST | `/api/orders` |
| GET | `/api/orders` |
| GET | `/api/orders/:code` |
| POST | `/api/orders/:code/reschedule` |
| POST | `/api/orders/:code/cancel` |
| POST | `/api/orders/:code/payments` |
| POST | `/api/payments/:id/proofs` |
| GET | `/api/proofs/:id` |
| GET | `/api/conversations` |
| POST | `/api/conversations` |
| GET | `/api/conversations/:id/messages` |
| POST | `/api/conversations/:id/messages` |
| POST | `/api/conversations/:id/read` |
| PATCH | `/api/conversations/:id/status` |
| GET | `/api/notifications` |
| POST | `/api/notifications/:id/read` |
| POST | `/api/notifications/read-all` |
| GET | `/api/staff/orders` |
| GET | `/api/staff/orders/:id` |
| POST | `/api/staff/orders/:id/status` |
| POST | `/api/staff/orders/:id/notes` |
| POST | `/api/staff/orders/:id/payments` |
| GET | `/api/staff/payments` |
| POST | `/api/staff/payments/:id/review` |
| GET | `/api/staff/pickups` |
| GET | `/api/staff/me` |
| GET | `/api/admin/products` |
| GET | `/api/admin/products/:id` |
| POST | `/api/admin/products` |
| PUT | `/api/admin/products/:id` |
| POST | `/api/admin/products/:id/images` |
| DELETE | `/api/admin/products/:id/images/:imageId` |
| PATCH | `/api/admin/products/:id/images/order` |
| GET | `/api/admin/products/:id/movements` |
| POST | `/api/admin/products/:id/movements` |
| GET | `/api/admin/products/:id/price-history` |
| GET | `/api/admin/categories` |
| POST | `/api/admin/categories` |
| PUT | `/api/admin/categories/:id` |
| GET | `/api/admin/sellers` |
| POST | `/api/admin/sellers` |
| PUT | `/api/admin/sellers/:id` |
| POST | `/api/admin/users/:id/activation-link` |
| GET | `/api/admin/users` |
| PATCH | `/api/admin/users/:id` |
| GET | `/api/admin/rates` |
| POST | `/api/admin/rates` |
| POST | `/api/admin/rates/fetch` |
| GET | `/api/admin/payment-methods` |
| POST | `/api/admin/payment-methods` |
| PUT | `/api/admin/payment-methods/:id` |
| GET | `/api/admin/settings` |
| PUT | `/api/admin/settings/:key` |
| POST | `/api/admin/settings/hero-image` |
| GET | `/api/admin/pickup/blocked-dates` |
| POST | `/api/admin/pickup/blocked-dates` |
| DELETE | `/api/admin/pickup/blocked-dates/:date` |
| GET | `/api/admin/reports/dashboard` |
| GET | `/api/admin/audit` |

Todas las respuestas de error usan `{ "error": { "code", "message", "details?" } }`.
