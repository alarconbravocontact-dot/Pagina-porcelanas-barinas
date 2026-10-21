import { expect, test } from '@playwright/test';
import { newInvitePath } from './portal-helpers';

test('términos y políticas se pueden leer sin sesión, desde la invitación y con aviso de cookies', async ({ browser, request }) => {
  const ctx = await browser.newContext();
  // Navegador normal (sin webdriver) para que aparezca el aviso de cookies.
  await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4100/politicas');
  for (const title of ['Términos y condiciones de uso', 'Política de privacidad', 'Política de cookies', 'Uso del asistente de IA', 'Condiciones comerciales']) {
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  await expect(page.locator('#cookies')).toContainText('csrf_token');
  await expect(page.locator('#asistente')).toContainText('No le pedirá su cédula');
  const notice = page.getByTestId('cookie-notice');
  await expect(notice).toContainText('Usamos solo cookies necesarias');
  await notice.getByRole('button', { name: 'Entendido' }).click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Política de cookies' })).toBeVisible();
  await expect(page.getByTestId('cookie-notice')).toHaveCount(0);
  // La invitación enlaza a los términos y a la privacidad.
  await page.goto('http://127.0.0.1:4100' + (await newInvitePath(request, 'Lectora Legal')));
  const consent = page.getByTestId('invite-consent');
  await expect(consent.getByRole('link', { name: 'términos y condiciones' })).toHaveAttribute('href', '/politicas#terminos');
  await expect(consent.getByRole('link', { name: 'política de privacidad' })).toHaveAttribute('href', '/politicas#privacidad');
  await ctx.close();
});
