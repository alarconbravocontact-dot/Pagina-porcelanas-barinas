import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { config } from '../../config';
import { calculateBoxes, myOrders, productDetail, searchProducts, storeInfo, USES, type ProductSummary } from './tools';
import type { AssistantAction, AssistantReply, AssistantRequest } from './types';

/**
 * Asistente con Claude: el modelo responde en español usando solo herramientas de lectura
 * sobre los datos reales de la plataforma. Se activa cuando hay credenciales de la API de Anthropic.
 */

const SYSTEM = `Eres el asistente virtual de una tienda de porcelanatos con sede en Barinas, Venezuela. Atiendes a clientes en el sitio web.

Cómo responder:
- Escribe en español de Venezuela, cordial y breve (2 a 5 frases). Usa texto plano: sin Markdown, sin tablas, sin encabezados. Puedes usar listas cortas con guiones.
- Todo dato del negocio (precios, existencias, horario, dirección, métodos de pago, tasa BCV, vendedores, órdenes) debe salir de las herramientas. Si una herramienta no lo devuelve, di que no lo tienes y sugiere escribir al vendedor por WhatsApp. No inventes precios, descuentos, existencias, plazos de entrega, direcciones ni datos bancarios.
- Los datos para pagar (cuentas, teléfonos de Pago Móvil, correos de Zelle) no los das tú: aparecen dentro de la orden de compra del cliente.
- Para cuántas cajas necesita alguien, usa calcular_cajas: se venden cajas completas y el redondeo es hacia arriba.
- Cuando recomiendes piezas, básate en la guía de uso (recomendado, con precaución, no recomendado) y en la clasificación antideslizante; para duchas y exteriores prioriza las recomendadas para ese uso.
- Las compras se registran en la web (sin crear cuenta: nombre, ciudad y zona, teléfono y cédula), se elige vendedor, fecha de retiro y método de pago; el cliente adjunta el comprobante y retira en la sede. No hay envíos a domicilio salvo que una herramienta diga lo contrario.
- No pidas ni repitas cédulas ni datos personales en el chat. Para el estado de una orden usa mis_ordenes, que solo devuelve las órdenes del cliente con sesión iniciada.
- Si la consulta no es sobre la tienda o sus productos, indícalo con amabilidad y vuelve al tema.`;

const tools: Anthropic.Beta.BetaTool[] = [
  {
    name: 'buscar_productos',
    description:
      'Busca porcelanatos activos del catálogo. Filtra por texto (nombre, SKU o color), uso recomendado, color exacto, formato y solo disponibles. Devuelve hasta 8 piezas con precio por m² y por caja, m² por caja, existencias y enlace.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Palabras del nombre, SKU o color, p. ej. "calacatta" o "gris".' },
        uso: { type: 'string', enum: [...USES], description: 'Uso recomendado: salas, cocina, pisoBano, ducha, exterior o paredes.' },
        color: { type: 'string', description: 'Color exacto tal como lo lista info_tienda.catalog.colors.' },
        formato: { type: 'string', description: 'Formato tal como lo lista info_tienda.catalog.sizes, p. ej. "60x120 cm".' },
        solo_disponibles: { type: 'boolean' },
        precio_max_m2: { type: 'number', description: 'Precio máximo por m² en USD.' },
        limite: { type: 'integer', minimum: 1, maximum: 8 },
      },
    },
  },
  {
    name: 'ver_producto',
    description: 'Ficha de un producto por SKU: precios, m² por caja, existencias, descripción, clasificación antideslizante y ambientes recomendados, con precaución y no recomendados.',
    input_schema: { type: 'object', properties: { sku: { type: 'string' } }, required: ['sku'] },
  },
  {
    name: 'calcular_cajas',
    description: 'Calcula las cajas necesarias para cubrir unos m² con un producto, con total en USD, precio BCV y bolívares a la tasa vigente, y si hay existencias suficientes.',
    input_schema: { type: 'object', properties: { sku: { type: 'string' }, metros_cuadrados: { type: 'number', exclusiveMinimum: 0 } }, required: ['sku', 'metros_cuadrados'] },
  },
  {
    name: 'info_tienda',
    description: 'Datos públicos de la tienda: sede, horario, días de retiro, prepago, cancelaciones, métodos de pago activos, tasa BCV vigente, vendedores con WhatsApp, colores y formatos del catálogo y preguntas frecuentes.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'mis_ordenes',
    description: 'Últimas órdenes del cliente con sesión iniciada en este dispositivo: número, estado, estado del pago, fecha de retiro, total, saldo y vendedor. Si no hay sesión, lo indica.',
    input_schema: { type: 'object', properties: {} },
  },
];

