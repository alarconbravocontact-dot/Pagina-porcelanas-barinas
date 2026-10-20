import { expect, request as playwrightRequest, type APIRequestContext, type Page } from '@playwright/test';

// Sesión de administración compartida: el inicio de sesión tiene límite de intentos por minuto.
let staff: APIRequestContext | null = null;
const csrfOf = async (ctx: APIRequestContext) => ((await (await ctx.get('/api/auth/session')).json()) as { csrfToken: string }).csrfToken;

async function staffContext() {
  if (staff) return staff;
  const ctx = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:4100' });
  const login = await ctx.post('/api/auth/login', { data: { email: 'admin@e2e.local', password: 'AdminE2E2026' }, headers: { 'x-csrf-token': await csrfOf(ctx) } });
  expect(login.ok()).toBe(true);
  staff = ctx;
  return ctx;
}

/** Genera un enlace personal al portal (como lo haría la administración para Juan Alarcon). */
export async function newInvitePath(_request: APIRequestContext, name = 'Cliente E2E'): Promise<string> {
  const request = await staffContext();
  const csrf = () => csrfOf(request);
  const sellers = (await (await request.get('/api/sellers')).json()) as { id: string; displayName: string }[];
  const juan = sellers.find((s) => s.displayName === 'Juan Alarcon') ?? sellers[0]!;
  const res = await request.post('/api/staff/invites', { data: { name, sellerId: juan.id }, headers: { 'x-csrf-token': await csrf() } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { path: string }).path;
}

export const randomDocument = () => `V-${20000000 + Math.floor(Math.random() * 9000000)}`;

/** Entra al portal privado con un enlace nuevo, registrando los cuatro datos. */
export async function enterPortal(page: Page, request: APIRequestContext, name = 'María José Pérez') {
  await page.goto(await newInvitePath(request, name));
  const form = page.getByRole('form', { name: 'Tus datos' });
  await form.getByLabel('Nombre completo').fill(name);
  await form.getByLabel('Ciudad').fill('Barinas');
  await form.getByLabel('Zona o dirección de referencia').fill('Urb. Alto Barinas, calle 3');
  await form.getByLabel('Teléfono').fill('0414 5551234');
  await form.getByLabel('Cédula de identidad').fill(randomDocument());
  await form.getByRole('button', { name: 'Entrar a mi portal' }).click();
  await expect(page.getByRole('heading', { name: `Hola, ${name.split(' ')[0]}.` })).toBeVisible();
}
