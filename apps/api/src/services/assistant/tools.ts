import {
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PAYMENT_REVIEW_STATE_LABELS,
  WEEKDAY_LABELS,
  boxesForArea,
  formatM2,
  formatUSD,
  formatVES,
  m2ToUnits,
  unitsToM2String,
  whatsappLink,
} from '@porcelanas/shared';
import Decimal from 'decimal.js';
import { prisma } from '../../db';
import { catalogFacets, getProduct, listCatalog } from '../catalog';
import { paymentReviewState } from '../orders';
import { isMethodConfigured } from '../paymentMethods';
import { fromDbDate } from '../pickup';
import { getCurrentRate } from '../rates';
import { getSettings } from '../settings';

/**
 * Consultas de solo lectura que usa el asistente (con Claude o con el motor local).
 * Devuelven únicamente datos públicos del negocio o, en `myOrders`, las órdenes del propio cliente.
 * Nunca exponen cédulas, datos de recepción de pagos ni información interna.
 */

export const USES = ['salas', 'cocina', 'pisoBano', 'ducha', 'exterior', 'paredes'] as const;
export type Use = (typeof USES)[number];
export const USE_LABELS: Record<Use, string> = {
  salas: 'salas',
  cocina: 'cocina',
  pisoBano: 'piso de baño',
  ducha: 'ducha',
  exterior: 'exteriores',
  paredes: 'paredes',
};

export interface ProductSummary {
  sku: string;
  name: string;
  size: string;
  finish: string | null;
  color: string | null;
  priceM2: string;
  priceBox: string;
  priceBcvM2: string | null;
  m2PerBox: string;
  availableBoxes: number;
  url: string;
  imageUrl: string | null;
}

type PublicProduct = Awaited<ReturnType<typeof getProduct>>;

function summarize(p: PublicProduct): ProductSummary {
  return {
    sku: p.sku,
    name: p.name,
    size: p.sizeLabel,
    finish: p.finishNote || null,
    color: p.color,
    priceM2: formatUSD(p.priceM2Cents),
    priceBox: formatUSD(p.priceBoxCents),
    priceBcvM2: p.hasBcvPrice ? formatUSD(p.priceBcvM2Cents) : null,
    m2PerBox: p.boxAreaM2,
    availableBoxes: p.availableBoxes,
    url: `/producto/${encodeURIComponent(p.sku)}`,
    imageUrl: p.images[0]?.url ?? null,
  };
}

export interface SearchInput {
  text?: string;
  use?: Use;
  color?: string;
  size?: string;
  onlyAvailable?: boolean;
  maxPriceM2?: number;
  limit?: number;
}

export async function searchProducts(input: SearchInput): Promise<{ total: number; products: ProductSummary[] }> {
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 8);
  const base = {
    use: input.use,
    color: input.color,
    size: input.size,
    available: input.onlyAvailable ? ('true' as const) : undefined,
    maxPrice: input.maxPriceM2 && input.maxPriceM2 > 0 ? input.maxPriceM2.toFixed(2) : undefined,
    sort: 'name' as const,
    page: 1,
    pageSize: limit,
  };
  const text = input.text?.trim().slice(0, 100);
  let res = await listCatalog({ ...base, q: text || undefined });
  // Si el texto completo no aparece en nombre, SKU o color, prueba con cada palabra significativa.
  if (res.total === 0 && text && text.includes(' ')) {
    for (const word of text.split(/\s+/).filter((w) => w.length >= 4)) {
      res = await listCatalog({ ...base, q: word });
      if (res.total > 0) break;
    }
  }
  return { total: res.total, products: res.items.map(summarize) };
}

export async function productDetail(sku: string) {
  try {
    const p = await getProduct(sku);
    const guide = p.usageGuide ?? {};
    return {
      ...summarize(p),
      description: p.description,
      slipRating: p.slipRating,
      recommendedFor: USES.filter((u) => guide[u] === 'YES').map((u) => USE_LABELS[u]),
      withCaution: USES.filter((u) => guide[u] === 'CAUTION').map((u) => USE_LABELS[u]),
      notRecommended: USES.filter((u) => guide[u] === 'NO').map((u) => USE_LABELS[u]),
    };
  } catch {
    return null;
  }
}

