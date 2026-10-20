import { expect, test } from '@playwright/test';
import { enterPortal } from './portal-helpers';

test.describe('recorrido guiado por ventana', () => {
  test('se abre desde el botón, resalta cada zona y se cierra', async ({ page, request }) => {
    await enterPortal(page, request, 'Tomás Guía');
    await page.goto('/como-comprar');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('tour-launcher').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Cómo comprar · 1 de 3');
    await expect(dialog.getByRole('heading', { name: 'Dos modalidades' })).toBeVisible();
    await dialog.getByRole('button', { name: /Siguiente/ }).click();
    await expect(dialog.getByRole('heading', { name: 'Días y horarios' })).toBeVisible();
    await expect(dialog).toContainText('lunes a viernes, de 8:00 a. m. a 5:00 p. m.');
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByRole('heading', { name: 'Precios y tasa' })).toBeVisible();
    await dialog.getByRole('button', { name: /Terminar/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('tour-launcher')).toBeVisible();
  });

  test('la primera visita lo inicia solo y “No mostrar automáticamente” lo desactiva', async ({ browser, request }) => {
    const ctx = await browser.newContext();
    // Simula un navegador normal: las pruebas automatizadas no reciben recorridos automáticos.
    await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
    const page = await ctx.newPage();
    await enterPortal(page, request, 'Tomás Guía');
    await page.goto('http://127.0.0.1:4100/catalogo');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Catálogo · 1 de');
    await dialog.getByRole('button', { name: 'No mostrar automáticamente' }).click();
    await expect(dialog).toHaveCount(0);
    await page.goto('http://127.0.0.1:4100/contacto');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    await expect(dialog).toHaveCount(0);
    await ctx.close();
  });
});
