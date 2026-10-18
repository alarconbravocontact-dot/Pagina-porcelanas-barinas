import type { Prisma, QuantityMode } from '@prisma/client';
import { computeLine, usdCentsToVesCents, PricingError } from '@porcelanas/shared';
import { prisma, type Tx } from '../db';
import { conflict, badRequest } from '../lib/errors';
import { storage } from '../lib/storage';
import { getCurrentRate, type RateStatus } from './rates';
import { getSettings } from './settings';

export interface LineRequest {
  productId: string;
  mode: QuantityMode;
  quantity: string | number;
}

export interface QuoteLine {
  productId: string;
  sku: string;
  name: string;
  color: string;
  sizeLabel: string;
  imageUrl: string | null;
  boxAreaUnits: number;
  piecesPerBox: number;
  mode: QuantityMode;
  requestedQuantity: string;
  boxes: number;
  areaUnits: number;
  priceBoxCents: number;
  priceM2Cents: number;
  lineTotalCents: number;
  availableBoxes: number;
  stockOk: boolean;
  error: string | null;
}

export interface QuoteResult {
  lines: QuoteLine[];
  subtotalCents: number;
  totalBoxes: number;
  totalAreaUnits: number;
  rate: RateStatus | null;
  totalVesCents: number | null;
  valid: boolean;
}

export function normalizeQuantity(mode: QuantityMode, quantity: string | number): string {
  const text = String(quantity).trim().replace(',', '.');
  if (mode === 'BOXES') {
    if (!/^\d+$/.test(text) || Number(text) <= 0) throw new PricingError('La cantidad de cajas debe ser un entero mayor que cero');
    return String(Number(text));
  }
  if (!/^\d+(\.\d{1,4})?$/.test(text) || Number(text) <= 0) throw new PricingError('Cantidad de m² inválida');
  return text.replace(/^0+(?=\d)/, '');
}

/**
 * Calcula una cotización con los precios vigentes. En modo estricto lanza un error si
 * algún producto no está disponible; en modo tolerante (carrito) marca la línea con error.
 */
export async function computeQuote(requests: LineRequest[], opts: { strict: boolean; db?: Tx }): Promise<QuoteResult> {
  const db = opts.db ?? prisma;
  const ids = [...new Set(requests.map((r) => r.productId))];
  if (ids.length !== requests.length) throw badRequest('DUPLICATE_LINE', 'Un producto aparece repetido en la cotización');
  const products = await db.product.findMany({
    where: { id: { in: ids } },
    include: { inventory: true, images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: QuoteLine[] = [];
  for (const req of requests) {
    const p = byId.get(req.productId);
    if (!p || p.status !== 'ACTIVE') {
      if (opts.strict) throw conflict('PRODUCT_UNAVAILABLE', 'Un producto ya no está disponible para la venta', { productId: req.productId });
      lines.push({
        productId: req.productId,
        sku: p?.sku ?? '',
        name: p?.name ?? 'Producto no disponible',
        color: p?.color ?? '',
        sizeLabel: p?.sizeLabel ?? '',
        imageUrl: p?.images[0] ? storage.publicUrl(p.images[0].storageKey) : null,
        boxAreaUnits: p?.boxAreaUnits ?? 0,
        piecesPerBox: p?.piecesPerBox ?? 0,
        mode: req.mode,
        requestedQuantity: String(req.quantity),
        boxes: 0,
        areaUnits: 0,
        priceBoxCents: 0,
        priceM2Cents: 0,
        lineTotalCents: 0,
        availableBoxes: 0,
        stockOk: false,
        error: 'Este producto ya no está disponible',
      });
      continue;
    }
    const qty = normalizeQuantity(req.mode, req.quantity);
    const line = computeLine({ mode: req.mode, quantity: qty, boxAreaUnits: p.boxAreaUnits, priceBoxCents: p.priceBoxCents });
    const available = Math.max(0, (p.inventory?.onHandBoxes ?? 0) - (p.inventory?.reservedBoxes ?? 0));
    const stockOk = line.boxes <= available;
    lines.push({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      color: p.color,
      sizeLabel: p.sizeLabel,
      imageUrl: p.images[0] ? storage.publicUrl(p.images[0].storageKey) : null,
      boxAreaUnits: p.boxAreaUnits,
      piecesPerBox: p.piecesPerBox,
      mode: req.mode,
      requestedQuantity: qty,
      boxes: line.boxes,
      areaUnits: line.areaUnits,
      priceBoxCents: line.priceBoxCents,
      priceM2Cents: line.priceM2Cents,
      lineTotalCents: line.lineTotalCents,
      availableBoxes: available,
      stockOk,
      error: stockOk ? null : `Solo hay ${available} cajas disponibles`,
    });
  }
  const valid = lines.every((l) => !l.error);
  const subtotalCents = lines.reduce((a, l) => a + l.lineTotalCents, 0);
  const rate = await getCurrentRate();
  return {
    lines,
    subtotalCents,
    totalBoxes: lines.reduce((a, l) => a + l.boxes, 0),
    totalAreaUnits: lines.reduce((a, l) => a + l.areaUnits, 0),
    rate,
    totalVesCents: rate ? usdCentsToVesCents(subtotalCents, rate.rate) : null,
    valid,
  };
}

/** Cotización persistida con la tasa utilizada, válida durante el tiempo configurado. */
export async function createQuote(requests: LineRequest[], userId: string | null) {
  const result = await computeQuote(requests, { strict: true });
  const settings = await getSettings();
  const validUntil = new Date(Date.now() + settings.quote.validityMinutes * 60_000);
  const quote = await prisma.quote.create({
    data: {
      userId,
      exchangeRateId: result.rate?.id ?? null,
      rateValue: result.rate?.rate ?? null,
      subtotalCents: result.subtotalCents,
      totalVesCents: result.totalVesCents,
      validUntil,
      lines: result.lines.map((l) => ({
        productId: l.productId,
        mode: l.mode,
        quantity: l.requestedQuantity,
        boxes: l.boxes,
        priceBoxCents: l.priceBoxCents,
        lineTotalCents: l.lineTotalCents,
      })) as Prisma.InputJsonValue,
    },
  });
  return { ...result, quoteId: quote.id, validUntil };
}

export interface StoredQuoteLine {
  productId: string;
  mode: QuantityMode;
  quantity: string;
  boxes: number;
  priceBoxCents: number;
  lineTotalCents: number;
}

/** Comprueba que una cotización guardada coincide exactamente con el cálculo actual. */
export function quoteMatches(stored: StoredQuoteLine[], current: QuoteLine[]): boolean {
  if (stored.length !== current.length) return false;
  const map = new Map(current.map((l) => [l.productId, l]));
  return stored.every((s) => {
    const c = map.get(s.productId);
    return (
      !!c &&
      c.mode === s.mode &&
      c.requestedQuantity === s.quantity &&
      c.boxes === s.boxes &&
      c.priceBoxCents === s.priceBoxCents &&
      c.lineTotalCents === s.lineTotalCents
    );
  });
}