/** Cajas necesarias para una superficie, con el mismo redondeo que el carrito (hacia arriba). */
export async function calculateBoxes(sku: string, squareMeters: string | number) {
  let units: number;
  try {
    units = m2ToUnits(squareMeters);
  } catch {
    return { error: 'Indica los metros cuadrados con un número, por ejemplo 30 o 12,5.' };
  }
  if (units <= 0) return { error: 'La superficie debe ser mayor que cero.' };
  const p = await productDetail(sku);
  if (!p) return { error: `No encontré el producto ${sku} en el catálogo.` };
  const full = await getProduct(sku);
  const boxes = boxesForArea(units, full.boxAreaUnits);
  const totalCents = boxes * full.priceBoxCents;
  const totalBcvCents = boxes * full.priceBcvBoxCents;
  const rate = await getCurrentRate();
  const vesCents = rate ? new Decimal(totalBcvCents).mul(rate.rate).toDecimalPlaces(0).toNumber() : null;
  return {
    product: summarize(full),
    requestedM2: unitsToM2String(units),
    boxes,
    coveredM2: formatM2(boxes * full.boxAreaUnits),
    totalUsd: formatUSD(totalCents),
    totalBcvUsd: full.hasBcvPrice ? formatUSD(totalBcvCents) : null,
    totalBs: vesCents != null ? formatVES(vesCents) : null,
    rate: rate ? rate.rate : null,
    enoughStock: full.availableBoxes >= boxes,
    availableBoxes: full.availableBoxes,
  };
}

export async function storeInfo() {
  const [s, rate, methods, sellers, facets] = await Promise.all([
    getSettings(),
    getCurrentRate(),
    prisma.paymentMethod.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.seller.findMany({
      where: { active: true, user: { active: true } },
      orderBy: { displayName: 'asc' },
      select: { displayName: true, city: true, branch: true, publicPhone: true, whatsapp: true, publicEmail: true },
    }),
    catalogFacets(),
  ]);
  return {
    store: { name: s.store.name, city: s.store.city, address: s.store.address || null, hours: s.store.hoursText || null, phone: s.store.phone || null, mapUrl: s.store.mapUrl || null },
    pickupDays: s.pickup.weekdays.map((d, i) => ({ day: WEEKDAY_LABELS[i], open: d.enabled, hours: d.enabled ? `${d.open}–${d.close}` : null })),
    pickupMaxDaysAhead: s.pickup.maxDaysAheadPickup,
    prepay: { minPercent: s.reservation.prepayMinPercent, maxDaysAhead: s.pickup.maxDaysAheadPrepay, holdHours: s.reservation.holdHours },
    cancellation: { minHoursBefore: s.cancellation.customerCancelMinHours, rescheduleMinHours: s.cancellation.rescheduleMinHours, maxReschedules: s.cancellation.maxReschedules },
    // Solo nombre y moneda: los datos de recepción se muestran al cliente dentro de su orden.
    paymentMethods: methods.map((m) => ({ name: m.name, currency: m.currency, priceList: m.currency === 'VES' ? 'precio BCV' : 'precio en divisas', available: isMethodConfigured(m) })),
    rate: rate ? { bsPerUsd: rate.rate, effectiveDate: rate.effectiveDate, stale: rate.stale } : null,
    sellers: sellers.map((x) => ({ name: x.displayName, city: x.city, branch: x.branch, phone: x.publicPhone, email: x.publicEmail, whatsappUrl: whatsappLink(x.whatsapp, '') })),
    whatsappUrl: whatsappLink(s.whatsapp.number, s.whatsapp.greeting),
    catalog: { colors: facets.colors.map((c) => c.value).filter(Boolean), sizes: facets.sizes.map((c) => c.value), environments: facets.categories.map((c) => c.name) },
    faq: s.faq.items.slice(0, 20),
  };
}

/** Órdenes del cliente con sesión iniciada; sin sesión de cliente no devuelve nada. */
export async function myOrders(customerId: string | null) {
  if (!customerId) return { signedIn: false as const, orders: [] };
  const rows = await prisma.order.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      code: true,
      type: true,
      status: true,
      paymentStatus: true,
      pickupDate: true,
      totalCents: true,
      balanceCents: true,
      totalBoxes: true,
      seller: { select: { displayName: true } },
      payments: { select: { status: true, reviewStartedAt: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  return {
    signedIn: true as const,
    orders: rows.map((o) => ({
      code: o.code,
      type: ORDER_TYPE_LABELS[o.type],
      status: ORDER_STATUS_LABELS[o.status],
      payment: PAYMENT_REVIEW_STATE_LABELS[paymentReviewState(o)],
      pickupDate: fromDbDate(o.pickupDate),
      total: formatUSD(o.totalCents),
      balance: formatUSD(o.balanceCents),
      boxes: o.totalBoxes,
      seller: o.seller.displayName,
      url: `/cuenta/operaciones/${o.code}`,
    })),
  };
}
