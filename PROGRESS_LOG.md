# Registro de avance

## 2026-10-18 — Auditoría inicial
- El directorio de trabajo estaba vacío: no había código, Git, dependencias ni configuración previa que conservar.
- Entorno disponible: Node 22, npm 10, PostgreSQL 16 local, Chromium para Playwright.
- Decisión de arquitectura: monorepo npm workspaces con `packages/shared` (contratos Zod + cálculos), `apps/api` (Fastify + Prisma + Socket.IO) y `apps/web` (React + Vite).
- El portal del BCV (`www.bcv.org.ve`) no es accesible desde este entorno (proxy 403). El integrador automático se implementó contra la estructura conocida del portal y se dejó desactivado por defecto; la tasa manual autorizada es el flujo principal.

## Bloques A–E (backend) — completados y probados
- Esquema relacional con 30 modelos, migración versionada `20261018210412_init` con restricciones CHECK (stock no negativo, reservas ≤ existencias, importes positivos) e índice único parcial para referencias de pago aprobadas.
- API: catálogo con filtros, administración de productos/fotos/inventario/precios, cotización persistida con tasa, carrito persistente (visitante → usuario), checkout transaccional con vendedor obligatorio, reservas con cupo diario, pagos con comprobantes privados y revisión manual, chat con Socket.IO, notificaciones, indicadores y auditoría.
- Pruebas: 15 unitarias (shared) + 55 de integración (API sobre PostgreSQL real, base de datos nueva por ejecución). Todas pasan.
- Bugs detectados por las pruebas y corregidos: vista de carrito vacía tras el primer artículo de un visitante; bytes nulos en URL provocaban 500; carrera de idempotencia en pagos concurrentes con la misma clave.

## Bloque F (frontend, administración y lanzamiento) — completado
- SPA React conectada a la API real en todas las pantallas: inicio, catálogo con filtros en la URL, detalle con calculadora, carrito, checkout con vendedor obligatorio, ingreso/registro, área del cliente (operaciones, pagos y comprobantes, reprogramación, cancelación, chat, perfil), panel de vendedor (operaciones, comprobantes, retiros, chat, incidencias), panel administrativo (indicadores, productos/fotos/inventario/precios, vendedores, usuarios y roles, tasa BCV, métodos de pago, configuración comercial, días bloqueados, categorías, auditoría), políticas y 404.
- Estados de carga, vacío, error con reintento y confirmaciones en cada vista. Chat con Socket.IO y sondeo de respaldo.
- Bugs detectados por E2E y corregidos: tras confirmar la compra, el refresco del carrito vacío redirigía a /carrito antes de abrir la operación; los scripts `db:*` no cargaban el `.env` raíz; el cliente Prisma no se generaba tras `npm ci`; bases E2E huérfanas.
- Dockerfile, docker-compose y CI de GitHub Actions incluidos (Docker no disponible en este entorno: **no verificados**).

## Resultados de pruebas (última ejecución)
| Suite | Resultado |
|---|---|
| `packages/shared` (unitarias: conversión cajas/m², dinero USD/Bs, fechas, permisos) | 15/15 ✔ |
| `apps/api` (integración sobre PostgreSQL real, base nueva + `migrate deploy` por ejecución) | 55/55 ✔ (estable en 3 ejecuciones consecutivas) |
| `apps/web` (unitarias: cliente API, validación de archivos, componentes) | 6/6 ✔ |
| Playwright E2E (escritorio + Pixel 7) | 13/13 ✔ (estable en 3 ejecuciones) |
| Reproducibilidad: clon limpio siguiendo el README (`npm ci` → `db:deploy` → `db:seed` → typecheck → tests → build → E2E) | ✔ |

## Pendiente / limitaciones conocidas
- Integración BCV automática no verificada contra el portal real (bloqueado en este entorno). Usar registro manual.
- Sin pasarelas de pago automáticas (no hay APIs oficiales integradas); verificación manual.
- Sin correo/SMS; solo notificaciones internas.
- Socket.IO en una sola instancia (sin adaptador Redis); archivos en disco local.
- Reembolsos de operaciones canceladas con pagos acreditados: quedan marcados (`REFUND_REVIEW`) para gestión manual; no hay módulo de reembolsos.
- Los textos legales, datos de la sede, WhatsApp, instrucciones de pago y la tasa deben ser cargados por el negocio.
- `npm audit`: quedan advertencias solo en herramientas de desarrollo/compilación (`braces` vía Tailwind 3, `postcss-selector-parser`, `deepmerge-ts` vía CLI de Prisma 6). No forman parte del bundle del servidor ni del navegador; se resolverían migrando a Tailwind 4 y Prisma 7.
- Paquete JS del frontend ~570 kB (165 kB gzip) sin división de código por rutas.

