import { expect, test } from '@playwright/test';

for (const path of ['/', '/catalogo', '/producto/DEMO-GRI-6060', '/carrito', '/politicas', '/ingresar']) {
  test(`sin desbordamiento horizontal en ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('menú móvil y filtros funcionan en pantallas pequeñas', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Menú' }).click();
  await page.getByRole('link', { name: 'Catálogo' }).first().click();
  await expect(page).toHaveURL(/\/catalogo/);
  await page.getByRole('button', { name: /Filtros/ }).click();
  await page.getByLabel('Solo con existencias disponibles').click();
  await expect(page).toHaveURL(/available=true/);
});
