// Recorre la aplicación real y captura cada módulo. Uso: node e2e/capture/capture.mjs <carpeta-salida>
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:4200';
const OUT = path.resolve(process.argv[2] ?? 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const shots = [];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());

async function shot(page, id, title, group, opts = {}) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(350);
  const file = `${String(shots.length + 1).padStart(2, '0')}-${id}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: opts.full ?? true });
  shots.push({ file, title, group, mobile: !!opts.mobile, note: opts.note ?? '' });
  console.log('✓', file);
}

async function api(ctx, method, url, body) {
  const csrf = (await ctx.cookies(BASE)).find((c) => c.name === 'csrf_token')?.value ?? '';
  const res = await ctx.request.fetch(BASE + url, { method, data: body, headers: { 'x-csrf-token': csrf, 'idempotency-key': crypto.randomUUID() } });
  if (!res.ok()) throw new Error(`${method} ${url} → ${res.status()} ${await res.text()}`);
  return res.json();
}

async function login(page, email, password) {
  await page.goto(BASE + '/ingresar');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/ingresar'));
}

const browser = await chromium.launch();
const desktop = { viewport: { width: 1366, height: 860 }, locale: 'es-VE' };
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-VE' };

// ---------------- Preparación como administrador ----------------
const adminCtx = await browser.newContext(desktop);
const admin = await adminCtx.newPage();
await admin.goto(BASE + '/ingresar');
await shot(admin, 'login', 'Iniciar sesión', 'Acceso');
await login(admin, 'admin@porcelanas.local', 'AdminCaptura2026');
await api(adminCtx, 'POST', '/api/admin/rates', { rate: '36,5432', effectiveDate: today, sourceNote: 'Tasa de ejemplo para las capturas (no oficial)' });
const s = await api(adminCtx, 'GET', '/api/admin/settings');
// Se respeta el horario real (lunes a viernes); solo se quita la anticipación mínima para tener fechas cercanas.
await api(adminCtx, 'PUT', '/api/admin/settings/pickup', { ...s.pickup, minAdvanceHours: 0 });
await api(adminCtx, 'PUT', '/api/admin/settings/store', { ...s.store, name: 'Porcelanatos Barinas', tagline: '' });
const methods = await api(adminCtx, 'GET', '/api/admin/payment-methods');
for (const m of methods.filter((x) => x.kind === 'ZELLE' || x.kind === 'PAGO_MOVIL')) {
  await api(adminCtx, 'PUT', `/api/admin/payment-methods/${m.id}`, {
    kind: m.kind, name: m.name, currency: m.currency, instructions: m.instructions, proofInstructions: m.proofInstructions, buyerNote: 'Indique su número de orden en el concepto.',
    receivingDetails: 'DATOS DE EJEMPLO para las capturas — reemplazar por los datos reales de la tienda.', requiresProof: m.requiresProof, active: true, sortOrder: m.sortOrder,
  });
}
// Existencias de ejemplo y piezas destacadas (el catálogo PDF no trae existencias).
const prods = (await api(adminCtx, 'GET', '/api/admin/products?status=ACTIVE&pageSize=60&sort=name')).items;
const pick = (re) => prods.find((p) => re.test(p.name));
const featured = [/Calacatta|Carrara Polaris Pulido Slim/i, /Statuario Pulido$/i, /Amani Grey Pulido/i, /Napoles/i].map(pick).filter(Boolean);
for (const p of prods.slice(0, 40)) {
  await api(adminCtx, 'POST', `/api/admin/products/${p.id}/movements`, { type: 'RECEIPT', boxes: 60, reason: 'Existencia de ejemplo para capturas' });
}
for (const p of featured) {
  await api(adminCtx, 'POST', `/api/admin/products/${p.id}/movements`, { type: 'RECEIPT', boxes: 80, reason: 'Existencia de ejemplo para capturas' }).catch(() => undefined);
  const full = await api(adminCtx, 'GET', `/api/admin/products/${p.id}`);
  await api(adminCtx, 'PUT', `/api/admin/products/${p.id}`, {
    sku: full.sku, name: full.name, description: full.description, color: full.color, widthCm: full.widthCm, lengthCm: full.lengthCm, thicknessMm: full.thicknessMm,
    piecesPerBox: full.piecesPerBox, boxAreaM2: full.boxAreaM2, pricingBasis: 'M2', price: (full.priceM2Cents / 100).toFixed(2), priceBcv: (full.priceBcvM2Cents / 100).toFixed(2),
    finish: full.finish, finishNote: full.finishNote, slipRating: full.slipRating, usageGuide: full.usageGuide, antiSlip: full.antiSlip, status: 'ACTIVE', featured: true,
    categoryIds: full.categories.map((c) => c.id), lowStockThreshold: 10,
  });
}
// Activación de la cuenta de Juan Alarcon con su enlace de un solo uso.
const users = await api(adminCtx, 'GET', '/api/admin/users?role=SELLER');
const juanUser = users.find((u) => u.email === 'alarconbravocontact@gmail.com');
const link = await api(adminCtx, 'POST', `/api/admin/users/${juanUser.id}/activation-link`, {});
const juanCtx = await browser.newContext(desktop);
const juan = await juanCtx.newPage();
await juan.goto(BASE + link.path);
await juan.getByLabel('Nueva contraseña').waitFor();
await shot(juan, 'activacion', 'Activación de cuenta del vendedor (enlace de un solo uso)', 'Acceso');
await juan.getByLabel('Nueva contraseña').fill('JuanBarinas2026');
await juan.getByLabel('Repite la contraseña').fill('JuanBarinas2026');
await juan.getByRole('button', { name: 'Activar y entrar' }).click();
await juan.waitForURL(/\/vendedor$/);

// ---------------- Portal privado: el cliente entra con su enlace personal ----------------
const custCtx = await browser.newContext(desktop);
const c = await custCtx.newPage();
await c.goto(BASE + '/catalogo');
await c.getByTestId('private-portal').waitFor();
await shot(c, 'portal-privado', 'Sin enlace: aviso de portal privado y botón para pedir el enlace a Juan', 'Portal privado', { full: false });
await juan.goto(BASE + '/vendedor/invitaciones');
await juan.getByLabel('Nombre del cliente (opcional)').fill('María José Pérez');
await juan.getByLabel('Teléfono del cliente (opcional)').fill('0414 5551234');
await juan.getByRole('button', { name: 'Generar enlace personal' }).click();
await juan.getByTestId('invite-url').waitFor();
await shot(juan, 'vendedor-invitaciones', 'Juan genera el enlace personal de la clienta y lo envía por WhatsApp', 'Portal privado');
const inviteUrl = new URL(await juan.getByTestId('invite-url').innerText());
await c.goto(BASE + inviteUrl.pathname + inviteUrl.search);
await c.getByRole('form', { name: 'Tus datos' }).waitFor();
await shot(c, 'portal-bienvenida', 'La clienta abre su enlace: bienvenida y sus cuatro datos, una sola vez', 'Portal privado', { full: false });
const f = c.getByRole('form', { name: 'Tus datos' });
await f.getByLabel('Nombre completo').fill('María José Pérez');
await f.getByLabel('Ciudad').fill('Barinas');
await f.getByLabel('Zona o dirección de referencia').fill('Urb. Alto Barinas, calle 3');
await f.getByLabel('Teléfono').fill('0414 5551234');
await f.getByLabel('Cédula de identidad').fill('V-18456789');
await f.getByRole('button', { name: 'Entrar a mi portal' }).click();
await c.getByRole('heading', { name: 'Hola, María.' }).waitFor();
await shot(c, 'portal-inicio', 'Su portal recién abierto: accesos rápidos, vendedor y piezas destacadas', 'Portal privado');

// ---------------- Dentro del portal ----------------
await c.goto(BASE + '/catalogo');
await shot(c, 'catalogo', 'Catálogo con filtros (ambiente, color, tamaño, acabado, uso recomendado, agarre, precio)', 'Dentro del portal');
await c.goto(BASE + '/catalogo?use=ducha');
await shot(c, 'catalogo-ducha', 'Catálogo filtrado: recomendados para ducha (línea Slipstop R11)', 'Dentro del portal', { full: false });
const calc = featured[0];
await c.goto(BASE + `/producto/${calc.sku}`);
await c.getByLabel('Superficie a cubrir (m²)').fill('30');
await shot(c, 'producto', 'Ficha de producto con calculadora (30 m²), precio divisas/BCV y guía de uso', 'Dentro del portal');
await c.getByRole('button', { name: 'Agregar al carrito' }).click();
await c.getByText('Agregado al carrito').waitFor();
const second = featured[2] ?? featured[1];
await c.goto(BASE + `/producto/${second.sku}`);
await c.getByRole('radio', { name: 'Cajas' }).click();
await c.getByLabel('Cantidad de cajas').fill('6');
await c.getByRole('button', { name: 'Agregar al carrito' }).click();
await c.getByText('Agregado al carrito').waitFor();
await c.goto(BASE + '/carrito');
await shot(c, 'carrito', 'Carrito persistente con importes recalculados por el servidor', 'Dentro del portal');
await c.goto(BASE + '/contacto');
await shot(c, 'contacto', 'Contacto comercial: ficha de Juan Alarcon, WhatsApp y chat interno', 'Dentro del portal');
await c.goto(BASE + '/como-comprar');
await shot(c, 'como-comprar', 'Cómo comprar: modalidades, horarios de retiro y tasa', 'Dentro del portal');
await c.goto(BASE + '/politicas');
await shot(c, 'politicas', 'Políticas comerciales (derivadas de la configuración vigente)', 'Dentro del portal');
await c.goto(BASE + '/no-existe');
await shot(c, '404', 'Página no encontrada (404)', 'Dentro del portal', { full: false });

// ---------------- Compra ----------------
await c.goto(BASE + '/checkout');
await c.getByRole('button', { name: 'Corregir datos' }).waitFor();
await shot(c, 'checkout-datos', 'Orden de compra · paso 1: los datos que registró al entrar al portal', 'Compra', { full: false });
await c.getByLabel(/Confirmo que Juan Alarcon me atenderá/).check();
await c.locator('[role="radiogroup"][aria-label="Fecha de retiro"] button:not([disabled])').nth(2).click();
await c.getByRole('radio', { name: 'Zelle' }).check();
await c.getByLabel(/Acepto las/).check();
await shot(c, 'checkout-completo', 'Orden de compra: datos confirmados, vendedor, fecha, método de pago y resumen', 'Compra');
await c.getByRole('button', { name: 'Generar orden de compra' }).click();
await c.waitForURL(/nueva=1/);
const code1 = new URL(c.url()).pathname.split('/').pop();
await c.getByRole('heading', { name: 'Adjunta tu comprobante de pago' }).waitFor();
await shot(c, 'comprobante', 'Después de generar la orden: adjuntar el comprobante', 'Compra');
const order1 = await api(custCtx, 'GET', `/api/orders/${code1}`);
await c.getByLabel('Importe pagado (USD)').fill((order1.totalCents / 100).toFixed(2));
await c.getByLabel('Referencia de la operación').fill('ZL-88412');
await c.getByLabel('Comprobante').setInputFiles({ name: 'pago.png', mimeType: 'image/png', buffer: PNG });
await c.getByRole('button', { name: 'Registrar pago' }).click();
await c.getByRole('heading', { name: '¡Tu orden de compra ha sido registrada!' }).waitFor();
await shot(c, 'cartel', 'Cartel de confirmación: orden registrada, datos del vendedor y botón de WhatsApp', 'Compra', { full: false });

// Segunda orden con Pago Móvil (precio BCV) para mostrar un pago pendiente de revisión.
await c.goto(BASE + `/producto/${featured[1].sku}`);
await c.getByRole('radio', { name: 'Cajas' }).click();
await c.getByLabel('Cantidad de cajas').fill('4');
await c.getByRole('button', { name: 'Agregar al carrito' }).click();
await c.getByText('Agregado al carrito').waitFor();
await c.goto(BASE + '/checkout');
await c.getByRole('button', { name: 'Corregir datos' }).waitFor();
await c.getByLabel(/Confirmo que Juan Alarcon me atenderá/).check();
await c.locator('[role="radiogroup"][aria-label="Fecha de retiro"] button:not([disabled])').nth(4).click();
await c.getByRole('radio', { name: 'Pago Móvil' }).check();
await c.getByLabel(/Acepto las/).check();
await c.getByRole('button', { name: 'Generar orden de compra' }).click();
await c.waitForURL(/nueva=1/);
const code2 = new URL(c.url()).pathname.split('/').pop();
const order2 = await api(custCtx, 'GET', `/api/orders/${code2}`);
await c.getByLabel('Importe pagado (Bs)').fill((order2.totalVesCents / 100).toFixed(2));
await c.getByLabel('Referencia de la operación').fill('PM-004512');
await c.getByLabel('Comprobante').setInputFiles({ name: 'pago.png', mimeType: 'image/png', buffer: PNG });
await c.getByRole('button', { name: 'Registrar pago' }).click();
await c.getByRole('heading', { name: '¡Tu orden de compra ha sido registrada!' }).waitFor();

await c.goto(BASE + '/');
await c.getByRole('heading', { name: 'Órdenes en curso' }).waitFor();
await shot(c, 'portal-inicio-ordenes', 'Su portal con órdenes en curso, progreso, vendedor y «volver a comprar»', 'Portal privado');

// Chat cliente → vendedor
await api(custCtx, 'POST', '/api/conversations', { orderId: order1.id, message: 'Hola Juan, ¿puedo retirar el pedido en la tarde?' });

// ---------------- Panel del vendedor (Juan) ----------------
const convs = await api(juanCtx, 'GET', '/api/conversations');
await api(juanCtx, 'POST', `/api/conversations/${convs[0].id}/messages`, { body: 'Hola María, sí. Te espero en la sede de 2:00 a 5:00 pm. Trae tu número de orden.' });
const pays = await api(juanCtx, 'GET', '/api/staff/payments');
const p1 = pays.find((p) => p.order.code === code1);
await api(juanCtx, 'POST', `/api/staff/payments/${p1.id}/start-review`, {});
await api(juanCtx, 'POST', `/api/staff/payments/${p1.id}/review`, { decision: 'APPROVE', notes: 'Verificado' });
await juan.goto(BASE + '/vendedor');
await shot(juan, 'vendedor-operaciones', 'Panel del vendedor: órdenes asignadas con cliente, ubicación, productos, método y estado del pago', 'Panel del vendedor');
await juan.goto(BASE + `/vendedor/operaciones/${order1.id}`);
await shot(juan, 'vendedor-detalle', 'Detalle de la orden para el vendedor: progreso, cliente, cédula enmascarada, pagos e historial', 'Panel del vendedor');
await juan.goto(BASE + '/vendedor/pagos');
await shot(juan, 'vendedor-pagos', 'Revisión de comprobantes (pago con Pago Móvil pendiente)', 'Panel del vendedor');
await juan.goto(BASE + '/vendedor/retiros');
await shot(juan, 'vendedor-retiros', 'Calendario de retiros de las próximas dos semanas', 'Panel del vendedor');
await juan.goto(BASE + `/vendedor/chat/${convs[0].id}`);
await shot(juan, 'vendedor-chat', 'Atención por chat interno', 'Panel del vendedor', { full: false });

// ---------------- Área del cliente ----------------
await c.goto(BASE + `/cuenta/operaciones/${code1}`);
await shot(c, 'cliente-orden', 'Detalle de la orden para el cliente: progreso, pagos, vendedor y datos', 'Área del cliente');
await c.goto(BASE + '/cuenta');
await shot(c, 'cliente-resumen', 'Área del cliente: operaciones activas y vendedor asignado', 'Área del cliente');
await c.goto(BASE + '/cuenta/operaciones');
await shot(c, 'cliente-operaciones', 'Historial de compras y reservas', 'Área del cliente');
await c.goto(BASE + `/cuenta/chat/${convs[0].id}`);
await shot(c, 'cliente-chat', 'Chat interno con el vendedor', 'Área del cliente', { full: false });
await c.goto(BASE + '/cuenta/perfil');
await shot(c, 'cliente-perfil', 'Perfil: los cuatro datos y acceso opcional con correo', 'Área del cliente');

// ---------------- Administración ----------------
const adminPages = [
  ['/admin', 'admin-indicadores', 'Indicadores: ventas, m², cobros por moneda, retiros y stock bajo'],
  ['/admin/operaciones', 'admin-operaciones', 'Ventas y reservas'],
  ['/admin/pagos', 'admin-pagos', 'Comprobantes por revisar'],
  ['/admin/productos', 'admin-productos', 'Productos e inventario (catálogo de Barinas)'],
  [`/admin/productos/${calc.id}`, 'admin-producto', 'Edición de producto: precios divisas/BCV, guía de uso, fotos, inventario e historial'],
  ['/admin/vendedores', 'admin-vendedores', 'Vendedores y enlaces de activación'],
  ['/admin/usuarios', 'admin-usuarios', 'Usuarios y roles'],
  ['/admin/tasa', 'admin-tasa', 'Tasa BCV: registro manual auditado e historial'],
  ['/admin/metodos-pago', 'admin-metodos', 'Métodos de pago: configurados y pendientes de configuración'],
  ['/admin/configuracion', 'admin-configuracion', 'Configuración comercial'],
  ['/admin/auditoria', 'admin-auditoria', 'Auditoría de operaciones sensibles'],
];
for (const [url, id, title] of adminPages) {
  await admin.goto(BASE + url);
  await shot(admin, id, title, 'Administración');
}
await admin.goto(BASE + '/admin/configuracion');
await admin.getByRole('button', { name: 'Días, horarios y capacidad' }).click();
await shot(admin, 'admin-horarios', 'Configuración: días, horarios y capacidad de retiro', 'Administración');
await admin.goto(BASE + '/admin/metodos-pago');
await admin.locator('button.card', { hasText: 'Zelle' }).click();
await shot(admin, 'admin-metodo-editar', 'Edición de un método de pago (instrucciones y datos de recepción)', 'Administración');

// ---------------- Móvil ----------------
const mCtx = await browser.newContext(mobile);
await mCtx.addCookies(await custCtx.cookies(BASE));
const m = await mCtx.newPage();
for (const [url, id, title] of [
  ['/', 'movil-inicio', 'Mi portal en el teléfono'],
  ['/catalogo', 'movil-catalogo', 'Catálogo en el teléfono'],
  [`/producto/${calc.sku}`, 'movil-producto', 'Ficha de producto en el teléfono'],
  [`/cuenta/operaciones/${code2}?nueva=1`, 'movil-cartel', 'Cartel de orden registrada en el teléfono'],
  [`/cuenta/operaciones/${code1}`, 'movil-orden', 'Detalle de la orden en el teléfono'],
]) {
  await m.goto(BASE + url);
  await shot(m, id, title, 'Móvil', { mobile: true, full: id !== 'movil-cartel' });
}
// Enlace personal abierto en el teléfono (nueva invitación; la pantalla se captura sin completarla).
const mInvite = await api(juanCtx, 'POST', '/api/staff/invites', { name: 'Pedro Rivas' });
const mNew = await browser.newContext(mobile);
const mn = await mNew.newPage();
await mn.goto(BASE + '/catalogo');
await mn.getByTestId('private-portal').waitFor();
await shot(mn, 'movil-privado', 'Portal privado en el teléfono (sin enlace)', 'Móvil', { mobile: true, full: false });
await mn.goto(BASE + mInvite.path);
await mn.getByRole('form', { name: 'Tus datos' }).waitFor();
await shot(mn, 'movil-datos', 'Enlace personal abierto en el teléfono: bienvenida y los cuatro datos', 'Móvil', { mobile: true, full: false });

fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ code1, code2, shots }, null, 1));
await browser.close();
console.log(`Listo: ${shots.length} capturas en ${OUT}`);
