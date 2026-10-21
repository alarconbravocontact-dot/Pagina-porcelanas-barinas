import { addDays, localDateString, normalizeRate } from '@porcelanas/shared';
import { prisma } from '../db';
import { getSettings } from './settings';
import { badRequest } from '../lib/errors';

export interface RateStatus {
  id: string;
  rate: string;
  source: 'BCV_AUTO' | 'MANUAL';
  sourceUrl: string | null;
  sourceNote: string | null;
  effectiveDate: string;
  createdAt: Date;
  createdBy: string | null;
  ageHours: number;
  stale: boolean;
}

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);

/** Tasa vigente: la de fecha valor más reciente que no sea futura en la zona de la sede. */
export async function getCurrentRate(): Promise<RateStatus | null> {
  const settings = await getSettings();
  const today = localDateString(new Date(), settings.store.timezone);
  const row = await prisma.exchangeRate.findFirst({
    where: { currency: 'VES', effectiveDate: { lte: toDate(today) } },
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    include: { createdBy: { select: { email: true } } },
  });
  if (!row) return null;
  const ageHours = (Date.now() - row.createdAt.getTime()) / 3_600_000;
  return {
    id: row.id,
    rate: row.rate.toFixed(8),
    source: row.source,
    sourceUrl: row.sourceUrl,
    sourceNote: row.sourceNote,
    effectiveDate: dateOnly(row.effectiveDate),
    createdAt: row.createdAt,
    createdBy: row.createdBy?.email ?? null,
    ageHours: Math.round(ageHours * 10) / 10,
    stale: ageHours > settings.rate.maxAgeHours,
  };
}

export async function recordManualRate(input: { rate: string; effectiveDate: string; sourceNote: string }, userId: string) {
  const settings = await getSettings();
  const today = localDateString(new Date(), settings.store.timezone);
  if (input.effectiveDate > addDays(today, 7)) {
    throw badRequest('INVALID_DATE', 'La fecha valor no puede superar 7 días en el futuro');
  }
  return prisma.exchangeRate.create({
    data: {
      currency: 'VES',
      rate: normalizeRate(input.rate),
      source: 'MANUAL',
      sourceNote: input.sourceNote,
      effectiveDate: toDate(input.effectiveDate),
      createdById: userId,
    },
  });
}

/**
 * Extrae la tasa USD y la fecha valor del HTML del portal del BCV.
 * Estructura esperada: <div id="dolar"> ... <strong> 36,54320000 </strong> ... y
 * <span class="date-display-single" content="2026-10-19T00:00:00-04:00">.
 */
export function parseBcvHtml(html: string): { rate: string; effectiveDate: string } | null {
  const block = html.match(/id=["']dolar["'][\s\S]{0,2000}?<strong>\s*([\d.,]+)\s*<\/strong>/i);
  const date = html.match(/date-display-single[^>]*content=["'](\d{4}-\d{2}-\d{2})T/i);
  if (!block?.[1] || !date?.[1]) return null;
  // Formato venezolano: separador de miles '.', decimales ','.
  const raw = block[1].replace(/\./g, '').replace(',', '.');
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return null;
  const [intPart, decPart = ''] = raw.split('.');
  return { rate: normalizeRate(`${intPart}.${decPart.slice(0, 8) || '0'}`), effectiveDate: date[1] };
}

export type FetchResult =
  | { ok: true; created: boolean; rate: string; effectiveDate: string }
  | { ok: false; error: string };

/** Último intento de la consulta automática (en memoria; se muestra en el panel de la tasa). */
export const autoRateStatus: { last: (FetchResult & { at: Date }) | null } = { last: null };
export function recordAutoRateResult(result: FetchResult, at = new Date()) {
  autoRateStatus.last = { ...result, at };
}

/** Consulta la fuente configurada. Solo registra la tasa si se pudo leer y validar. */
export async function fetchBcvRate(fetchImpl: typeof fetch = fetch): Promise<FetchResult> {
  const settings = await getSettings();
  const url = settings.rate.sourceUrl;
  let html: string;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!res.ok) return { ok: false, error: `La fuente respondió HTTP ${res.status}` };
    html = await res.text();
  } catch (err) {
    // El portal del BCV ha publicado a veces una cadena de certificados incompleta: se informa
    // con claridad en lugar de desactivar la verificación TLS (ver docs/DEPLOYMENT.md).
    const code = String((err as { cause?: { code?: string } }).cause?.code ?? '');
    if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code)) {
      return { ok: false, error: `El certificado de seguridad de la fuente no se pudo verificar (${code}); configure NODE_EXTRA_CA_CERTS según docs/DEPLOYMENT.md` };
    }
    return { ok: false, error: `No se pudo conectar con la fuente: ${(err as Error).message}` };
  }
  const parsed = parseBcvHtml(html);
  if (!parsed) return { ok: false, error: 'No se encontró la tasa USD en la respuesta de la fuente' };
  const existing = await prisma.exchangeRate.findFirst({
    where: { source: 'BCV_AUTO', effectiveDate: toDate(parsed.effectiveDate), rate: parsed.rate },
  });
  if (existing) return { ok: true, created: false, ...parsed };
  await prisma.exchangeRate.create({
    data: {
      currency: 'VES',
      rate: parsed.rate,
      source: 'BCV_AUTO',
      sourceUrl: url,
      sourceNote: 'Obtenida automáticamente del portal configurado',
      effectiveDate: toDate(parsed.effectiveDate),
    },
  });
  return { ok: true, created: true, ...parsed };
}

export async function listRates(limit = 50) {
  const rows = await prisma.exchangeRate.findMany({
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    include: { createdBy: { select: { email: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    rate: r.rate.toFixed(8),
    source: r.source,
    sourceUrl: r.sourceUrl,
    sourceNote: r.sourceNote,
    effectiveDate: dateOnly(r.effectiveDate),
    createdAt: r.createdAt,
    createdBy: r.createdBy?.email ?? null,
  }));
}
