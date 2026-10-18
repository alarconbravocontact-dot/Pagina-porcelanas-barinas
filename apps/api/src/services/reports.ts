import { Prisma } from '@prisma/client';
import { addDays, localDateString, zonedDateTimeToInstant } from '@porcelanas/shared';
import { prisma } from '../db';
import { getSettings } from './settings';
import { toDbDate } from './pickup';

const SALE_STATUSES = Prisma.sql`('CONFIRMED','READY_FOR_PICKUP','DELIVERED')`;

/** Indicadores calculados desde la base de datos. Los importes en USD y Bs nunca se suman entre sí. */
export async function dashboard(range: { from?: string; to?: string } = {}) {
  const s = await getSettings();
  const tz = s.store.timezone;
  const today = localDateString(new Date(), tz);
  const to = range.to ?? today;
  const from = range.from ?? addDays(to, -29);
  const fromTs = zonedDateTimeToInstant(from, '00:00', tz);
  const toTs = zonedDateTimeToInstant(addDays(to, 1), '00:00', tz);

  const dailySales = await prisma.$queryRaw<{ day: string; orders: number; total_cents: bigint; area_units: bigint }[]>`
    SELECT to_char((o."confirmedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
           COUNT(*)::int AS orders,
           COALESCE(SUM(o."totalCents"), 0)::bigint AS total_cents,
           COALESCE(SUM(o."totalAreaUnits"), 0)::bigint AS area_units
      FROM "Order" o
     WHERE o."confirmedAt" >= ${fromTs} AND o."confirmedAt" < ${toTs}
       AND o."status"::text IN ${SALE_STATUSES}
     GROUP BY 1 ORDER BY 1`;

  const bySeller = await prisma.$queryRaw<{ seller_id: string; name: string; orders: number; total_cents: bigint; area_units: bigint }[]>`
    SELECT s."id" AS seller_id, s."displayName" AS name, COUNT(o."id")::int AS orders,
           COALESCE(SUM(o."totalCents"), 0)::bigint AS total_cents,
           COALESCE(SUM(o."totalAreaUnits"), 0)::bigint AS area_units
      FROM "Order" o JOIN "Seller" s ON s."id" = o."sellerId"
     WHERE o."confirmedAt" >= ${fromTs} AND o."confirmedAt" < ${toTs}
       AND o."status"::text IN ${SALE_STATUSES}
     GROUP BY s."id", s."displayName" ORDER BY total_cents DESC`;

  const collected = await prisma.$queryRaw<{ currency: string; payments: number; amount_cents: bigint; credit_usd_cents: bigint }[]>`
    SELECT p."currency"::text AS currency, COUNT(*)::int AS payments,
           COALESCE(SUM(p."amountCents"), 0)::bigint AS amount_cents,
           COALESCE(SUM(p."creditUsdCents"), 0)::bigint AS credit_usd_cents
      FROM "Payment" p
     WHERE p."status" = 'APPROVED' AND p."reviewedAt" >= ${fromTs} AND p."reviewedAt" < ${toTs}
     GROUP BY 1`;

  const [pendingPayments, pendingPaymentOrders, pendingDelivery, upcoming, lowStock] = await Promise.all([
    prisma.payment.aggregate({ where: { status: 'PENDING' }, _count: true }),
    prisma.order.count({ where: { status: 'PENDING_PAYMENT' } }),
    prisma.order.count({ where: { status: { in: ['CONFIRMED', 'READY_FOR_PICKUP'] } } }),
    prisma.order.findMany({
      where: { status: { in: ['PENDING_PAYMENT', 'CONFIRMED', 'READY_FOR_PICKUP'] }, pickupDate: { gte: toDbDate(today), lte: toDbDate(addDays(today, 7)) } },
      orderBy: { pickupDate: 'asc' },
      take: 50,
      select: { id: true, code: true, pickupDate: true, status: true, totalBoxes: true, contactName: true, seller: { select: { displayName: true } } },
    }),
    prisma.$queryRaw<{ id: string; sku: string; name: string; available: number; threshold: number }[]>`
      SELECT p."id", p."sku", p."name", (i."onHandBoxes" - i."reservedBoxes")::int AS available, i."lowStockThreshold"::int AS threshold
        FROM "Product" p JOIN "Inventory" i ON i."productId" = p."id"
       WHERE p."status" = 'ACTIVE' AND (i."onHandBoxes" - i."reservedBoxes") <= i."lowStockThreshold"
       ORDER BY available ASC LIMIT 50`,
  ]);

  const n = (v: bigint | number) => Number(v);
  return {
    range: { from, to, timezone: tz },
    totals: {
      salesUsdCents: dailySales.reduce((a, r) => a + n(r.total_cents), 0),
      orders: dailySales.reduce((a, r) => a + r.orders, 0),
      areaUnitsSold: dailySales.reduce((a, r) => a + n(r.area_units), 0),
    },
    dailySales: dailySales.map((r) => ({ day: r.day, orders: r.orders, totalCents: n(r.total_cents), areaUnits: n(r.area_units) })),
    salesBySeller: bySeller.map((r) => ({ sellerId: r.seller_id, name: r.name, orders: r.orders, totalCents: n(r.total_cents), areaUnits: n(r.area_units) })),
    collectedByCurrency: collected.map((r) => ({ currency: r.currency, payments: r.payments, amountCents: n(r.amount_cents), creditUsdCents: n(r.credit_usd_cents) })),
    pendingPayments: pendingPayments._count,
    pendingPaymentOrders,
    pendingDelivery,
    upcomingPickups: upcoming.map((u) => ({ ...u, pickupDate: u.pickupDate.toISOString().slice(0, 10) })),
    lowStock,
  };
}
