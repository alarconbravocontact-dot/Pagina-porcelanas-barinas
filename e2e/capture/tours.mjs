// Captura cada paso del recorrido guiado de cada ventana. Requiere el servidor de capturas con los
// datos que deja capture.mjs. Uso: node e2e/capture/tours.mjs <carpeta-salida>
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:4200';
const OUT = path.resolve(process.argv[2] ?? 'recorridos');
fs.mkdirSync(OUT, { recursive: true });
const shots = [];

async function api(ctx, method, url, body) {
  const csrf = (await ctx.cookies(BASE)).find((c) => c.name === 'csrf_token')?.value ?? '';
  const res = await ctx.request.fetch(BASE + url, { method, data: body, headers: { 'x-csrf-token': csrf } });
  if (!res.ok()) throw new Error(`${method} ${url} → ${res.status()} ${await res.text()}`);
  return res.json();
}

async function login(ctx, email, password) {
  const page = await ctx.newPage();
  await page.goto(BASE + '/ingresar');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/ingresar'));
  return page;
}

/** Abre el recorrido de la ventana actual y captura cada paso hasta terminar. */
async function walk(page, url, { mobile = false } = {}) {
  await page.goto(BASE + url);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.getByTestId('tour-launcher').click();
  const tour = page.getByTestId('tour');
  await tour.waitFor();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1100);
    const label = await tour.locator('.eyebrow').innerText();
    const title = await tour.locator('#tour-title').innerText();
    const file = `${String(shots.length + 1).padStart(3, '0')}.png`;
    await page.screenshot({ path: path.join(OUT, file) });
    shots.push({ file, url, label, title, mobile });
    console.log('✓', file, label, '—', title);
    const next = tour.getByRole('button', { name: /Siguiente|Terminar/ });
    const done = /terminar/i.test(await next.innerText());
    await next.click();
    if (done) break;
  }
  await tour.waitFor({ state: 'detached' });
}

const browser = await chromium.launch();
const desktop = { viewport: { width: 1366, height: 860 }, locale: 'es-VE' };
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-VE' };

const adminCtx = await browser.newContext(desktop);
const admin = await login(adminCtx, 'admin@porcelanas.local', 'AdminCaptura2026');
const juanCtx = await browser.newContext(desktop);
const juan = await login(juanCtx, 'alarconbravocontact@gmail.com', 'JuanBarinas2026');
const orders = await api(juanCtx, 'GET', '/api/staff/orders');
const first = orders.items[0];
const access = await api(juanCtx, 'POST', `/api/staff/orders/${first.id}/access-link`, {});
const custCtx = await browser.newContext(desktop);
const cust = await custCtx.newPage();
await cust.goto(BASE + access.path);
await cust.waitForURL((u) => u.pathname.startsWith('/cuenta'));
const product = (await api(custCtx, 'GET', '/api/catalog?pageSize=24')).items.find((p) => p.availableBoxes > 0);

// Primera visita: el recorrido se inicia solo (se simula un navegador normal, sin webdriver).
const fresh = await browser.newContext(desktop);
await fresh.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
const f = await fresh.newPage();
await f.goto(BASE + '/');
await f.getByTestId('tour').waitFor({ timeout: 8000 });
await f.waitForTimeout(1100);
await f.screenshot({ path: path.join(OUT, '000-auto.png') });
console.log('✓ 000-auto.png (inicio automático)');

// Carrito con un producto para recorrer el carrito y la orden de compra; se vacía al terminar.
await api(custCtx, 'POST', '/api/cart/items', { productId: product.id, mode: 'M2', quantity: 12 });
for (const url of ['/carrito', '/checkout']) await walk(cust, url);
await api(custCtx, 'DELETE', '/api/cart');
await walk(cust, '/carrito');
for (const url of ['/', '/catalogo', `/producto/${product.sku}`, '/como-comprar', '/contacto', '/politicas', '/cuenta', '/cuenta/operaciones', `/cuenta/operaciones/${first.code}`, '/cuenta/chat', '/cuenta/perfil']) {
  await walk(cust, url);
}
for (const url of ['/vendedor', `/vendedor/operaciones/${first.id}`, '/vendedor/pagos', '/vendedor/retiros', '/vendedor/chat']) await walk(juan, url);
for (const url of ['/admin', '/admin/operaciones', '/admin/productos', `/admin/productos/${product.id}`, '/admin/vendedores', '/admin/usuarios', '/admin/tasa', '/admin/metodos-pago', '/admin/configuracion', '/admin/auditoria']) {
  await walk(admin, url);
}
const mCtx = await browser.newContext(mobile);
await mCtx.addCookies(await custCtx.cookies(BASE));
const m = await mCtx.newPage();
for (const url of ['/', '/catalogo', `/cuenta/operaciones/${first.code}`]) await walk(m, url, { mobile: true });

fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(shots, null, 1));
await browser.close();
console.log(`Listo: ${shots.length} pasos en ${OUT}`);
