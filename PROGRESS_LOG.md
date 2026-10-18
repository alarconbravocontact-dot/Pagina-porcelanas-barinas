# Registro de avance

## 2026-10-18 — Auditoría inicial
- El directorio de trabajo estaba vacío: no había código, Git, dependencias ni configuración previa que conservar.
- Entorno disponible: Node 22, npm 10, PostgreSQL 16 local, Chromium para Playwright.
- Decisión de arquitectura: monorepo npm workspaces con `packages/shared` (contratos Zod + cálculos), `apps/api` (Fastify + Prisma + Socket.IO) y `apps/web` (React + Vite).
- El portal del BCV (`www.bcv.org.ve`) no es accesible desde este entorno (proxy 403). El integrador automático se implementó contra la estructura conocida del portal y se dejó desactivado por defecto; la tasa manual autorizada es el flujo principal.

## Bloques A–E (backend) — completados y probados
- Esquema relacional con 27 modelos, migración versionada `20261018210412_init` con restricciones CHECK (stock no negativo, reservas ≤ existencias, importes positivos) e índice único parcial para referencias de pago aprobadas.
- API: catálogo con filtros, administración de productos/fotos/inventario/precios, cotización persistida con tasa, carrito persistente (visitante → usuario), checkout transaccional con vendedor obligatorio, reservas con cupo diario, pagos con comprobantes privados y revisión manual, chat con Socket.IO, notificaciones, indicadores y auditoría.
- Pruebas: 15 unitarias (shared) + 55 de integración (API sobre PostgreSQL real, base de datos nueva por ejecución). Todas pasan.
- Bugs detectados por las pruebas y corregidos: vista de carrito vacía tras el primer artículo de un visitante; bytes nulos en URL provocaban 500; carrera de idempotencia en pagos concurrentes con la misma clave.
