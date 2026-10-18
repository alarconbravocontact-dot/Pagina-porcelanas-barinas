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
npm run db:seed                   # categorías, administrador y métodos de pago inactivos
npm run db:seed:demo              # OPCIONAL: vendedores y productos de demostración (SKU DEMO-*)
npm run dev                       # API en :4000 y web en :5173 (proxy a la API)
```
Abra http://localhost:5173 e ingrese con `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

**Antes de vender**, el administrador debe: registrar la tasa BCV (Administración → Tasa BCV), escribir las instrucciones reales y activar los métodos de pago, crear vendedores, publicar productos con existencias y completar los datos de la sede, WhatsApp y políticas (Configuración).

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
