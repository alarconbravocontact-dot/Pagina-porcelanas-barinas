import { expect, test, type Page } from '@playwright/test';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());

async function login(page: Page, email: string, password: string) {
  await page.goto('/ingresar');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/ingresar'));
}

test.describe.serial('flujo completo de compra', () => {
  let code = '';

  test('el administrador registra la tasa y configura el calendario', async ({ page }) => {
    await login(page, 'admin@e2e.local', 'AdminE2E2026');
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto('/admin/tasa');
    await expect(page.getByText('No hay tasa registrada')).toBeVisible();
    await page.getByLabel('Bs por 1 USD').fill('36,5432');
    await page.getByLabel('Fecha valor').fill(today());
    await page.getByLabel('Fuente / referencia').fill('Publicación oficial (prueba E2E)');
    await page.getByRole('button', { name: 'Registrar', exact: true }).click();
    await expect(page.getByText('Tasa registrada.', { exact: true })).toBeVisible();
    await expect(page.getByText('Bs. 36,5432').first()).toBeVisible();
    // Habilitar todos los días para que la prueba no dependa del día de la semana.
    await page.goto('/admin/configuracion');
    await page.getByRole('button', { name: 'Días, horarios y capacidad' }).click();
    for (const day of ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']) {
      await page.getByLabel(`Atiende ${day}`).check();
    }
    await page.getByLabel('Anticipación mínima (horas)').fill('0');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Configuración guardada.')).toBeVisible();
  });

  test('el cliente registra 4 datos, genera la orden con Juan y ve el cartel de confirmación', async ({ page }) => {
    await page.goto('/catalogo?q=calacatta');
    await page.getByRole('link', { name: /Calacatta Blanco/ }).first().click();
    await page.getByLabel('Superficie a cubrir (m²)').fill('30');
    // 30 m² / 1,44 m² por caja = 20,83 -> 21 cajas = 30,24 m²
    await expect(page.locator('dd', { hasText: /^21$/ })).toBeVisible();
    await expect(page.getByText('30,24 m²')).toBeVisible();
    await page.getByRole('button', { name: 'Agregar al carrito' }).click();
    await expect(page.getByText('Agregado al carrito')).toBeVisible();
    await page.goto('/carrito');
    await page.getByRole('link', { name: 'Continuar con la compra' }).click();
    await expect(page).toHaveURL(/\/checkout/);
    // Primer ingreso: solo los cuatro datos, sin correo ni contraseña.
    const form = page.getByRole('form', { name: 'Tus datos' });
    await expect(form.getByLabel(/correo/i)).toHaveCount(0);
    await form.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('Escriba su nombre y apellido')).toBeVisible();
    await form.getByLabel('Nombre completo').fill('María José Pérez');
    await form.getByLabel('Ciudad').fill('Barinas');
    await form.getByLabel('Zona o dirección de referencia').fill('Urb. Alto Barinas, calle 3');
    await form.getByLabel('Teléfono').fill('0414 5551234');
    await form.getByLabel('Cédula de identidad').fill(`V-${20000000 + Math.floor(Math.random() * 9000000)}`);
    await form.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('button', { name: 'Corregir datos' })).toBeVisible();
    await expect(page.getByText(/V-\*{4}\d{4}/)).toBeVisible();
    // Sin vendedor no se puede generar la orden.
    await page.getByLabel(/Acepto las/).check();
    await page.getByRole('button', { name: 'Generar orden de compra' }).click();
    await expect(page.getByText('Seleccione el vendedor que lo atenderá en la sede')).toBeVisible();
    await page.getByRole('radio', { name: 'Juan Alarcon' }).check();
    await page.getByLabel(/Confirmo que Juan Alarcon me atenderá/).check();
    await page.locator('[role="radiogroup"][aria-label="Fecha de retiro"] button:not([disabled])').nth(1).click();
    await page.getByRole('radio', { name: 'Zelle' }).check();
    await expect(page.getByText('Cómo pagar con Zelle')).toBeVisible();
    await expect(page.getByText('Datos de recepción', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Generar orden de compra' }).click();
    await page.waitForURL(/\/cuenta\/operaciones\/PC-[A-Z0-9]+\?nueva=1/);
    code = new URL(page.url()).pathname.split('/').pop()!;
    // Paso del comprobante antes del cartel.
    await expect(page.getByRole('heading', { name: 'Adjunta tu comprobante de pago' })).toBeVisible();
    await expect(page.getByText('¡Tu orden de compra ha sido registrada!')).toHaveCount(0);
    await page.getByLabel('Importe pagado (USD)').fill('559.44');
    await page.getByLabel('Referencia de la operación').fill(`ZL-${Date.now()}`);
    await page.getByLabel('Comprobante').setInputFiles({ name: 'pago.png', mimeType: 'image/png', buffer: PNG });
    await page.getByRole('button', { name: 'Registrar pago' }).click();
    // Cartel posterior a la confirmación del servidor.
    await expect(page.getByRole('heading', { name: '¡Tu orden de compra ha sido registrada!' })).toBeVisible();
    await expect(page.getByTestId('banner-order-code')).toHaveText(code);
    if (process.env.E2E_SCREENSHOTS) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/cartel-movil.png`, fullPage: true });
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    await expect(page.getByText('Para garantizar una atención adecuada, antes de dirigirte a nuestra sede en Barinas, debes contactar a tu vendedor asignado para que esté preparado para recibirte y atender tu pedido.')).toBeVisible();
    await expect(page.getByText('04125552594').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'alarconbravocontact@gmail.com' }).first()).toHaveAttribute('href', 'mailto:alarconbravocontact@gmail.com');
    const wa = page.getByTestId('banner-whatsapp');
    await expect(wa).toHaveText(/Contactar a mi vendedor por WhatsApp/i);
    const href = (await wa.getAttribute('href'))!;
    expect(href.startsWith('https://wa.me/584125552594?text=')).toBe(true);
    expect(decodeURIComponent(href)).toContain(`Hola, Juan. Acabo de realizar una orden de compra de porcelanas en la plataforma. Mi número de orden es ${code}.`);
    await expect(page.getByText('Comprobante recibido', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/no significa que el pago haya sido aprobado/)).toBeVisible();
    // Ver mi orden: detalle real con productos, importes y estados separados.
    await page.getByRole('button', { name: 'Ver mi orden de compra' }).click();
    await expect(page).not.toHaveURL(/nueva=1/);
    await expect(page.getByRole('heading', { name: code })).toBeVisible();
    await expect(page.getByText('Orden registrada').first()).toBeVisible();
    await expect(page.getByText('$ 559,44').first()).toBeVisible();
    await expect(page.getByText('Calacatta Blanco (demo)').first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: code })).toBeVisible();
    // Reutilización del perfil: una nueva compra no vuelve a pedir los datos.
    await page.goto('/producto/DEMO-GRI-6060');
    await page.getByRole('radio', { name: 'Cajas' }).click();
    await page.getByLabel('Cantidad de cajas').fill('1');
    await page.getByRole('button', { name: 'Agregar al carrito' }).click();
    await expect(page.getByText('Agregado al carrito')).toBeVisible();
    await page.goto('/checkout');
    await expect(page.getByRole('button', { name: 'Corregir datos' })).toBeVisible();
    await expect(page.getByRole('form', { name: 'Tus datos' })).toHaveCount(0);
  });

  test('el administrador revisa y confirma el pago: el pedido pasa a preparación', async ({ page }) => {
    await login(page, 'admin@e2e.local', 'AdminE2E2026');
    await page.goto('/admin/pagos');
    const card = page.locator('.card', { hasText: code });
    await expect(card.getByRole('img', { name: 'Comprobante de pago' })).toBeVisible();
    await card.getByRole('button', { name: 'Iniciar revisión' }).click();
    await expect(card.getByText(/En revisión desde/)).toBeVisible();
    await card.getByRole('button', { name: 'Aprobar pago' }).click();
    await expect(page.locator('.card', { hasText: code })).toHaveCount(0);
    await page.goto('/admin/operaciones');
    await page.getByRole('link', { name: code }).click();
    await expect(page.getByText('Pedido en preparación').first()).toBeVisible();
    await expect(page.getByText('Pago confirmado').first()).toBeVisible();
  });

  test('Juan activa su cuenta y ve la orden asignada con los datos del cliente', async ({ page, browser }) => {
    await login(page, 'admin@e2e.local', 'AdminE2E2026');
    await page.goto('/admin/vendedores');
    const row = page.locator('.card', { hasText: 'alarconbravocontact@gmail.com' });
    await row.getByRole('button', { name: 'Generar enlace de activación' }).click();
    const link = await row.locator('code').innerText();
    const ctx = await browser.newContext();
    const juan = await ctx.newPage();
    await juan.goto(link.replace(/^https?:\/\/[^/]+/, ''));
    await juan.getByLabel('Nueva contraseña').fill('JuanBarinas2026');
    await juan.getByLabel('Repite la contraseña').fill('JuanBarinas2026');
    await juan.getByRole('button', { name: 'Activar y entrar' }).click();
    await expect(juan).toHaveURL(/\/vendedor$/);
    const orderRow = juan.locator('tr', { hasText: code });
    await expect(orderRow).toContainText('María José Pérez');
    await expect(orderRow).toContainText('+584145551234');
    await expect(orderRow).toContainText('Barinas · Urb. Alto Barinas, calle 3');
    await expect(orderRow).toContainText('21 cj · Calacatta Blanco (demo)');
    await expect(orderRow).toContainText('Zelle');
    await orderRow.getByRole('link', { name: code }).click();
    await expect(juan.getByText(/Cédula: V-\*{4}\d{4}/)).toBeVisible();
    await juan.getByRole('button', { name: 'ver completa' }).click();
    await expect(juan.getByText(/Cédula: V-\d{8}/)).toBeVisible();
    await juan.getByRole('button', { name: 'Marcar lista para retiro' }).click();
    await expect(juan.getByText('Listo para retirar').first()).toBeVisible();
    await expect(juan.getByText('Orden de compra registrada').first()).toBeVisible();
    await ctx.close();
  });
});

test('recuperación ante errores de la API', async ({ page }) => {
  let fail = true;
  await page.route('**/api/catalog?*', (route) => (fail ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"code":"INTERNAL","message":"Fallo simulado"}}' }) : route.continue()));
  await page.goto('/catalogo');
  await expect(page.getByText('No se pudo cargar la información')).toBeVisible({ timeout: 15_000 });
  fail = false;
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('link', { name: /Calacatta Blanco/ }).first()).toBeVisible();
});

test('una ruta inexistente muestra la página 404', async ({ page }) => {
  await page.goto('/no-existe');
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
});

test.describe('vendedor Juan Alarcon y catálogo de Barinas', () => {
  test('aparece con sus datos y WhatsApp en el inicio, contacto y checkout', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('div', { has: page.getByText('Juan Alarcon', { exact: true }) }).filter({ hasText: 'alarconbravocontact@gmail.com' }).last();
    await expect(card).toBeVisible();
    await expect(card.getByRole('link', { name: 'alarconbravocontact@gmail.com' })).toHaveAttribute('href', 'mailto:alarconbravocontact@gmail.com');
    await expect(card.getByRole('link', { name: /WhatsApp de Juan/ })).toHaveAttribute('href', /^https:\/\/wa\.me\/584125552594\?text=/);
    await expect(card.getByText('+58 412-5552594')).toBeVisible();
    await page.goto('/contacto');
    await expect(page.getByText('Sede Barinas, Venezuela')).toBeVisible();
  });

  test('las piezas del catálogo muestran precio en divisas, precio BCV y guía de uso', async ({ page }) => {
    await page.goto('/catalogo?use=ducha');
    await expect(page.getByText('3 productos')).toBeVisible();
    await page.goto('/producto/BRN-01-60X60');
    await expect(page.getByRole('heading', { name: 'Porcelanico Sal Soluble Napoles Slim' })).toBeVisible();
    await expect(page.getByText('$ 25,11').first()).toBeVisible();
    await expect(page.getByText(/Precio BCV \(pago en Bs\): \$ 30,20/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dónde instalarlo' })).toBeVisible();
    await expect(page.getByText('Resbaladizo').first()).toBeVisible();
    // Sin existencias cargadas: no se puede agregar, pero se puede consultar por WhatsApp con el contexto del producto.
    await expect(page.getByRole('button', { name: 'Agotado' })).toBeDisabled();
    await expect(page.getByTestId('whatsapp-link').first()).toHaveAttribute('href', /Napoles/);
  });

});