## 2026-10-19 — Rediseño visual
- Estética minimalista de galería de porcelana (blanco, grises fríos, Cormorant Garamond + Inter, cartelas de museo).

## 2026-10-19 — Vendedor, métodos de pago y catálogo de Barinas
- **Vendedor Juan Alarcon** registrado en la base de datos por la semilla idempotente (`ensureSeller`): usuario `alarconbravocontact@gmail.com` con rol vendedor, sede Barinas, WhatsApp `584125552594`, activo y con permiso de revisar pagos. Sin contraseña inventada: activación por enlace de un solo uso (nuevo modelo `UserToken`, página `/activar`, botón en Administración → Vendedores y comando `npm run user:activation-link`).
- Datos del vendedor visibles en: inicio, página `/contacto`, selector y resumen del checkout, confirmación de la operación, área del cliente, detalle de la reserva, chat interno y botones de WhatsApp con contexto (producto y cantidad, carrito, número de operación y fecha de retiro). Correo como enlace `mailto:`.
- Vendedor obligatorio validado en frontend y backend, con confirmación explícita (`sellerConfirmed`) y preselección si hay un único vendedor.
- **Métodos de pago** con datos de recepción, texto adicional, requisitos de comprobante y orden. Pago Móvil, Zelle, Binance y transferencia se crean activos pero **sin datos de recepción** (no se inventaron cuentas): aparecen como “pendiente de configuración” y no se pueden usar. Efectivo, desactivado hasta que el administrador lo habilite.
- Método elegido guardado en la operación y separado del estado del pago; estados visibles: pago pendiente, comprobante recibido, pago aprobado, pago rechazado.
- **Catálogo importado del PDF** (72 productos, 70 fotos): precio en divisas y precio BCV, formato, caja, clasificación antideslizante y guía de uso por ambiente. 5 piezas grandes en borrador por inconsistencia de m² por caja. Existencias en 0 (no vienen en el catálogo). SKU provisionales.
- **Listas de precios**: la moneda del método define si se aplica el precio en divisas o el precio BCV; la orden guarda la lista y la tasa.
- Pruebas: shared 16/16, API 63/63 (8 nuevas en `test/business.test.ts`), web 6/6, E2E 16/16 (3 nuevas: datos y WhatsApp de Juan, ficha del catálogo con precio BCV y guía de uso, activación de cuenta por enlace).

### Pendiente para el negocio
- Datos de recepción reales de cada método de pago.
- Existencias de cada producto; verificación de caja de las 5 piezas en borrador; SKU definitivos si se desea.
- Activación de la cuenta de Juan (contraseña elegida por él).
- Dirección, horario y políticas de la sede; tasa BCV del día.

