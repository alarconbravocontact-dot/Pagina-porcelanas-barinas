import type { OrderType } from '@prisma/client';
import {
  addDays,
  isValidDateString,
  localDateString,
  weekdayOf,
  zonedDateTimeToInstant,
  type BusinessSettings,
} from '@porcelanas/shared';
import { prisma, type Tx } from '../db';
import { badRequest, conflict } from '../lib/errors';
import { getSettings } from './settings';

export const toDbDate = (s: string) => new Date(`${s}T00:00:00Z`);
export const fromDbDate = (d: Date) => d.toISOString().slice(0, 10);

export interface DateCheck {
  ok: boolean;
  reason?: string;
}

function maxDays(type: OrderType, s: BusinessSettings) {
  return type === 'PICKUP' ? s.pickup.maxDaysAheadPickup : s.pickup.maxDaysAheadPrepay;
}

/** Valida reglas de calendario (sin capacidad). */
export function checkDateRules(
  date: string,
  type: OrderType,
  s: BusinessSettings,
  blocked: Set<string>,
  now = new Date(),
): DateCheck {
  if (!isValidDateString(date)) return { ok: false, reason: 'Fecha inválida' };
  const tz = s.store.timezone;
  const today = localDateString(now, tz);
  if (date < today) return { ok: false, reason: 'La fecha ya pasó' };
  if (date > addDays(today, maxDays(type, s))) {
    return { ok: false, reason: `Solo se puede programar hasta ${maxDays(type, s)} días por adelantado` };
  }
  const day = s.pickup.weekdays[weekdayOf(date)];
  if (!day?.enabled) return { ok: false, reason: 'La sede no atiende retiros ese día' };
  if (blocked.has(date)) return { ok: false, reason: 'Fecha bloqueada por la sede' };
  const closing = zonedDateTimeToInstant(date, day.close, tz);
  if (closing.getTime() < now.getTime() + s.pickup.minAdvanceHours * 3_600_000) {
    return { ok: false, reason: `Se requieren al menos ${s.pickup.minAdvanceHours} horas de anticipación` };
  }
  return { ok: true };
}

async function blockedSet(from: string, to: string) {
  const rows = await prisma.blockedPickupDate.findMany({ where: { date: { gte: toDbDate(from), lte: toDbDate(to) } } });
  return new Set(rows.map((r) => fromDbDate(r.date)));
}

export async function getAvailability(type: OrderType, now = new Date()) {
  const s = await getSettings();
  const today = localDateString(now, s.store.timezone);
  const last = addDays(today, maxDays(type, s));
  const blocked = await blockedSet(today, last);
  const booked = await prisma.pickupDay.findMany({ where: { date: { gte: toDbDate(today), lte: toDbDate(last) } } });
  const bookedMap = new Map(booked.map((b) => [fromDbDate(b.date), b.booked]));
  const days = [];
  for (let d = today; d <= last; d = addDays(d, 1)) {
    const rule = checkDateRules(d, type, s, blocked, now);
    const used = bookedMap.get(d) ?? 0;
    const remaining = Math.max(0, s.pickup.capacityPerDay - used);
    const wd = s.pickup.weekdays[weekdayOf(d)]!;
    days.push({
      date: d,
      available: rule.ok && remaining > 0,
      reason: rule.ok ? (remaining > 0 ? null : 'Capacidad completa') : rule.reason,
      remaining: rule.ok ? remaining : 0,
      open: wd.enabled ? wd.open : null,
      close: wd.enabled ? wd.close : null,
    });
  }
  return { timezone: s.store.timezone, today, days };
}

export async function assertDateAllowed(date: string, type: OrderType, now = new Date()) {
  const s = await getSettings();
  const blocked = await blockedSet(date, date);
  const res = checkDateRules(date, type, s, blocked, now);
  if (!res.ok) throw badRequest('INVALID_PICKUP_DATE', `Fecha de retiro no disponible: ${res.reason}`);
  return s;
}

/** Ocupa un cupo del día de forma atómica; falla si la capacidad está completa. */
export async function reserveCapacity(tx: Tx, date: string, capacity: number) {
  await tx.$executeRaw`INSERT INTO "PickupDay" ("date", "booked", "updatedAt") VALUES (${toDbDate(date)}::date, 0, now()) ON CONFLICT ("date") DO NOTHING`;
  const rows = await tx.$queryRaw<{ booked: number }[]>`
    UPDATE "PickupDay" SET "booked" = "booked" + 1, "updatedAt" = now()
     WHERE "date" = ${toDbDate(date)}::date AND "booked" < ${capacity}::int
     RETURNING "booked"`;
  if (!rows[0]) throw conflict('PICKUP_FULL', 'La capacidad de retiro para esa fecha está completa. Elija otra fecha.');
}

export async function releaseCapacity(tx: Tx, date: Date) {
  await tx.$executeRaw`UPDATE "PickupDay" SET "booked" = "booked" - 1, "updatedAt" = now() WHERE "date" = ${date}::date AND "booked" > 0`;
}
