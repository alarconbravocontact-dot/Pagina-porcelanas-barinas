# Plataforma de venta de porcelanatos

Catálogo, cotización por caja o m², carrito, compra con retiro programado, prepago con reserva, pagos con comprobantes privados y verificación manual, chat cliente‑vendedor en tiempo real, panel de vendedor y panel administrativo.

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite 6 + React Router 7 + TanStack Query 5 + Tailwind 3 |
| Backend | Node 22 + Fastify 5 + Socket.IO 4 + Zod |
| Base de datos | PostgreSQL 14+ con Prisma 6 (migraciones versionadas) |
| Compartido | `packages/shared`: contratos Zod, cálculos monetarios (decimal.js, céntimos enteros), permisos, fechas |
| Pruebas | Vitest (unitarias e integración sobre PostgreSQL real), Playwright (E2E) |

Más detalle: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Despliegue: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · Avance: [PROGRESS_LOG.md](PROGRESS_LOG.md)

## Requisitos
- Node.js 20 o superior (probado con 22) y npm 10.
- PostgreSQL 14 o superior. El usuario de la base de datos necesita permiso `CREATEDB` **solo** para ejecutar las pruebas (cada ejecución crea y elimina su propia base temporal).

## Instalación y ejecución local
```bash
cp .env.example .env              # complete DATABASE_URL y SEED_ADMIN_PASSWORD
npm ci                            # instala dependencias (usa legacy-peer-deps desde .npmrc)
npm run db:deploy                 # aplica migraciones (no destructivo)
npm run db:seed                   # categorías, administrador, métodos de pago, vendedor Juan Alarcon y catálogo de Barinas
npm run user:activation-link -- alarconbravocontact@gmail.com   # enlace de un solo uso para que Juan defina su contraseña
npm run db:seed:demo              # OPCIONAL (solo pruebas): vendedores y productos de demostración (SKU DEMO-*)
npm run dev                       # API en :4000 y web en :5173 (proxy a la API)
```
Abra http://localhost:5173 e ingrese con `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

**Antes de vender**, el administrador debe:
1. Registrar la tasa BCV (Administración → Tasa BCV).
2. Completar los **datos de recepción** de cada método de pago (Administración → Métodos de pago). Mientras estén vacíos, el método aparece como “pendiente de configuración” y no se puede elegir ni usar para pagar. Efectivo está desactivado hasta que se habilite.
3. Cargar las **existencias** de los productos del catálogo (Productos → Inventario → Entrada de mercancía): el catálogo PDF no las incluye y se importan en 0.
4. Revisar los 5 productos importados en **borrador** (80×160 y 90×180): el catálogo indica 1,44 m² por caja, lo que no coincide con el tamaño de la pieza.
5. Generar el enlace de activación de Juan Alarcon (Vendedores → “Generar enlace de activación” o el comando anterior).
6. Completar dirección, horario y políticas de la sede (Configuración).

### Compra sin cuenta (4 datos)
El cliente compra sin correo ni contraseña: en el checkout ingresa **nombre completo, ubicación (ciudad y zona), teléfono y cédula**. El servidor crea su perfil y abre una sesión segura (cookie httpOnly) en ese dispositivo; en las siguientes compras sus datos se reutilizan y puede corregirlos. La cédula es única y **nunca** sirve para iniciar sesión. Para entrar desde otro dispositivo, el vendedor genera un enlace de acceso de un solo uso desde el detalle de la orden, o el cliente agrega correo y contraseña en su perfil.

Tras generar la orden se pide el comprobante (si el método lo requiere) y luego se muestra el cartel “¡Tu orden de compra ha sido registrada!” con los datos del vendedor y el botón de WhatsApp con el número de orden.

### Datos del negocio incluidos
- **Vendedor**: Juan Alarcon · Sede Barinas, Venezuela · +58 412-5552594 (WhatsApp `584125552594`) · alarconbravocontact@gmail.com · activo, con permiso para revisar pagos. La cuenta se crea **sin contraseña** y se activa con un enlace de un solo uso.
- **Catálogo**: 72 productos de `CATALOGO_PORCELANATOS_BARINAS_guia_de_uso.pdf` (`apps/api/prisma/data/`), con precio por m² en divisas y precio BCV, formato, piezas y m² por caja, clasificación antideslizante, guía de uso por ambiente y 70 fotografías. Los SKU (`BRN-NN-ANCHOxLARGO`) son provisionales y editables. El color se deriva del nombre o, si no lo indica, del tono de la foto.
- **Listas de precios**: la moneda del método de pago define el precio de la operación. Métodos en USD (Zelle, Binance, efectivo) → precio en divisas; métodos en Bs (Pago Móvil, transferencia) → precio BCV × tasa. Los pagos deben registrarse en la moneda de la lista elegida.

### Producción local (un solo proceso)
```bash
npm run build && npm start        # la API sirve también el frontend compilado en :4000
```

## Pruebas
```bash
npm run typecheck
npm test            # shared (unitarias) + API (integración, PostgreSQL real) + web (unitarias)
npm run build && npm run test:e2e   # Playwright: compra completa, revisión de pago, vendedor, 404, recuperación de errores, responsive
```
Variables opcionales para pruebas: `TEST_ADMIN_DATABASE_URL` y `E2E_ADMIN_DATABASE_URL` (por defecto `postgresql://porcelana:porcelana@localhost:5432/postgres`).

## Variables de entorno
Ver [.env.example](.env.example). Ninguna contiene secretos por defecto.

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión PostgreSQL (obligatoria) |
| `PORT`, `HOST` | Puerto y host del servidor |
| `PUBLIC_ORIGIN` | Origen del frontend (CORS de Socket.IO en desarrollo) |
| `COOKIE_SECURE` | `true` en producción con HTTPS |
| `TRUST_PROXY` | `true` detrás de Nginx/Caddy/etc. |
| `SESSION_TTL_HOURS` | Duración de la sesión (por defecto 168 h) |
| `CUSTOMER_SESSION_TTL_DAYS` | Sesión de clientes sin contraseña (por defecto 180 días) |
| `STORAGE_DIR` | Raíz de archivos: `public/` (fotos) y `private/` (comprobantes) |
| `BUSINESS_TIMEZONE` | Zona horaria comercial inicial (`America/Caracas`) |
| `JOBS_ENABLED`, `JOBS_INTERVAL_SECONDS` | Tareas: vencimiento de reservas, retiros vencidos, consulta de tasa |
| `RATE_LIMIT_MAX` | Solicitudes por minuto e IP |
| `WEB_DIST_DIR` | Ruta del frontend compilado (opcional) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_DEMO_PASSWORD` | Solo para las semillas |

## Integraciones externas pendientes
- **Tasa BCV automática**: implementada contra la estructura del portal del BCV pero **no verificada** en vivo (el portal no era accesible desde el entorno de desarrollo). Está desactivada por defecto; el registro manual auditado es el flujo principal.
- **Pasarelas de pago**: no existen APIs oficiales integradas. Pago Móvil, Zelle, Binance, transferencia y efectivo funcionan con **verificación manual** real; nunca se confirman automáticamente.
- **WhatsApp**: botón `wa.me` con mensaje prellenado; requiere configurar el número. No se usa la API de WhatsApp Business.
- No se envían correos ni SMS; las notificaciones son internas (campana y tiempo real).
