import { formatRate } from '@porcelanas/shared';
import { calculateBoxes, myOrders, productDetail, searchProducts, storeInfo, USE_LABELS, type ProductSummary, type Use } from './tools';
import type { AssistantReply, AssistantRequest } from './types';

/**
 * Motor de respuestas integrado: no usa servicios externos. Reconoce las consultas frecuentes
 * (horario, sede, pagos, tasa, vendedor, órdenes, cálculo de cajas y búsqueda en el catálogo)
 * y responde con los datos vigentes de la plataforma. Lo que no entiende lo deriva al vendedor.
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const has = (t: string, ...words: string[]) => words.some((w) => new RegExp(`(^|[^a-z])${w}`).test(t));

const USE_WORDS: [Use, string[]][] = [
  ['ducha', ['ducha', 'antidesliz', 'resbal', 'mojad']],
  ['pisoBano', ['bano', 'banos', 'sanitario']],
  ['cocina', ['cocina']],
  ['exterior', ['exterior', 'terraza', 'patio', 'jardin', 'piscina', 'fachada', 'garaje', 'estacionamiento']],
  ['paredes', ['pared', 'paredes', 'revestimiento', 'muro']],
  ['salas', ['sala', 'salas', 'comedor', 'habitacion', 'cuarto', 'dormitorio', 'oficina', 'local']],
];

const SUGGESTIONS = ['¿Cuál es el horario?', 'Porcelanato para baño', '¿Cuántas cajas necesito para 30 m²?', '¿Qué métodos de pago aceptan?'];

function areaFrom(t: string): string | null {
  const m = t.match(/(\d+(?:[.,]\d{1,4})?)\s*(m2|m²|mts?2?|metros?|mt)\b/) ?? t.match(/(?:para|de|cubrir)\s+(\d+(?:[.,]\d{1,4})?)(?!\s*x)/);
  return m ? m[1]!.replace(',', '.') : null;
}

function skuFrom(text: string): string | null {
  const m = text.toUpperCase().match(/\b([A-Z]{2,5}-[A-Z0-9]{1,6}(?:-[A-Z0-9]{2,10})+)\b/);
  return m ? m[1]! : null;
}

function joinList(items: string[]) {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

export async function localAnswer(req: AssistantRequest, customerId: string | null): Promise<AssistantReply> {
  const last = req.messages[req.messages.length - 1]!.content;
  const t = norm(last);
  const info = await storeInfo();
  const storeName = info.store.name || 'la galería';
  const hours = info.store.hours?.replace(/\.\s*$/, '') ?? null;
  const seller = info.sellers[0];
  const sellerAction = seller?.whatsappUrl
    ? { label: `Escribir a ${seller.name} por WhatsApp`, url: seller.whatsappUrl }
    : info.whatsappUrl
      ? { label: 'Escribir por WhatsApp', url: info.whatsappUrl }
      : null;
  const reply = (text: string, extra: Partial<AssistantReply> = {}): AssistantReply => ({ reply: text, provider: 'local', ...extra });

  // Cálculo de cajas: superficie + producto (por SKU escrito, el de la página actual o el último mostrado).
  const area = areaFrom(t);
  const sku = skuFrom(last) ?? req.context?.sku ?? null;
  if (area && (has(t, 'caja', 'cuant', 'necesit', 'calcul', 'cubrir', 'alcanza') || /m2|m²|metro/.test(t))) {
    if (!sku) {
      return reply(
        `Para calcular las cajas de ${area.replace('.', ',')} m² necesito saber qué porcelanato te interesa. Ábrelo en el catálogo y pregúntame desde su ficha, o escríbeme su código (SKU).`,
        { suggestions: ['Porcelanato para sala', 'Porcelanato para baño'] },
      );
    }
    const calc = await calculateBoxes(sku, area);
    if ('error' in calc) return reply(calc.error ?? 'No pude hacer el cálculo.');
    const bs = calc.totalBs ? ` Pagando en bolívares: ${calc.totalBs}${calc.totalBcvUsd ? ` (precio BCV ${calc.totalBcvUsd})` : ''} a la tasa de Bs. ${formatRate(calc.rate!)}.` : '';
    const stock = calc.enoughStock ? '' : calc.availableBoxes > 0 ? ` Ojo: hoy hay ${calc.availableBoxes} cajas disponibles; consulta con tu vendedor la reposición.` : ' Ojo: hoy no hay existencias registradas de esta pieza; consulta disponibilidad con tu vendedor.';
    const requested = calc.requestedM2.replace(/\.00$/, '').replace('.', ',');
    return reply(
      `Para ${requested} m² de ${calc.product.name} necesitas ${calc.boxes} cajas (cubren ${calc.coveredM2}; se venden cajas completas). Total en divisas: ${calc.totalUsd}.${bs}${stock}`,
      { products: [calc.product], suggestions: ['¿Qué métodos de pago aceptan?', '¿Cómo compro?'] },
    );
  }

  if (/^(hola|buen[oa]s?|saludos|hey|que tal)\b/.test(t) && t.length < 40) {
    return reply(`¡Hola! Soy el asistente de ${storeName}. Puedo ayudarte a encontrar porcelanatos, calcular cajas, y darte el horario, los métodos de pago y el estado de tu orden.`, {
      suggestions: SUGGESTIONS,
    });
  }

  if (/^(gracias|muchas gracias|ok|listo|perfecto|excelente)\b/.test(t) && t.length < 40) {
    return reply('¡Con gusto! Si necesitas algo más, aquí estoy.', { suggestions: SUGGESTIONS });
  }

  // Antes que el estado de la orden y los pagos: cancelaciones, cambios de fecha y prepago.
  if (has(t, 'cancel', 'reprogram', 'cambiar la fecha', 'cambiar fecha', 'devolu', 'reembols')) {
    return reply(
      `Puedes cancelar desde tu cuenta hasta ${info.cancellation.minHoursBefore} horas antes del retiro si no hay pagos acreditados, y cambiar la fecha hasta ${info.cancellation.maxReschedules} veces con ${info.cancellation.rescheduleMinHours} horas de anticipación. Con pagos acreditados, la cancelación se gestiona con tu vendedor.`,
      { actions: [{ label: 'Ver políticas', url: '/politicas' }, ...(customerId ? [{ label: 'Mis compras', url: '/cuenta/operaciones' }] : [])] },
    );
  }

  if (has(t, 'prepago', 'reserv', 'apartar', 'abono', 'abonar', 'separar', 'pagar despues', 'pago despues', 'pagar luego')) {
    return reply(
      `Sí: con el prepago abonas al menos el ${info.prepay.minPercent}% del total y reservas una fecha de retiro de hasta ${info.prepay.maxDaysAhead} días. La mercancía queda apartada ${info.prepay.holdHours} horas mientras registras el pago; el saldo lo pagas al retirar.`,
    );
  }

  if (has(t, 'envio', 'envian', 'enviar', 'delivery', 'domicilio', 'despacho', 'transporte', 'flete', 'mandan')) {
    return reply(`Las compras de la plataforma se retiran en la sede de ${info.store.city || 'Barinas'}. Si necesitas transporte, consúltalo directamente con tu vendedor.`, {
      actions: sellerAction ? [sellerAction] : [],
    });
  }

  // Estado de órdenes del propio cliente.
  if (/\bpc-[a-z0-9]{4,}/.test(t) || has(t, 'mi orden', 'mis orden', 'mi pedido', 'mis pedido', 'mi compra', 'estado de', 'ya llego', 'listo para retirar')) {
    const mine = await myOrders(customerId);
    if (!mine.signedIn) {
      return reply('Para consultar una orden necesito que estés en tu cuenta en este dispositivo (se abre sola al registrar tu orden). Si compraste desde otro equipo, pide a tu vendedor un enlace de acceso.', {
        actions: sellerAction ? [sellerAction] : [],
      });
    }
    if (mine.orders.length === 0) return reply('Aún no tienes órdenes registradas. Cuando hagas tu primera compra podrás seguirla aquí.');
    const lines = mine.orders.slice(0, 3).map((o) => `${o.code}: ${o.status} · ${o.payment} · retiro ${o.pickupDate} · saldo ${o.balance}`);
    return reply(`Estas son tus órdenes más recientes:\n${lines.join('\n')}`, {
      actions: mine.orders.slice(0, 3).map((o) => ({ label: `Ver ${o.code}`, url: o.url })),
    });
  }

  if (has(t, 'horario', 'hora', 'abren', 'abierto', 'cierran', 'atienden', 'atencion', 'sabado', 'domingo', 'feriado', 'que dias')) {
    // Semana de lunes a domingo para nombrar los días sin atención en orden natural.
    const week = [...info.pickupDays.slice(1), info.pickupDays[0]!];
    const closed = week.filter((d) => !d.open).map((d) => d.day.toLowerCase());
    const days = hours ? `Atendemos ${hours.charAt(0).toLowerCase()}${hours.slice(1)}.` : `Retiros: ${joinList(week.filter((d) => d.open).map((d) => `${d.day.toLowerCase()} ${d.hours}`))}.`;
    const closedText = closed.length ? ` ${joinList(closed).replace(/^./, (c) => c.toUpperCase())}: sin atención.` : '';
    return reply(`${days}${closedText} Los retiros se programan en ese horario.`, {
      suggestions: ['¿Dónde queda la sede?', '¿Cómo compro?'],
    });
  }

  if (has(t, 'donde', 'direccion', 'ubicacion', 'ubicad', 'sede', 'llegar', 'mapa', 'tienda fisica')) {
    const where = info.store.address ? `${info.store.address}, ${info.store.city}` : `${info.store.city}. La dirección exacta te la confirma tu vendedor al coordinar la visita`;
    return reply(`La sede está en ${where}.${hours ? ` Horario: ${hours}.` : ''}`, {
      actions: [...(info.store.mapUrl ? [{ label: 'Cómo llegar', url: info.store.mapUrl }] : []), ...(sellerAction ? [sellerAction] : [])],
    });
  }

  if (has(t, 'tasa', 'bcv', 'dolar', 'cambio')) {
    if (!info.rate) return reply('Todavía no hay una tasa BCV registrada para hoy. Los precios en dólares están vigentes; el monto en bolívares se calcula cuando se registra la tasa.');
    return reply(`La tasa BCV registrada es Bs. ${formatRate(info.rate.bsPerUsd)} por dólar (fecha valor ${info.rate.effectiveDate})${info.rate.stale ? ', aunque está desactualizada' : ''}. Si pagas en bolívares se usa el precio BCV de cada pieza; la tasa aplicada queda guardada en tu orden.`);
  }

  if (has(t, 'pago', 'pagar', 'zelle', 'binance', 'transferencia', 'efectivo', 'tarjeta', 'metodo', 'bolivares', 'divisa', 'usdt')) {
    const ready = info.paymentMethods.filter((m) => m.available);
    const pending = info.paymentMethods.filter((m) => !m.available);
    const list = ready.map((m) => `${m.name} (${m.priceList})`);
    return reply(
      `${list.length ? `Puedes pagar con ${joinList(list)}.` : 'Los métodos de pago se están configurando.'}${pending.length ? ` ${joinList(pending.map((m) => m.name))} ${pending.length === 1 ? 'aún no está disponible' : 'aún no están disponibles'}.` : ''} Los datos para pagar aparecen en tu orden de compra, y ahí mismo adjuntas el comprobante; tu vendedor lo revisa antes de confirmar.`,
      { suggestions: ['¿Cuál es la tasa BCV?', '¿Cómo compro?'] },
    );
  }

  if (has(t, 'vendedor', 'asesor', 'humano', 'persona', 'whatsapp', 'contacto', 'telefono', 'llamar', 'juan')) {
    if (!seller) return reply('En este momento no hay vendedores disponibles en la plataforma.');
    return reply(`Tu vendedor es ${seller.name}${seller.branch ? `, ${seller.branch}` : ''}${seller.phone ? ` (tel. ${seller.phone})` : ''}. Te atiende por WhatsApp y te recibe en la sede.`, {
      actions: sellerAction ? [sellerAction] : [],
    });
  }

  if (has(t, 'como compr', 'comprar', 'proceso', 'pasos', 'como hago', 'como funciona', 'orden de compra')) {
    return reply(
      '1) Elige tus piezas en el catálogo y calcula las cajas. 2) En el carrito, continúa con la compra: registras tu nombre, ciudad y zona, teléfono y cédula (sin crear cuenta). 3) Eliges a tu vendedor, la fecha de retiro (lunes a viernes) y el método de pago. 4) Pagas, adjuntas el comprobante y coordinas tu visita con el vendedor.',
      { actions: [{ label: 'Ir al catálogo', url: '/catalogo' }] },
    );
  }

  // Búsqueda en el catálogo por uso, color, formato o texto.
  const use = USE_WORDS.find(([, words]) => has(t, ...words))?.[0];
  const color = info.catalog.colors.find((c) => c && t.includes(norm(c).split(' ')[0]!));
  const size = t.match(/(\d{2,3})\s*x\s*(\d{2,3})/);
  const sizeLabel = size ? info.catalog.sizes.find((s) => s.replace(/\s/g, '').startsWith(`${size[1]}x${size[2]}`)) : undefined;
  const wantsProduct = has(t, 'porcelanato', 'piso', 'ceramica', 'baldosa', 'busco', 'tienen', 'recomiend', 'mostrar', 'muestrame', 'opcion', 'modelo', 'precio');
  if (sku && !area) {
    const p = await productDetail(sku);
    if (p) {
      const rec = p.recommendedFor.length ? ` Recomendado para ${joinList(p.recommendedFor)}.` : '';
      return reply(`${p.name} (${p.size}): ${p.priceM2} por m², ${p.priceBox} por caja de ${p.m2PerBox} m². ${p.availableBoxes > 0 ? `${p.availableBoxes} cajas disponibles.` : 'Sin existencias en este momento.'}${rec}`, {
        products: [p],
        suggestions: ['¿Cuántas cajas necesito para 20 m²?'],
      });
    }
  }
  if (use || color || sizeLabel || wantsProduct) {
    const textQuery = !use && !color && !sizeLabel ? last.replace(/[¿?¡!.,]/g, ' ').replace(/\b(porcelanatos?|pisos?|busco|tienen|quiero|necesito|para|de|un|una|el|la|los|las)\b/gi, ' ').trim() : undefined;
    const found = await searchProducts({ use, color: color ?? undefined, size: sizeLabel, text: textQuery || undefined, limit: 4 });
    if (found.total === 0 && textQuery) {
      return reply(`No encontré piezas que coincidan con “${textQuery}”. Prueba por uso (baño, cocina, exterior), color o formato, o revisa el catálogo con sus filtros.`, {
        actions: [{ label: 'Ver catálogo', url: '/catalogo' }],
      });
    }
    if (found.total === 0) return reply('No encontré piezas con esas características. Prueba con otro color o formato, o revisa el catálogo completo con sus filtros.', { actions: [{ label: 'Ver catálogo', url: '/catalogo' }] });
    return productsReply(found, use, color, sizeLabel, reply);
  }

  const faq = info.faq.find((f) => norm(f.q).split(' ').filter((w) => w.length > 4).some((w) => t.includes(w)));
  if (faq) return reply(faq.a);

  return reply('No estoy seguro de haber entendido. Puedo ayudarte con el catálogo, el cálculo de cajas, el horario, los métodos de pago, la tasa BCV o el estado de tu orden. Para otra consulta, escribe a tu vendedor.', {
    suggestions: SUGGESTIONS,
    actions: sellerAction ? [sellerAction] : [],
  });
}

function productsReply(
  found: { total: number; products: ProductSummary[] },
  use: Use | undefined,
  color: string | undefined,
  size: string | undefined,
  reply: (text: string, extra?: Partial<AssistantReply>) => AssistantReply,
) {
  const filters = [use && `para ${USE_LABELS[use]}`, color && `en ${color.toLowerCase()}`, size && `de ${size}`].filter(Boolean).join(' ');
  const params = new URLSearchParams();
  if (use) params.set('use', use);
  if (color) params.set('color', color);
  if (size) params.set('size', size);
  return reply(
    `Encontré ${found.total} ${found.total === 1 ? 'pieza' : 'piezas'}${filters ? ` ${filters}` : ''}. Aquí tienes ${found.products.length === found.total ? (found.total === 1 ? 'la opción' : 'todas') : `las primeras ${found.products.length}`}; abre una para ver detalles o pregúntame cuántas cajas necesitas.`,
    {
      products: found.products,
      actions: found.total > found.products.length ? [{ label: 'Ver todas en el catálogo', url: `/catalogo${params.size ? `?${params}` : ''}` }] : [],
    },
  );
}
