# Despliegue a producción

> Estado: la aplicación está probada (unitarias, integración y E2E) pero **no está lista para producción** hasta completar la lista de verificación de abajo. El `Dockerfile` y `docker-compose.yml` se incluyen, pero no pudieron construirse en el entorno de desarrollo (sin demonio Docker); verifíquelos antes de usarlos.

## Opción A: Node + PostgreSQL gestionado
1. Provisione PostgreSQL 14+ y cree una base y un usuario dedicados (sin `CREATEDB` en producción).
2. Configure variables de entorno (ver `.env.example`): `NODE_ENV=production`, `DATABASE_URL`, `COOKIE_SECURE=true`, `TRUST_PROXY=true` si hay proxy inverso, `STORAGE_DIR` en un disco persistente, `BUSINESS_TIMEZONE`.
3. `npm ci && npm run build`
4. `npm run db:deploy` (aplica migraciones; nunca use `migrate reset` ni `migrate dev` en producción).
5. `SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… npm run db:seed` una sola vez. **No** ejecute `db:seed:demo` en producción.
6. `npm start` bajo un gestor de procesos (systemd, PM2) detrás de Nginx/Caddy con HTTPS. El proxy debe reenviar WebSocket en `/socket.io`.

Ejemplo Nginx (fragmento):
```nginx
location / {
  proxy_pass http://127.0.0.1:4000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  client_max_body_size 25m;
}
```

## Opción B: Docker Compose
```bash
export POSTGRES_PASSWORD=... SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=...
docker compose up -d --build
docker compose exec app npx tsx prisma/seed.ts   # semilla base, una vez
```

## Almacenamiento
- `STORAGE_DIR/public`: fotos de productos e imagen principal, servidas en `/media`.
- `STORAGE_DIR/private`: comprobantes de pago; nunca se sirven estáticamente. Respalde este directorio junto con la base de datos y restrinja permisos del sistema de archivos.
- Con varias instancias, el directorio debe ser compartido (NFS/volumen) o migrarse a un almacenamiento de objetos privado (no implementado).

## Escalado y tiempo real
Socket.IO funciona en un solo proceso. Para varias instancias se requiere un adaptador (p. ej. `@socket.io/redis-adapter`) y sesiones fijas; no está implementado. Las tareas programadas son seguras ante ejecución concurrente (actualizaciones condicionales), pero conviene ejecutarlas en una sola instancia (`JOBS_ENABLED=false` en las demás).

## Lista de verificación antes de vender
- [ ] HTTPS activo y `COOKIE_SECURE=true`.
- [ ] Tasa BCV registrada y procedimiento diario definido (manual o consulta automática verificada con el portal real).
- [ ] Métodos de pago con instrucciones reales y activados; textos de demostración eliminados.
- [ ] Vendedores reales creados; productos de demostración (`DEMO-*`) desactivados o no sembrados.
- [ ] Datos de la sede, WhatsApp, horarios, capacidad, días bloqueados y políticas (cancelación, devoluciones, privacidad) aprobados por el negocio y, si aplica, revisados legalmente.
- [ ] Respaldos automáticos de PostgreSQL y de `STORAGE_DIR`.
- [ ] Monitoreo de logs y de `/api/health`.
- [ ] Revisión de las advertencias de `npm audit` (ver PROGRESS_LOG).
- [ ] Asistente virtual: decidir si se usa Claude (`ANTHROPIC_API_KEY`, con límite de gasto en la consola de Anthropic) o el motor integrado, y probarlo con preguntas reales de clientes.