const searchInput = z.object({
  texto: z.string().max(100).optional(),
  uso: z.enum(USES).optional(),
  color: z.string().max(60).optional(),
  formato: z.string().max(30).optional(),
  solo_disponibles: z.boolean().optional(),
  precio_max_m2: z.number().positive().optional(),
  limite: z.number().int().min(1).max(8).optional(),
});

interface Collected {
  products: Map<string, ProductSummary>;
  actions: AssistantAction[];
}

async function runTool(name: string, input: unknown, customerId: string | null, out: Collected): Promise<unknown> {
  const keep = (p: ProductSummary | undefined | null) => p && out.products.set(p.sku, p);
  switch (name) {
    case 'buscar_productos': {
      const i = searchInput.parse(input);
      const r = await searchProducts({ text: i.texto, use: i.uso, color: i.color, size: i.formato, onlyAvailable: i.solo_disponibles, maxPriceM2: i.precio_max_m2, limit: i.limite });
      r.products.forEach(keep);
      return r;
    }
    case 'ver_producto': {
      const { sku } = z.object({ sku: z.string().max(60) }).parse(input);
      const p = await productDetail(sku);
      keep(p);
      return p ?? { error: 'Producto no encontrado' };
    }
    case 'calcular_cajas': {
      const i = z.object({ sku: z.string().max(60), metros_cuadrados: z.number().positive().max(1_000_000) }).parse(input);
      const r = await calculateBoxes(i.sku, String(i.metros_cuadrados));
      if ('product' in r) keep(r.product);
      return r;
    }
    case 'info_tienda':
      return storeInfo();
    case 'mis_ordenes': {
      const r = await myOrders(customerId);
      for (const o of r.orders.slice(0, 3)) out.actions.push({ label: `Ver ${o.code}`, url: o.url });
      return r;
    }
    default:
      throw new Error(`Herramienta desconocida: ${name}`);
  }
}

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

const MAX_STEPS = 6;

export async function claudeAnswer(req: AssistantRequest, customerId: string | null): Promise<AssistantReply> {
  const history: Anthropic.Beta.BetaMessageParam[] = req.messages.map((m) => ({ role: m.role, content: m.content }));
  if (req.context?.sku) {
    // El contexto de la página va en el turno del cliente para no alterar el prefijo cacheado.
    const lastTurn = history[history.length - 1]!;
    lastTurn.content = `${lastTurn.content as string}\n\n(Contexto: el cliente está viendo el producto ${req.context.sku}.)`;
  }
  const out: Collected = { products: new Map(), actions: [] };

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await getClient().beta.messages.create({
      model: config.ASSISTANT_MODEL,
      max_tokens: 16000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools,
      messages: history,
      output_config: { effort: config.ASSISTANT_EFFORT },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });

    if (response.stop_reason === 'refusal') {
      return { reply: 'No puedo ayudarte con esa consulta. Si es sobre nuestros porcelanatos, intenta escribirla de otra forma o contacta a tu vendedor.', provider: 'claude' };
    }
    history.push({ role: 'assistant', content: response.content });
    if (response.stop_reason === 'pause_turn') continue;

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (response.stop_reason === 'tool_use' && toolUses.length > 0) {
      const results = await Promise.all(
        toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          try {
            return { type: 'tool_result', tool_use_id: t.id, content: JSON.stringify(await runTool(t.name, t.input, customerId, out)) };
          } catch (err) {
            return { type: 'tool_result', tool_use_id: t.id, content: `Error: ${err instanceof Error ? err.message : 'no se pudo consultar'}`, is_error: true };
          }
        }),
      );
      history.push({ role: 'user', content: results });
      continue;
    }

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return {
      reply: text || 'No pude preparar una respuesta. ¿Puedes repetir la pregunta?',
      provider: 'claude',
      products: [...out.products.values()].slice(-4),
      actions: out.actions,
    };
  }
  return { reply: 'La consulta tomó demasiados pasos. ¿Puedes hacerla más concreta?', provider: 'claude' };
}
