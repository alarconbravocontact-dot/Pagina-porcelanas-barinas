import { beforeAll, describe, expect, it } from 'vitest';
import { Client, login, prisma, scenario, setSetting } from './helpers';

let s: Awaited<ReturnType<typeof scenario>>;
let seller: Client;
const PROFILE = { fullName: 'Carlos Rangel', city: 'Barinas', addressRef: 'Av. Cuatricentenaria', phone: '0424-555 9988', documentId: '20.111.222' };
const tokenOf = (path: string) => new URL(path, 'http://x').searchParams.get('invitacion')!;

describe('Portal de compra privado con enlace personal', () => {
  beforeAll(async () => {
    s = await scenario();
    await setSetting('portal', { inviteOnly: true, inviteValidDays: 7 });
    await prisma.user.update({ where: { id: s.sellerUser.id }, data: { passwordHash: (await prisma.user.findUniqueOrThrow({ where: { id: s.adminUser.id } })).passwordHash } });
    await prisma.seller.update({ where: { id: s.seller.id }, data: { displayName: 'Juan Alarcon', whatsapp: '584125552594' } });
    seller = await login(s.app, 'seller@test.local');
  });

  it('sin invitación un visitante no puede registrarse', async () => {
    const res = await new Client(s.app).put('/api/customers/profile', PROFILE);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('INVITE_REQUIRED');
    expect(await prisma.customerProfile.count({ where: { fullName: 'Carlos Rangel' } })).toBe(0);
  });

  it('el vendedor genera un enlace personal con mensaje de WhatsApp para el cliente', async () => {
    const res = await seller.post('/api/staff/invites', { name: 'Carlos Rangel', phone: '0424 555 9988' }, { origin: 'https://portal.example' });
    expect(res.statusCode).toBe(201);
    const inv = res.json();
    expect(inv.url).toMatch(/^https:\/\/portal\.example\/portal\?invitacion=[\w-]{40,}$/);
    expect(inv.whatsappUrl).toMatch(/^https:\/\/wa\.me\/584245559988\?text=/);
    expect(decodeURIComponent(inv.whatsappUrl)).toContain('Hola, Carlos. Soy Juan Alarcon.');
    const row = await prisma.portalInvite.findFirstOrThrow({ where: { id: inv.id } });
    expect(row.tokenHash).not.toContain(tokenOf(inv.path)); // solo se guarda el hash
    expect((row.expiresAt.getTime() - Date.now()) / 86_400_000).toBeCloseTo(7, 0);
    const list = (await seller.get('/api/staff/invites')).json();
    expect(list[0]).toMatchObject({ name: 'Carlos Rangel', status: 'PENDING', seller: 'Juan Alarcon' });
  });

  it('el cliente abre su enlace, registra sus 4 datos y entra a su portal; el enlace no sirve dos veces', async () => {
    const inv = (await seller.post('/api/staff/invites', { name: 'Carlos Rangel' })).json();
    const token = tokenOf(inv.path);
    const guest = new Client(s.app);
    const info = await guest.get(`/api/portal/invites/${token}`);
    expect(info.json()).toMatchObject({ guestName: 'Carlos', seller: { name: 'Juan Alarcon' } });
    const res = await guest.post(`/api/portal/invites/${token}/accept`, PROFILE);
    expect(res.statusCode).toBe(201);
    expect(guest.cookies.get('sid')).toBeTruthy();
    const home = (await guest.get('/api/portal/home')).json();
    expect(home.seller).toMatchObject({ displayName: 'Juan Alarcon', whatsapp: '584125552594' });
    expect(home.reorder).toEqual([]);
    expect((await seller.get('/api/staff/invites')).json()[0]).toMatchObject({ status: 'USED', customerName: 'Carlos Rangel' });
    // Segundo uso desde otro dispositivo: rechazado sin revelar datos.
    const other = new Client(s.app);
    expect((await other.get(`/api/portal/invites/${token}`)).json().error.code).toBe('INVALID_INVITE');
    const again = await other.post(`/api/portal/invites/${token}/accept`, { ...PROFILE, documentId: '30.000.111' });
    expect(again.statusCode).toBe(400);
    expect(other.cookies.get('sid')).toBeUndefined();
  });

  it('una cédula ya registrada no abre el perfil ajeno y deja el enlace disponible', async () => {
    const inv = (await seller.post('/api/staff/invites', {})).json();
    const token = tokenOf(inv.path);
    const guest = new Client(s.app);
    const dup = await guest.post(`/api/portal/invites/${token}/accept`, { ...PROFILE, phone: '04120000000' });
    expect(dup.statusCode).toBe(409);
    expect(guest.cookies.get('sid')).toBeUndefined();
    expect((await guest.get(`/api/portal/invites/${token}`)).statusCode).toBe(200);
  });

  it('los enlaces vencidos o revocados no sirven y cada vendedor ve solo los suyos', async () => {
    const inv = (await seller.post('/api/staff/invites', { name: 'Vencido' })).json();
    await prisma.portalInvite.update({ where: { id: inv.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await new Client(s.app).get(`/api/portal/invites/${tokenOf(inv.path)}`)).statusCode).toBe(400);
    const inv2 = (await seller.post('/api/staff/invites', { name: 'Revocado' })).json();
    expect((await seller.post(`/api/staff/invites/${inv2.id}/revoke`, {})).statusCode).toBe(200);
    expect((await new Client(s.app).get(`/api/portal/invites/${tokenOf(inv2.path)}`)).statusCode).toBe(400);
    const statuses = (await seller.get('/api/staff/invites')).json().map((i: { name: string; status: string }) => `${i.name}:${i.status}`);
    expect(statuses).toEqual(expect.arrayContaining(['Vencido:EXPIRED', 'Revocado:REVOKED']));
    expect((await s.customer.post('/api/staff/invites', {})).statusCode).toBe(403);
    expect((await new Client(s.app).post('/api/staff/invites', {})).statusCode).toBe(401);
  });

  it('la administración genera invitaciones a nombre de un vendedor', async () => {
    const res = await s.admin.post('/api/staff/invites', { name: 'Ana', sellerId: s.seller.id });
    expect(res.statusCode).toBe(201);
    expect(decodeURIComponent(res.json().whatsappUrl)).toContain('Soy Juan Alarcon');
  });
});
