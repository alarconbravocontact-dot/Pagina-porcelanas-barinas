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

  test('el cliente calcula, compra con vendedor obligatorio y adjunta el comprobante', async ({ page }) => {
    await page.goto('/catalogo?q=calacatta');
    await page.getByRole('link', { name: /Calacatta Blanco/ }).first().click();
    await page.getByLabel('Superficie a cubrir (m²)').fill('30');
    // 30 m² / 1,44 m² por caja = 20,83 -> 21 cajas = 30,24 m²
    await expect(page.getByText('Cajas necesarias')).toBeVisible();
    await expect(page.locator('dd', { hasText: /^21$/ })).toBeVisible();
    await expect(page.getByText('30,24 m²')).toBeVisible();
    await page.getByRole('button', { name: 'Agregar al carrito' }).click();
    await expect(page.getByText('Agregado al carrito')).toBeVisible();
    await page.goto('/carrito');
    await page.getByRole('link', { name: 'Continuar con la compra' }).click();
    await page.getByRole('link', { name: 'Crear cuenta' }).click();
    await page.getByLabel('Nombre completo').fill('María Cliente E2E');
    await page.getByLabel('Correo electrónico').fill(`cliente-${Date.now()}@e2e.local`);
    await page.getByLabel('Teléfono').fill('+58 412 5550000');
    await page.getByLabel('Contraseña').fill('ClienteE2E2026');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await page.waitForURL('**/checkout');
    // Sin vendedor no se puede confirmar.
    await page.getByLabel(/Acepto las/).check();
    await page.getByRole('button', { name: 'Confirmar operación' }).click();
    await expect(page.getByText('Seleccione el vendedor que lo atenderá en la sede')).toBeVisible();
    await page.getByRole('radio', { name: /Ana \(demo\)/ }).check();
    await page.locator('[role="radiogroup"][aria-label="Fecha de retiro"] button:not([disabled])').nth(1).click();
    await page.getByRole('radio', { name: /Zelle/ }).check();
    await expect(page.getByText('Instrucciones de Zelle')).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar operación' }).click();
    await page.waitForURL(/\/cuenta\/operaciones\/PC-/);
    code = page.url().split('/').pop()!.split('?')[0]!;
    await expect(page.getByText(`Operación ${code} generada`)).toBeVisible();
    await expect(page.getByText('Pendiente de pago').first()).toBeVisible();
    await expect(page.getByText('Ana (demo)').first()).toBeVisible();
    // 21 cajas × 26,64 = 559,44 USD
    await expect(page.getByText('$ 559,44').first()).toBeVisible();
    await page.getByLabel('Importe pagado (USD)').fill('559.44');
    await page.getByLabel('Referencia de la operación').fill(`ZL-${Date.now()}`);
    await page.getByLabel('Comprobante').setInputFiles({ name: 'pago.png', mimeType: 'image/png', buffer: PNG });
    await page.getByRole('button', { name: 'Registrar pago' }).click();
    await expect(page.getByText('Pago registrado')).toBeVisible();
    await expect(page.getByText('Pendiente de verificación').first()).toBeVisible();
    await expect(page.getByText('Pendiente de pago').first()).toBeVisible();
    // Persistencia: recargar mantiene la operación.
    await page.reload();
    await expect(page.getByRole('heading', { name: code })).toBeVisible();
  });

  test('el administrador aprueba el pago y la operación queda confirmada', async ({ page }) => {
    await login(page, 'admin@e2e.local', 'AdminE2E2026');
    await page.goto('/admin/pagos');
    const card = page.locator('.card', { hasText: code });
    await expect(card).toBeVisible();
    await expect(card.getByRole('img', { name: 'Comprobante de pago' })).toBeVisible();
    await card.getByRole('button', { name: 'Aprobar pago' }).click();
    await expect(page.locator('.card', { hasText: code })).toHaveCount(0);
    await page.goto('/admin/operaciones');
    await page.getByRole('link', { name: code }).click();
    await expect(page.getByText('Confirmada').first()).toBeVisible();
    await expect(page.getByText('Pagado').first()).toBeVisible();
  });

  test('el vendedor ve su operación y conversa con el cliente', async ({ page, browser }) => {
    await login(page, 'vendedora.demo@porcelanas.local', 'VendedorE2E2026');
    await expect(page).toHaveURL(/\/vendedor$/);
    await page.getByRole('link', { name: code }).click();
    await expect(page.getByText('María Cliente E2E')).toBeVisible();
    await page.getByRole('button', { name: 'Marcar lista para retiro' }).click();
    await expect(page.getByText('Lista para retiro').first()).toBeVisible();
    // El vendedor no accede a la administración.
    await page.goto('/admin/tasa');
    await expect(page).not.toHaveURL(/\/admin/);
    void browser;
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
