import { expect, test } from '@playwright/test';
import { enterPortal } from './portal-helpers';

test('el asistente virtual responde el horario y calcula cajas desde la ficha', async ({ page, request }) => {
  await enterPortal(page, request, 'Elena Chat');
  await page.goto('/');
  await page.getByTestId('assistant-launcher').click();
  const panel = page.getByTestId('assistant');
  await panel.getByRole('button', { name: '¿Cuál es el horario?' }).click();
  await expect(panel.locator('[data-role="assistant"]').nth(1)).toContainText('lunes a viernes, de 8:00 a. m. a 5:00 p. m.');
  await page.goto('/producto/DEMO-GRI-6060');
  await page.getByTestId('assistant-launcher').click();
  await panel.getByLabel('Escribe tu pregunta').fill('¿Cuántas cajas necesito para 30 m2?');
  await page.keyboard.press('Enter');
  const reply = panel.locator('[data-role="assistant"]').last();
  await expect(reply).toContainText(/necesitas \d+ cajas/);
  await expect(panel.getByRole('link', { name: /DEMO|Gris|gris/ }).first()).toBeVisible();
});