## 2026-10-19 — Registro del cliente, orden de compra y confirmación de retiro
- **Compra sin cuenta con 4 datos** (nombre, ubicación = ciudad + zona, teléfono, cédula): formulario breve en el checkout, validado con el mismo esquema en navegador y servidor. Crea un cliente sin correo ni contraseña y abre una sesión segura en el dispositivo (180 días); los datos se reutilizan y pueden corregirse antes de confirmar.
- **Seguridad**: cédula única (sin perfiles duplicados) y nunca usada para iniciar sesión; si la cédula ya existe desde otra sesión se rechaza sin revelar el perfil. Acceso desde otro dispositivo por enlace de un solo uso enviado por el vendedor, o con correo y contraseña opcionales. Cédula enmascarada en todas las vistas; consulta completa explícita y auditada solo para administrador y vendedor asignado.
- **Orden**: toma los datos del perfil (no del navegador) y guarda una copia; incluye número único, productos y códigos, cantidades, cajas, m², precios unitarios, total USD, tasa, Bs, método, vendedor, comprobantes, fecha y estados. Idempotencia contra dobles clics.
- **Flujo posterior**: paso de comprobante (o “pagaré después”) y luego el cartel “¡Tu orden de compra ha sido registrada!” con el texto solicitado, número de orden, datos de Juan Alarcon, botón “Contactar a mi vendedor por WhatsApp” (wa.me/584125552594 con el número de orden real) y “Ver mi orden de compra”. Aclara que la orden no implica pago aprobado ni pedido listo, y muestra la fecha de retiro.
- **Estados diferenciados**: Orden registrada · Pago pendiente · Comprobante recibido · Pago en revisión (nuevo, `Payment.reviewStartedAt`) · Pago confirmado · Pedido en preparación · Listo para retirar · Entregado · Cancelado. Barra de progreso en el detalle del cliente y del vendedor.
- **Panel del vendedor**: lista con número de orden, cliente, teléfono, ubicación, productos y cajas, método y estado del comprobante; detalle con historial, cédula enmascarada, enlace de acceso para el cliente, WhatsApp al cliente y botón “Iniciar revisión”.
- **Bug corregido** (detectado por E2E): el formulario de datos quedaba anidado dentro del formulario del checkout (HTML inválido) y su envío se perdía.
- Pruebas: shared 17/17, API 72/72 (9 nuevas en `test/customer-order.test.ts`), web 10/10 (4 nuevas: formulario y cartel/WhatsApp), E2E 15/15 (flujo completo: 4 datos → Juan → Zelle → orden → comprobante → cartel → revisión → panel de Juan).

### Pendiente
- Datos de recepción de los métodos de pago, existencias, activación de la cuenta de Juan, tasa BCV y datos de la sede (sin cambios respecto al bloque anterior).
- Cifrado en reposo de la cédula (hoy protegida por control de acceso, enmascarado y auditoría): requiere definir y custodiar una clave de cifrado.

## 2026-10-19 — Recorrido visual
- Script `e2e/capture/capture.mjs` (+ `start-server.sh`) que recorre la aplicación real como administrador, cliente y vendedor y captura 44 pantallas (escritorio y móvil).
- Bug corregido al revisar las capturas: en móvil, las grillas de dos columnas se ensanchaban hasta el ancho mínimo de la tabla de productos y provocaban desplazamiento horizontal en el detalle de la orden. Se añadió `grid-cols-1` base a 55 grillas y una verificación en la prueba E2E.
- Etiqueta "Número de operación" → "Número de orden" en el detalle del cliente.
- Pruebas: shared 17/17, API 72/72, web 10/10, E2E 15/15.

## 2026-10-19 — Horario de la sede
- **Lunes a viernes de 8:00 a. m. a 5:00 p. m.**; sábado y domingo sin atención. El sábado 08:00–12:00 que venía por defecto era un valor provisional y se eliminó.
- El calendario de retiro solo ofrece días hábiles (lunes a viernes, 08:00–17:00); el servidor rechaza sábado y domingo.
- Texto visible “Lunes a viernes, de 8:00 a. m. a 5:00 p. m.” en el pie de página, inicio, contacto, cómo comprar, el cartel de orden registrada y el detalle de la orden del cliente. Se carga al iniciar sin pisar un horario ya editado por el administrador (Configuración → Sede y Horarios de retiro).
- Pruebas: shared 18/18, API 73/73, web 10/10, E2E 15/15.

## 2026-10-19 — Recorrido guiado animado por ventana
- **Tutorial dentro de la plataforma** para 28 ventanas: sitio público, orden de compra, área del cliente, panel del vendedor y administración. Un foco animado se desplaza de una zona a otra (el resto de la pantalla se oscurece) y una tarjeta explica cada parte con «Paso n de N», barra de progreso, Anterior/Siguiente, flechas del teclado y Esc.
- Se inicia solo la primera vez que alguien abre cada ventana (después de que termina de cargar) y queda disponible con el botón «Recorrido» abajo a la izquierda. «No mostrar automáticamente» desactiva el inicio automático en ese navegador. Respeta «reducir movimiento».
- Los pasos sin contenido visible (sin datos aún, vista móvil) se omiten; si no queda ninguno, se muestra un aviso (p. ej., carrito vacío). En móvil, el paso de filtros señala el botón «Filtros».
- Bug evitado (detectado al probar): si se pulsaba el botón justo al cargar la ventana, el recorrido se cerraba solo.
- Script `e2e/capture/tours.mjs` (`npm run capture:tours`) que captura cada paso de cada recorrido (89 pasos en escritorio y móvil, revisados uno por uno).
- Pruebas: shared 18/18, API 73/73, web 13/13 (3 nuevas), E2E 18/18 (3 nuevas: botón y pasos, inicio automático y su desactivación, recorrido en el teléfono).

