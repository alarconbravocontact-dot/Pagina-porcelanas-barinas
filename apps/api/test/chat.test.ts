import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioc, type Socket } from 'socket.io-client';
import { buildApp } from '../src/app';
import { attachSocket } from '../src/socket';
import { checkout, createUser, login, prisma, scenario } from './helpers';
import { setIo } from '../src/lib/realtime';

let s: Awaited<ReturnType<typeof scenario>>;

describe('Bloque E — chat cliente-vendedor y notificaciones', () => {
  beforeAll(async () => {
    s = await scenario();
  });

  it('crea conversaciones persistentes ligadas a la operación', async () => {
    await s.customer.post('/api/cart/items', { productId: s.product.id, mode: 'BOXES', quantity: 1 });
    const o = (await checkout(s.customer, s)).json().order;
    const res = await s.customer.post('/api/conversations', { orderId: o.id, message: '¿Puedo retirar en la tarde?' });
    expect(res.statusCode).toBe(201);
    const conv = res.json();
    expect(conv.seller.id).toBe(s.seller.id);
    expect(conv.order.code).toBe(o.code);
    const seller = await login(s.app, 'seller@test.local');
    const list = (await seller.get('/api/conversations')).json();
    expect(list).toHaveLength(1);
    expect(list[0].unread).toBe(1);
    expect((await seller.post(`/api/conversations/${conv.id}/messages`, { body: 'Sí, hasta las 5 pm' })).statusCode).toBe(201);
    // Persistencia: un nuevo inicio de sesión (otro dispositivo) ve el historial completo.
    const device2 = await login(s.app, 'cliente@test.local');
    const msgs = (await device2.get(`/api/conversations/${conv.id}/messages`)).json();
    expect(msgs.messages.map((m: { body: string }) => m.body)).toEqual(['¿Puedo retirar en la tarde?', 'Sí, hasta las 5 pm']);
    expect(msgs.messages[1].senderSide).toBe('seller');
    // Indicadores de lectura.
    const before = (await device2.get('/api/conversations')).json()[0];
    expect(before.unread).toBe(1);
    await device2.post(`/api/conversations/${conv.id}/read`);
    const after = (await seller.get('/api/conversations')).json()[0];
    expect(new Date(after.customerLastReadAt).getTime()).toBeGreaterThanOrEqual(new Date(msgs.messages[1].createdAt).getTime());
    expect(await prisma.message.count()).toBe(2);
    const notif = (await device2.get('/api/notifications')).json();
    expect(notif.items.some((n: { type: string }) => n.type === 'CHAT_MESSAGE')).toBe(true);
  });

  it('controla el acceso a cada conversación', async () => {
    const conv = await prisma.conversation.findFirstOrThrow();
    await createUser('CUSTOMER', 'curioso@test.local');
    const other = await login(s.app, 'curioso@test.local');
    expect((await other.get(`/api/conversations/${conv.id}/messages`)).statusCode).toBe(404);
    expect((await other.post(`/api/conversations/${conv.id}/messages`, { body: 'hola' })).statusCode).toBe(404);
    expect((await other.get('/api/conversations')).json()).toHaveLength(0);
    await createUser('SELLER', 'v-ajeno@test.local');
    const otherSeller = await login(s.app, 'v-ajeno@test.local');
    expect((await otherSeller.get(`/api/conversations/${conv.id}/messages`)).statusCode).toBe(404);
    // El administrador supervisa en solo lectura.
    expect((await s.admin.get(`/api/conversations/${conv.id}/messages`)).statusCode).toBe(200);
    expect((await s.admin.post(`/api/conversations/${conv.id}/messages`, { body: 'x' })).statusCode).toBe(403);
    // Solo el vendedor cambia el estado.
    expect((await s.customer.patch(`/api/conversations/${conv.id}/status`, { status: 'CLOSED' })).statusCode).toBe(403);
    const seller = await login(s.app, 'seller@test.local');
    expect((await seller.patch(`/api/conversations/${conv.id}/status`, { status: 'CLOSED' })).json().status).toBe('CLOSED');
  });

  it('el mensaje se guarda como texto sin interpretar (XSS)', async () => {
    const conv = await prisma.conversation.findFirstOrThrow();
    const payload = '<img src=x onerror="alert(1)">';
    await s.customer.post(`/api/conversations/${conv.id}/messages`, { body: payload });
    const msgs = (await s.customer.get(`/api/conversations/${conv.id}/messages`)).json().messages;
    expect(msgs.at(-1).body).toBe(payload);
    expect((await s.customer.get(`/api/conversations/${conv.id}/messages`)).headers['content-type']).toContain('application/json');
  });

  describe('tiempo real con Socket.IO', () => {
    let server: Awaited<ReturnType<typeof buildApp>>;
    let url: string;
    const sockets: Socket[] = [];

    beforeAll(async () => {
      server = await buildApp();
      attachSocket(server.server);
      await server.listen({ port: 0, host: '127.0.0.1' });
      url = `http://127.0.0.1:${(server.server.address() as AddressInfo).port}`;
    });
    afterAll(async () => {
      sockets.forEach((x) => x.close());
      setIo(null);
      await server.close();
    });

    const connect = (sid?: string) =>
      new Promise<Socket>((resolve, reject) => {
        const sock = ioc(url, { path: '/socket.io', transports: ['websocket'], extraHeaders: sid ? { cookie: `sid=${sid}` } : {}, reconnection: false });
        sockets.push(sock);
        sock.on('connect', () => resolve(sock));
        sock.on('connect_error', (e) => reject(e));
      });

    it('rechaza conexiones sin sesión y entrega mensajes al vendedor en tiempo real', async () => {
      await expect(connect()).rejects.toThrow('UNAUTHENTICATED');
      const seller = await login(s.app, 'seller@test.local');
      const sellerSock = await connect(seller.cookies.get('sid'));
      const conv = await prisma.conversation.findFirstOrThrow();
      const joined = await new Promise<{ ok: boolean }>((r) => sellerSock.emit('conversation:join', conv.id, r));
      expect(joined.ok).toBe(true);
      await createUser('CUSTOMER', 'espia@test.local');
      const spy = await login(s.app, 'espia@test.local');
      const spySock = await connect(spy.cookies.get('sid'));
      const spyJoin = await new Promise<{ ok: boolean }>((r) => spySock.emit('conversation:join', conv.id, r));
      expect(spyJoin.ok).toBe(false);
      let spyGot = false;
      spySock.on('message:new', () => (spyGot = true));
      const received = new Promise<{ body: string }>((r) => sellerSock.once('message:new', r));
      const notified = new Promise<{ type: string }>((r) => sellerSock.on('notification:new', (n) => n.type === 'CHAT_MESSAGE' && r(n)));
      await prisma.notification.updateMany({ data: { readAt: new Date() } });
      await s.customer.post(`/api/conversations/${conv.id}/messages`, { body: 'Mensaje en vivo' });
      expect((await received).body).toBe('Mensaje en vivo');
      expect((await notified).type).toBe('CHAT_MESSAGE');
      await new Promise((r) => setTimeout(r, 100));
      expect(spyGot).toBe(false);
    });
  });
});
