import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client, prisma, scenario, setSetting } from './helpers';

// Cliente de Anthropic simulado: las pruebas no llaman a la API real ni gastan créditos.
const create = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    status = 500;
  }
  class Anthropic {
    static APIError = APIError;
    beta = { messages: { create } };
  }
  return { default: Anthropic };
});

let s: Awaited<ReturnType<typeof scenario>>;
let guest: Client;
const ask = (c: Client, text: string, context?: { sku?: string }) => c.post('/api/assistant/messages', { messages: [{ role: 'user', content: text }], context });

describe('Asistente virtual', () => {
  beforeAll(async () => {
    s = await scenario({ stock: 50 });
    guest = new Client(s.app);
    await prisma.product.update({ where: { id: s.product.id }, data: { usageGuide: { salas: 'YES', pisoBano: 'YES', ducha: 'NO', cocina: 'YES', exterior: 'NO', paredes: 'YES' } } });
    await prisma.seller.update({ where: { id: s.seller.id }, data: { displayName: 'Juan Alarcon', whatsapp: '584125552594' } });
    await setSetting('store', { name: 'Porcelanatos Barinas', city: 'Barinas', hoursText: 'Lunes a viernes, de 8:00 a. m. a 5:00 p. m.' });
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    create.mockReset();
  });

  it('sin clave de API usa el motor integrado y responde el horario con los datos de la sede', async () => {
    expect((await guest.get('/api/assistant')).json()).toEqual({ provider: 'local' });
    const res = await ask(guest, '¿Cuál es el horario?');
    expect(res.statusCode).toBe(200);
    expect(res.json().provider).toBe('local');
    expect(res.json().reply).toContain('lunes a viernes, de 8:00 a. m. a 5:00 p. m.');
    expect(create).not.toHaveBeenCalled();
  });

  it('calcula las cajas del producto que el cliente está viendo, con redondeo hacia arriba y bolívares', async () => {
    const res = (await ask(guest, '¿Cuántas cajas necesito para 30 m2?', { sku: 'POR-6060-BLA' })).json();
    // 30 m² / 2,16 m² por caja = 13,9 → 14 cajas; 14 × 27,00 = 378,00 USD; × 36,5 = Bs. 13.797,00.
    expect(res.reply).toContain('14 cajas');
    expect(res.reply).toContain('378,00');
    expect(res.reply).toContain('13.797,00');
    expect(res.products[0]).toMatchObject({ sku: 'POR-6060-BLA', url: '/producto/POR-6060-BLA' });
  });

  it('busca en el catálogo por uso y no recomienda piezas no aptas para ducha', async () => {
    const bano = (await ask(guest, 'Busco porcelanato para el baño')).json();
    expect(bano.products.map((p: { sku: string }) => p.sku)).toEqual(['POR-6060-BLA']);
    const ducha = (await ask(guest, 'Quiero algo para la ducha')).json();
    expect(ducha.products ?? []).toHaveLength(0);
    expect(ducha.reply).toMatch(/No encontré/);
  });

  it('lista los métodos de pago sin revelar los datos de recepción', async () => {
    const res = (await ask(guest, '¿Puedo pagar con Zelle o Pago Móvil?')).json();
    expect(res.reply).toContain('Zelle');
    expect(res.reply).toContain('Pago Móvil');
    expect(JSON.stringify(res)).not.toMatch(/Destinatario de prueba|Teléfono de prueba/);
  });

  it('ofrece el WhatsApp del vendedor y solo muestra órdenes del cliente con sesión', async () => {
    const seller = (await ask(guest, 'Quiero hablar con un vendedor')).json();
    expect(seller.reply).toContain('Juan Alarcon');
    expect(seller.actions[0].url).toMatch(/^https:\/\/wa\.me\/584125552594/);
    const anon = (await ask(guest, '¿Cómo va mi pedido?')).json();
    expect(anon.reply).toMatch(/estés en tu cuenta/);
    const mine = (await ask(s.customer, '¿Cómo va mi pedido?')).json();
    expect(mine.reply).toMatch(/Aún no tienes órdenes/);
  });

  it('se presenta como asistente automático y remite a los términos y políticas', async () => {
    const res = (await ask(guest, '¿Eres una persona? ¿Qué hacen con mis datos personales?')).json();
    expect(res.reply).toMatch(/asistente automático, no una persona/);
    expect(res.actions.map((a: { url: string }) => a.url)).toEqual(['/politicas#terminos', '/politicas#asistente']);
  });

  it('valida el formato de la conversación', async () => {
    expect((await guest.post('/api/assistant/messages', { messages: [] })).statusCode).toBe(400);
    expect((await guest.post('/api/assistant/messages', { messages: [{ role: 'assistant', content: 'hola' }] })).statusCode).toBe(400);
    expect((await guest.post('/api/assistant/messages', { messages: [{ role: 'user', content: 'x'.repeat(1501) }] })).statusCode).toBe(400);
  });

  it('con clave de API, Claude consulta las herramientas y la respuesta incluye las piezas encontradas', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-prueba';
    create
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tu_1', name: 'buscar_productos', input: { uso: 'pisoBano' } }],
      })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Te recomiendo el Porcelanato Blanco para tu baño.' }] });
    const res = (await ask(guest, 'algo para el baño', { sku: 'POR-6060-BLA' })).json();
    expect(res).toMatchObject({ provider: 'claude', reply: 'Te recomiendo el Porcelanato Blanco para tu baño.' });
    expect(res.products.map((p: { sku: string }) => p.sku)).toEqual(['POR-6060-BLA']);
    const first = create.mock.calls[0]![0];
    expect(first).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'], output_config: { effort: 'low' } });
    expect(first.messages[0].content).toContain('el cliente está viendo el producto POR-6060-BLA');
    // El resultado de la herramienta vuelve al modelo con datos reales del catálogo.
    const toolResult = create.mock.calls[1]![0].messages[2].content[0];
    expect(toolResult).toMatchObject({ type: 'tool_result', tool_use_id: 'tu_1' });
    expect(JSON.parse(toolResult.content).products[0].priceM2).toContain('12,50');
  });

  it('si la API de Claude falla, responde igual con el motor integrado', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-prueba';
    create.mockRejectedValueOnce(new Error('sin conexión'));
    const res = (await ask(guest, '¿Cuál es el horario?')).json();
    expect(res.provider).toBe('local');
    expect(res.reply).toContain('lunes a viernes');
  });
});
