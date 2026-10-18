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