## 2026-10-19 — Asistente virtual (chat bot)
- **Ventana de chat** («Asistente», abajo a la derecha) en el sitio público y el área del cliente; no aparece en los paneles del personal. Sugerencias rápidas, tarjetas de producto con enlace, botones de acción (WhatsApp de Juan, ver la orden, catálogo filtrado), indicador de escritura, nueva conversación, historial en la pestaña (sessionStorage) y diseño adaptado al teléfono. Paso nuevo en el recorrido guiado del inicio.
- **Datos reales, solo lectura** (`apps/api/src/services/assistant/tools.ts`): búsqueda en el catálogo por texto, uso, color y formato; ficha con guía de uso; cálculo de cajas con el mismo redondeo del carrito, precio BCV y bolívares; sede, horario, días de retiro, prepago, cancelaciones, métodos de pago activos (sin datos de recepción), tasa vigente y vendedores; órdenes del propio cliente con sesión (sin cédula).
- **Dos motores**: integrado (sin costo ni servicios externos; reconoce las consultas frecuentes y deriva lo demás al vendedor) y Claude (`claude-opus-5-5`, esfuerzo bajo, herramientas, `fallbacks: "default"`), que se activa con `ANTHROPIC_API_KEY`. Si Claude falla, responde el integrado. Límite de 15 mensajes por minuto e IP. Las conversaciones no se guardan.
- Revisado con el catálogo real de Barinas (18 preguntas tipo) y corregido: doble punto en el horario, prioridad de «pagar después» y «cancelar mi pedido», búsquedas sin coincidencias que devolvían el catálogo completo, consulta de envíos.
- **No verificado**: la integración con la API real de Claude (no hay clave en el entorno); está probada con un cliente simulado.
- Pruebas: shared 18/18, API 81/81 (8 nuevas), web 15/15 (2 nuevas), E2E 19/19 (1 nueva).

## 2026-10-20 — Portal de compra privado con enlace personal
- **Acceso por enlace**: el vendedor (o la administración, a nombre de un vendedor) genera en «Invitar clientes» un enlace personal de un solo uso (7 días por defecto, configurable) y lo envía por WhatsApp con el mensaje listo; ve si cada enlace está pendiente, usado, vencido o anulado, y puede anularlo. Solo se guarda el hash del enlace.
- **Bienvenida**: al abrirlo, el cliente ve quién lo invitó, registra sus cuatro datos una sola vez y queda con sesión en su dispositivo. El enlace se marca usado de forma condicional (dos aperturas simultáneas no crean dos cuentas) y se libera si el registro falla (p. ej., cédula ya registrada, que no abre el perfil ajeno).
- **Portal personal** en `/`: saludo, accesos rápidos (catálogo, carrito, compras, mensajes), órdenes en curso con progreso, su vendedor (el de su última orden o el que lo invitó), «volver a comprar» y destacadas. Menú del cliente: Inicio, Catálogo, Mis compras, Mensajes.
- **Privado**: sin sesión, todas las páginas muestran «Este portal es personal» con botón para pedir el enlace a Juan; la API rechaza registros sin invitación (`INVITE_REQUIRED`). Se puede volver al sitio público desde Configuración → Portal privado. El catálogo sigue en la API pública de solo lectura.
- Recorridos guiados nuevos: «Mi portal» e «Invitaciones al portal». Capturas regeneradas con el flujo nuevo (49).
- Pruebas: shared 18/18, API 87/87 (6 nuevas en `test/portal.test.ts`), web 15/15, E2E 20/20 (flujo de compra con enlace personal, invitaciones de Juan y aviso privado en el teléfono). Las pruebas E2E comparten una sesión de administración para no chocar con el límite de intentos de inicio de sesión.
