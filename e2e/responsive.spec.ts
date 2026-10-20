import { expect, test } from '@playwright/test';
import { enterPortal } from './portal-helpers';

for (const path of ['/', '/catalogo', '/producto/DEMO-GRI-6060', '/carrito', '/politicas', '/ingresar']) {
  test(`sin desbordamiento horizontal en ${path}`, async ({ page, request }) => {
    if (path !== '/ingresar') await enterPortal(page, request, 'Clara Móvil');
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('portal privado sin enlace en el teléfono: aviso sin desbordamiento', async ({ page }) => {
  await page.goto('/catalogo');
  await expect(page.getByRole('heading', { name: 'Este portal es personal' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('menú móvil y filtros funcionan en pantallas pequeñas', async ({ page, request }) => {
  await enterPortal(page, request, 'Clara Móvil');
  await page.goto('/');
  await page.getByRole('button', { name: 'Menú' }).click();
  await page.getByRole('link', { name: 'Catálogo' }).first().click();
  await expect(page).toHaveURL(/\/catalogo/);
  await page.getByRole('button', { name: /Filtros/ }).click();
  await page.getByLabel('Solo con existencias disponibles').click();
  await expect(page).toHaveURL(/available=true/);
});

test('el recorrido guiado funciona en el teléfono', async ({ page, request }) => {
  await enterPortal(page, request, 'Clara Móvil');
  await page.goto('/catalogo');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('tour-launcher').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Filtros' })).toBeVisible();
  const box = await dialog.boundingBox();
  const width = page.viewportSize()!.width;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
