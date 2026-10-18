import Decimal from 'decimal.js';
import type { QuantityMode } from './enums';

/**
 * Las superficies se manejan en unidades enteras de cm² (1 m² = 10 000 unidades)
 * y los importes en céntimos enteros. Nunca se usan flotantes para dinero.
 */
export const AREA_SCALE = 10_000;
export const MAX_BOXES_PER_LINE = 100_000;

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingError';
  }
}

/** Convierte un texto/número de m² (p. ej. "30", "2,16", 2.16) a unidades de cm². */
export function m2ToUnits(value: string | number): number {
  const text = typeof value === 'number' ? String(value) : value.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(text)) throw new PricingError('Cantidad de metros cuadrados inválida');
  const units = new D(text).mul(AREA_SCALE);
  if (!units.isInteger()) throw new PricingError('Se admiten como máximo 4 decimales en m²');
  return units.toNumber();
}

export function unitsToM2String(units: number, decimals = 2): string {
  return new D(units).div(AREA_SCALE).toFixed(decimals);
}

/** Cajas necesarias para cubrir una superficie (siempre se redondea hacia arriba). */
export function boxesForArea(requestedUnits: number, boxAreaUnits: number): number {
  if (!Number.isInteger(boxAreaUnits) || boxAreaUnits <= 0) throw new PricingError('Metros por caja inválidos');
  if (!Number.isInteger(requestedUnits) || requestedUnits <= 0) throw new PricingError('La cantidad debe ser mayor que cero');
  return Math.ceil(requestedUnits / boxAreaUnits);
}

export function priceM2FromBox(priceBoxCents: number, boxAreaUnits: number): number {
  return new D(priceBoxCents).mul(AREA_SCALE).div(boxAreaUnits).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function priceBoxFromM2(priceM2Cents: number, boxAreaUnits: number): number {
  return new D(priceM2Cents).mul(boxAreaUnits).div(AREA_SCALE).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export interface LineInput {
  mode: QuantityMode;
  /** Número de cajas (modo BOXES) o m² en texto/número (modo M2). */
  quantity: string | number;
  boxAreaUnits: number;
  priceBoxCents: number;
}

export interface LineResult {
  mode: QuantityMode;
  requestedBoxes: number | null;
  requestedAreaUnits: number | null;
  boxes: number;
  areaUnits: number;
  priceBoxCents: number;
  priceM2Cents: number;
  lineTotalCents: number;
}

export function computeLine(input: LineInput): LineResult {
  const { mode, boxAreaUnits, priceBoxCents } = input;
  if (!Number.isInteger(priceBoxCents) || priceBoxCents < 0) throw new PricingError('Precio inválido');
  let boxes: number;
  let requestedBoxes: number | null = null;
  let requestedAreaUnits: number | null = null;
  if (mode === 'BOXES') {
    const n = typeof input.quantity === 'number' ? input.quantity : Number(String(input.quantity).trim());
    if (!Number.isInteger(n) || n <= 0) throw new PricingError('La cantidad de cajas debe ser un entero mayor que cero');
    boxes = n;
    requestedBoxes = n;
  } else {
    requestedAreaUnits = m2ToUnits(input.quantity);
    boxes = boxesForArea(requestedAreaUnits, boxAreaUnits);
  }
  if (boxes > MAX_BOXES_PER_LINE) throw new PricingError('Cantidad excede el máximo permitido por línea');
  return {
    mode,
    requestedBoxes,
    requestedAreaUnits,
    boxes,
    areaUnits: boxes * boxAreaUnits,
    priceBoxCents,
    priceM2Cents: priceM2FromBox(priceBoxCents, boxAreaUnits),
    lineTotalCents: boxes * priceBoxCents,
  };
}

/** Tasa expresada como texto decimal (Bs por 1 USD), p. ej. "36.54320000". */
export function normalizeRate(rate: string | number): string {
  const text = String(rate).trim().replace(',', '.');
  if (!/^\d+(\.\d{1,8})?$/.test(text)) throw new PricingError('Tasa inválida (máximo 8 decimales)');
  const d = new D(text);
  if (d.lte(0)) throw new PricingError('La tasa debe ser mayor que cero');
  return d.toFixed(8);
}

export function usdCentsToVesCents(usdCents: number, rate: string): number {
  return new D(usdCents).mul(new D(rate)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** Abono en USD equivalente a un pago en Bs (se redondea hacia abajo para no acreditar de más). */
export function vesCentsToUsdCents(vesCents: number, rate: string): number {
  return new D(vesCents).div(new D(rate)).toDecimalPlaces(0, Decimal.ROUND_DOWN).toNumber();
}

/** Porcentaje (entero 0-100) de un importe, redondeado hacia arriba al céntimo. */
export function percentOfCents(cents: number, percent: number): number {
  return new D(cents).mul(percent).div(100).toDecimalPlaces(0, Decimal.ROUND_CEIL).toNumber();
}

/** Convierte "12,50" o "12.5" a céntimos (1250). */
export function parseMoneyToCents(value: string | number): number {
  const text = String(value).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new PricingError('Importe inválido (máximo 2 decimales)');
  return new D(text).mul(100).toNumber();
}

export function centsToDecimalString(cents: number): string {
  return new D(cents).div(100).toFixed(2);
}

const usdFmt = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatUSD(cents: number): string {
  return `$ ${usdFmt.format(cents / 100)}`;
}

export function formatVES(cents: number): string {
  return `Bs. ${usdFmt.format(cents / 100)}`;
}

export function formatM2(units: number): string {
  return `${usdFmt.format(units / AREA_SCALE)} m²`;
}

export function formatRate(rate: string): string {
  const n = new D(rate);
  return new Intl.NumberFormat('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 8 }).format(n.toNumber());
}
