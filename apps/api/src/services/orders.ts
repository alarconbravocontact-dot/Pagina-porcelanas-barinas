import { Prisma, type Order, type OrderStatus } from '@prisma/client';
import {
  addDays,
  localDateString,
  percentOfCents,
  usdCentsToVesCents,
  zonedDateTimeToInstant,
  type CheckoutInput,
} from '@porcelanas/shared';
import { prisma, type Tx } from '../db';
import type { AuthContext } from '../lib/auth';
import { orderCode } from '../lib/crypto';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { adjustInventory } from './inventory';
import { adminUserIds, notify, sellerUserId } from './notifications';
import { assertDateAllowed, fromDbDate, releaseCapacity, reserveCapacity, toDbDate } from './pickup';
import { computeQuote, createQuote, quoteMatches, type StoredQuoteLine } from './quotes';
import { getCurrentRate } from './rates';
import { getSettings } from './settings';

export const ACTIVE_STATUSES: OrderStatus[] = ['PENDING_PAYMENT', 'CONFIRMED', 'READY_FOR_PICKUP'];

export const orderInclude = {
  items: true,
  reservation: true,
  seller: { select: { id: true, displayName: true, phone: true, userId: true } },
  customer: { select: { id: true, fullName: true, phone: true, userId: true } },
  preferredMethod: true,
  payments: {
    orderBy: { createdAt: 'desc' },
    include: {
      method: { select: { id: true, name: true, kind: true, currency: true } },
      proofs: { orderBy: { createdAt: 'desc' }, select: { id: true, status: true, mimeType: true, sizeBytes: true, originalName: true, createdAt: true } },
      reviewedBy: { select: { email: true } },
    },
  },
  events: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { email: true, role: true } } } },
  notes: { orderBy: { createdAt: 'desc' }, include: { author: { select: { email: true, role: true } } } },
} satisfies Prisma.OrderInclude;

export type OrderFull = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export function serializeOrder(o: OrderFull, viewer: 'customer' | 'staff') {
  return {
    id: o.id,
    code: o.code,
    type: o.type,
    status: o.status,
    paymentStatus: o.paymentStatus,
    subtotalCents: o.subtotalCents,
    totalCents: o.totalCents,
    totalVesCents: o.totalVesCents,
    requiredCents: o.requiredCents,
    paidCents: o.paidCents,
    balanceCents: o.balanceCents,
    totalBoxes: o.totalBoxes,
    totalAreaUnits: o.totalAreaUnits,
    rateValue: o.rateValue.toFixed(8),
    pickupDate: fromDbDate(o.pickupDate),
    rescheduleCount: o.rescheduleCount,
    expiresAt: o.expiresAt,
    confirmedAt: o.confirmedAt,
    readyAt: o.readyAt,
    deliveredAt: o.deliveredAt,
    cancelledAt: o.cancelledAt,
    cancelReason: o.cancelReason,
    contactName: o.contactName,
    contactPhone: o.contactPhone,
    customerNotes: o.customerNotes,
    createdAt: o.createdAt,
    terms: o.termsSnapshot,
    seller: { id: o.seller.id, displayName: o.seller.displayName, ...(viewer === 'staff' ? { phone: o.seller.phone } : {}) },
    customer: viewer === 'staff' ? { id: o.customer.id, fullName: o.customer.fullName, phone: o.customer.phone } : undefined,
    preferredMethod: o.preferredMethod
      ? { id: o.preferredMethod.id, name: o.preferredMethod.name, kind: o.preferredMethod.kind, currency: o.preferredMethod.currency }
      : null,
    reservation: o.reservation
      ? {
          status: o.reservation.status,
          pickupDate: fromDbDate(o.reservation.pickupDate),
          heldUntil: o.reservation.heldUntil,
          releasedAt: o.reservation.releasedAt,
          releaseReason: o.reservation.releaseReason,
        }
      : null,
    items: o.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      sku: i.sku,
      productName: i.productName,
      color: i.color,
      sizeLabel: i.sizeLabel,
      boxAreaUnits: i.boxAreaUnits,
      piecesPerBox: i.piecesPerBox,
      mode: i.mode,
      requestedQuantity: i.requestedQuantity,
      boxes: i.boxes,
      areaUnits: i.areaUnits,
      priceBoxCents: i.priceBoxCents,
      priceM2Cents: i.priceM2Cents,
      lineTotalCents: i.lineTotalCents,
    })),
    payments: o.payments.map((p) => ({
      id: p.id,
      method: p.method,
      currency: p.currency,
      amountCents: p.amountCents,
      creditUsdCents: p.creditUsdCents,
      reference: p.reference,
      paidAt: fromDbDate(p.paidAt),
      payerName: p.payerName,
      notes: p.notes,
      status: p.status,
      reviewedAt: p.reviewedAt,
      reviewNotes: p.reviewNotes,
      reviewedBy: viewer === 'staff' ? (p.reviewedBy?.email ?? null) : undefined,
      createdAt: p.createdAt,
      proofs: p.proofs,
    })),
    events: o.events.map((e) => ({
      id: e.id,
      type: e.type,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      message: e.message,
      createdAt: e.createdAt,
      actor: viewer === 'staff' ? (e.actor?.email ?? 'sistema') : e.actor ? (e.actor.role === 'CUSTOMER' ? 'Usted' : 'Equipo de la tienda') : 'Sistema',
    })),
    notes:
      viewer === 'staff'
        ? o.notes.map((n) => ({ id: n.id, kind: n.kind, body: n.body, author: n.author.email, createdAt: n.createdAt }))
        : undefined,
  };
}

async function logEvent(
  tx: Tx,
  orderId: string,
  type: string,
  message: string,
  actorId: string | null,
  from?: OrderStatus | null,
  to?: OrderStatus | null,
  data?: Prisma.InputJsonValue,
) {
  await tx.orderEvent.create({ data: { orderId, type, message, actorId, fromStatus: from ?? null, toStatus: to ?? null, data } });
}

export async function createOrder(auth: AuthContext & { customerId: string }, input: CheckoutInput, idempotencyKey: string) {
  if (!/^[\w-]{16,100}$/.test(idempotencyKey)) {
    throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'Falta la cabecera Idempotency-Key válida');
  }
  const existing = await prisma.order.findUnique({
    where: { customerId_idempotencyKey: { customerId: auth.customerId, idempotencyKey } },
  });
  if (existing) return { order: existing, replayed: true };

  // Vendedor obligatorio y activo.
  const seller = await prisma.seller.findUnique({ where: { id: input.sellerId }, include: { user: true } });
  if (!seller || !seller.active || !seller.user.active) {
    throw new AppError(422, 'SELLER_INVALID', 'El vendedor seleccionado no existe o no está disponible. Elija otro vendedor.');
  }
  const method = await prisma.paymentMethod.findUnique({ where: { id: input.paymentMethodId } });
  if (!method || !method.active) throw new AppError(422, 'PAYMENT_METHOD_INVALID', 'El método de pago no está disponible');

  const settings = await assertDateAllowed(input.pickupDate, input.type);

  const rate = await getCurrentRate();
  if (!rate) throw conflict('RATE_UNAVAILABLE', 'No hay una tasa BCV registrada. La tienda debe registrarla antes de confirmar operaciones.');
  if (rate.stale && settings.rate.blockWhenStale) {
    throw conflict('RATE_STALE', 'La tasa BCV registrada está desactualizada. Intente más tarde o contacte a la tienda.');
  }

  const cart = await prisma.cart.findUnique({ where: { userId: auth.userId }, include: { items: { orderBy: { createdAt: 'asc' } } } });
  if (!cart || cart.items.length === 0) throw badRequest('CART_EMPTY', 'Su carrito está vacío');
  const requests = cart.items.map((i) => ({ productId: i.productId, mode: i.mode, quantity: i.quantity }));
  const current = await computeQuote(requests, { strict: true });

  // Tasa aplicada: la de la cotización si sigue vigente y coincide; si no, se pide reconfirmar.
  let rateId = rate.id;
  let rateValue = rate.rate;
  let quoteId: string | null = null;
  if (input.quoteId) {
    const q = await prisma.quote.findUnique({ where: { id: input.quoteId } });
    if (!q || (q.userId && q.userId !== auth.userId)) throw notFound('Cotización no encontrada');
    const fresh = () => createQuote(requests, auth.userId);
    if (q.validUntil < new Date()) {
      throw conflict('QUOTE_EXPIRED', 'La cotización venció. Revise los nuevos importes y confirme nuevamente.', { quote: await fresh() });
    }
    if (!quoteMatches(q.lines as unknown as StoredQuoteLine[], current.lines) || !q.exchangeRateId || !q.rateValue) {
      throw conflict('QUOTE_CHANGED', 'Los precios o cantidades cambiaron. Revise los nuevos importes y confirme nuevamente.', {
        quote: await fresh(),
      });
    }
    rateId = q.exchangeRateId;
    rateValue = q.rateValue.toFixed(8);
    quoteId = q.id;
  }

  const subtotalCents = current.subtotalCents;
  const totalCents = subtotalCents;
  const requiredCents = input.type === 'PICKUP' ? totalCents : percentOfCents(totalCents, settings.reservation.prepayMinPercent);
  const holdUntil = new Date(Date.now() + settings.reservation.holdHours * 3_600_000);
  const termsSnapshot = {
    type: input.type,
    holdHours: settings.reservation.holdHours,
    prepayMinPercent: input.type === 'PREPAY' ? settings.reservation.prepayMinPercent : 100,
    extendWhilePaymentPending: settings.reservation.extendWhilePaymentPending,
    customerCancelMinHours: settings.cancellation.customerCancelMinHours,
    rescheduleMinHours: settings.cancellation.rescheduleMinHours,
    maxReschedules: settings.cancellation.maxReschedules,
    cancellationPolicyText: settings.cancellation.policyText,
    pickupGraceDays: settings.reservation.pickupGraceDays,
    rate: { id: rateId, value: rateValue, source: rate.source, effectiveDate: rate.effectiveDate },
    timezone: settings.store.timezone,
    acceptedAt: new Date().toISOString(),
  };

  let order: Order;
  try {
    order = await prisma.$transaction(
      async (tx) => {
        const created = await tx.order.create({
          data: {
            code: orderCode(),
            customerId: auth.customerId,
            sellerId: seller.id,
            type: input.type,
            status: 'PENDING_PAYMENT',
            paymentStatus: 'UNPAID',
            preferredMethodId: method.id,
            quoteId,
            exchangeRateId: rateId,
            rateValue,
            subtotalCents,
            totalCents,
            totalVesCents: usdCentsToVesCents(totalCents, rateValue),
            requiredCents,
            paidCents: 0,
            balanceCents: totalCents,
            totalBoxes: current.totalBoxes,
            totalAreaUnits: current.totalAreaUnits,
            pickupDate: toDbDate(input.pickupDate),
            expiresAt: holdUntil,
            contactName: input.fullName,
            contactPhone: input.phone,
            customerNotes: input.customerNotes || null,
            termsSnapshot: termsSnapshot as Prisma.InputJsonValue,
            idempotencyKey,
            items: {
              create: current.lines.map((l) => ({
                productId: l.productId,
                sku: l.sku,
                productName: l.name,
                color: l.color,
                sizeLabel: l.sizeLabel,
                boxAreaUnits: l.boxAreaUnits,
                piecesPerBox: l.piecesPerBox,
                mode: l.mode,
                requestedQuantity: l.requestedQuantity,
                boxes: l.boxes,
                areaUnits: l.areaUnits,
                priceBoxCents: l.priceBoxCents,
                priceM2Cents: l.priceM2Cents,
                lineTotalCents: l.lineTotalCents,
              })),
            },
            reservation: { create: { status: 'HELD', pickupDate: toDbDate(input.pickupDate), heldUntil: holdUntil } },
          },
        });
        for (const line of current.lines) {
          await adjustInventory(tx, {
            productId: line.productId,
            type: 'RESERVE',
            deltaOnHand: 0,
            deltaReserved: line.boxes,
            reason: `Reserva por la operación ${created.code}`,
            orderId: created.id,
            userId: auth.userId,
          });
        }
        await reserveCapacity(tx, input.pickupDate, settings.pickup.capacityPerDay);
        await logEvent(tx, created.id, 'CREATED', `Operación creada (${input.type === 'PICKUP' ? 'compra con retiro' : 'prepago'})`, auth.userId, null, 'PENDING_PAYMENT');
        await tx.customerProfile.update({ where: { id: auth.customerId }, data: { fullName: input.fullName, phone: input.phone } });
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        const sellerUser = seller.userId;
        await notify(
          [sellerUser],
          {
            type: 'ORDER_CREATED',
            title: `Nueva operación ${created.code}`,
            body: `${input.fullName} lo seleccionó como vendedor. Retiro: ${input.pickupDate}.`,
            link: `/vendedor/operaciones/${created.id}`,
          },
          tx,
        );
        return created;
      },
      { timeout: 20_000 },
    );
  } catch (err) {
    // Un reintento concurrente con la misma clave puede fallar por stock o cupo ya
    // consumidos por la petición original: en ese caso se devuelve la original.
    const dup = await prisma.order.findUnique({
      where: { customerId_idempotencyKey: { customerId: auth.customerId, idempotencyKey } },
    });
    if (dup) return { order: dup, replayed: true };
    throw err;
  }
  return { order, replayed: false };
}

export async function getOrderFull(where: Prisma.OrderWhereInput) {
  const o = await prisma.order.findFirst({ where, include: orderInclude });
  if (!o) throw notFound('Operación no encontrada');
  return o;
}

/** Restringe el acceso de personal: administradores ven todo; vendedores solo lo asignado. */
export function staffScope(auth: AuthContext): Prisma.OrderWhereInput {
  if (auth.role === 'ADMIN') return {};
  if (auth.role === 'SELLER' && auth.sellerId) return { sellerId: auth.sellerId };
  throw forbidden();
}

/** Recalcula importes acreditados y confirma la operación cuando se alcanza el mínimo requerido. */
export async function recalcPayments(tx: Tx, orderId: string, actorId: string | null) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  const agg = await tx.payment.aggregate({ where: { orderId, status: 'APPROVED' }, _sum: { creditUsdCents: true } });
  const paid = agg._sum.creditUsdCents ?? 0;
  const balance = Math.max(0, order.totalCents - paid);
  const paymentStatus = paid <= 0 ? 'UNPAID' : balance === 0 ? 'PAID' : 'PARTIAL';
  const data: Prisma.OrderUpdateInput = { paidCents: paid, balanceCents: balance, paymentStatus };
  let confirmed = false;
  if (order.status === 'PENDING_PAYMENT' && paid >= order.requiredCents) {
    Object.assign(data, { status: 'CONFIRMED', confirmedAt: new Date(), expiresAt: null });
    confirmed = true;
  }
  await tx.order.update({ where: { id: orderId }, data });
  if (confirmed) {
    await tx.reservation.update({ where: { orderId }, data: { status: 'CONFIRMED', heldUntil: null } });
    await logEvent(tx, orderId, 'CONFIRMED', 'Pago requerido acreditado: operación confirmada', actorId, 'PENDING_PAYMENT', 'CONFIRMED');
  }
  if (paid > order.totalCents) {
    await logEvent(tx, orderId, 'OVERPAID', `Excedente acreditado de ${(paid - order.totalCents) / 100} USD`, actorId, null, null, {
      overpaidCents: paid - order.totalCents,
    });
  }
  return { paid, balance, paymentStatus, confirmed };
}

async function releaseOrderStock(tx: Tx, order: Order & { items: { productId: string; boxes: number }[] }, reason: string, actorId: string | null) {
  for (const item of order.items) {
    await adjustInventory(tx, {
      productId: item.productId,
      type: 'RELEASE',
      deltaOnHand: 0,
      deltaReserved: -item.boxes,
      reason,
      orderId: order.id,
      userId: actorId,
    });
  }
  await releaseCapacity(tx, order.pickupDate);
  await tx.reservation.update({
    where: { orderId: order.id },
    data: { status: 'RELEASED', releasedAt: new Date(), releaseReason: reason, heldUntil: null },
  });
}

/** Cancela una operación activa liberando inventario y cupo. Operación condicional e idempotente. */
export async function cancelOrder(orderId: string, reason: string, actor: AuthContext | null, kind: 'CANCELLED' | 'EXPIRED' = 'CANCELLED') {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    const allowedFrom: OrderStatus[] = kind === 'EXPIRED' ? ['PENDING_PAYMENT'] : ACTIVE_STATUSES;
    const res = await tx.order.updateMany({
      where: { id: orderId, status: { in: allowedFrom } },
      data: { status: kind, cancelledAt: new Date(), cancelReason: reason, expiresAt: null },
    });
    if (res.count === 0) throw conflict('INVALID_STATE', 'La operación ya no puede cancelarse en su estado actual');
    await releaseOrderStock(tx, order, kind === 'EXPIRED' ? 'Reserva vencida sin pago requerido' : `Cancelación: ${reason}`, actor?.userId ?? null);
    const pending = await tx.payment.updateMany({
      where: { orderId, status: 'PENDING' },
      data: { status: 'REJECTED', reviewNotes: 'Operación cancelada o vencida', reviewedAt: new Date() },
    });
    if (pending.count > 0) {
      await tx.paymentProof.updateMany({ where: { payment: { orderId }, status: 'PENDING' }, data: { status: 'REJECTED' } });
    }
    await logEvent(tx, orderId, kind, kind === 'EXPIRED' ? 'Reserva vencida: inventario liberado' : `Operación cancelada: ${reason}`, actor?.userId ?? null, order.status, kind);
    if (order.paidCents > 0) {
      await logEvent(tx, orderId, 'REFUND_REVIEW', `Hay ${order.paidCents / 100} USD acreditados: requiere gestión de reembolso o abono según la política`, actor?.userId ?? null);
    }
    const customer = await tx.customerProfile.findUniqueOrThrow({ where: { id: order.customerId } });
    const sellerUser = await sellerUserId(order.sellerId, tx);
    await notify(
      [customer.userId, ...(sellerUser ? [sellerUser] : [])],
      {
        type: `ORDER_${kind}`,
        title: `Operación ${order.code} ${kind === 'EXPIRED' ? 'vencida' : 'cancelada'}`,
        body: kind === 'EXPIRED' ? 'La reserva venció por no registrar el pago requerido a tiempo.' : reason,
        link: `/cuenta/operaciones/${order.code}`,
      },
      tx,
    );
    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  });
}

export async function customerCancel(auth: AuthContext & { customerId: string }, code: string, reason: string) {
  const order = await prisma.order.findFirst({ where: { code, customerId: auth.customerId } });
  if (!order) throw notFound('Operación no encontrada');
  if (!ACTIVE_STATUSES.includes(order.status)) throw conflict('INVALID_STATE', 'La operación ya no puede cancelarse');
  if (order.paidCents > 0) {
    throw conflict('HAS_PAYMENTS', 'La operación tiene pagos acreditados. Contacte a su vendedor para gestionar la cancelación.');
  }
  const s = await getSettings();
  const terms = order.termsSnapshot as { customerCancelMinHours?: number };
  const minHours = terms.customerCancelMinHours ?? s.cancellation.customerCancelMinHours;
  const day = s.pickup.weekdays[new Date(order.pickupDate).getUTCDay()];
  const opening = zonedDateTimeToInstant(fromDbDate(order.pickupDate), day?.open ?? '00:00', s.store.timezone);
  if (opening.getTime() - Date.now() < minHours * 3_600_000) {
    throw conflict('TOO_LATE', `Solo puede cancelar con al menos ${minHours} horas de anticipación a la fecha de retiro`);
  }
  return cancelOrder(order.id, reason, auth);
}

export async function rescheduleOrder(auth: AuthContext & { customerId: string }, code: string, newDate: string, reason?: string) {
  const order = await prisma.order.findFirst({ where: { code, customerId: auth.customerId } });
  if (!order) throw notFound('Operación no encontrada');
  if (!ACTIVE_STATUSES.includes(order.status)) throw conflict('INVALID_STATE', 'La operación no admite cambios de fecha');
  const currentDate = fromDbDate(order.pickupDate);
  if (newDate === currentDate) throw badRequest('SAME_DATE', 'Seleccione una fecha distinta a la actual');
  const s = await assertDateAllowed(newDate, order.type);
  const terms = order.termsSnapshot as { maxReschedules?: number; rescheduleMinHours?: number };
  const max = terms.maxReschedules ?? s.cancellation.maxReschedules;
  const minHours = terms.rescheduleMinHours ?? s.cancellation.rescheduleMinHours;
  if (order.rescheduleCount >= max) throw conflict('RESCHEDULE_LIMIT', `Ya alcanzó el máximo de ${max} cambios de fecha`);
  const day = s.pickup.weekdays[new Date(order.pickupDate).getUTCDay()];
  const opening = zonedDateTimeToInstant(currentDate, day?.open ?? '00:00', s.store.timezone);
  if (opening.getTime() - Date.now() < minHours * 3_600_000) {
    throw conflict('TOO_LATE', `Los cambios de fecha requieren al menos ${minHours} horas de anticipación`);
  }
  return prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: order.id, status: { in: ACTIVE_STATUSES }, rescheduleCount: order.rescheduleCount },
      data: { pickupDate: toDbDate(newDate), rescheduleCount: { increment: 1 } },
    });
    if (res.count === 0) throw conflict('CONCURRENT_UPDATE', 'La operación cambió mientras se procesaba. Intente de nuevo.');
    await releaseCapacity(tx, order.pickupDate);
    await reserveCapacity(tx, newDate, s.pickup.capacityPerDay);
    await tx.reservation.update({ where: { orderId: order.id }, data: { pickupDate: toDbDate(newDate) } });
    await logEvent(tx, order.id, 'RESCHEDULED', `Fecha de retiro cambiada de ${currentDate} a ${newDate}${reason ? ` (${reason})` : ''}`, auth.userId);
    const sellerUser = await sellerUserId(order.sellerId, tx);
    if (sellerUser) {
      await notify(
        [sellerUser],
        { type: 'ORDER_RESCHEDULED', title: `Cambio de fecha ${order.code}`, body: `Nueva fecha de retiro: ${newDate}`, link: `/vendedor/operaciones/${order.id}` },
        tx,
      );
    }
    return tx.order.findUniqueOrThrow({ where: { id: order.id } });
  });
}

/** Transiciones operativas del personal. */
export async function staffAction(auth: AuthContext, orderId: string, action: 'MARK_READY' | 'MARK_DELIVERED' | 'CANCEL', note?: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, ...staffScope(auth) }, include: { items: true, customer: true } });
  if (!order) throw notFound('Operación no encontrada');
  if (action === 'CANCEL') {
    if (!auth.permissions.includes('orders:cancel')) throw forbidden('Solo un administrador puede cancelar operaciones');
    if (!note || note.trim().length < 3) throw badRequest('REASON_REQUIRED', 'Indique el motivo de la cancelación');
    return cancelOrder(orderId, note, auth);
  }
  return prisma.$transaction(async (tx) => {
    if (action === 'MARK_READY') {
      const res = await tx.order.updateMany({ where: { id: orderId, status: 'CONFIRMED' }, data: { status: 'READY_FOR_PICKUP', readyAt: new Date() } });
      if (res.count === 0) throw conflict('INVALID_STATE', 'Solo una operación confirmada puede marcarse como lista para retiro');
      await logEvent(tx, orderId, 'READY', note ? `Lista para retiro: ${note}` : 'Mercancía lista para retiro', auth.userId, 'CONFIRMED', 'READY_FOR_PICKUP');
      await notify(
        [order.customer.userId],
        { type: 'ORDER_READY', title: `Su pedido ${order.code} está listo`, body: `Puede retirarlo el ${fromDbDate(order.pickupDate)}.`, link: `/cuenta/operaciones/${order.code}` },
        tx,
      );
    } else {
      if (order.balanceCents > 0) {
        throw conflict('BALANCE_PENDING', 'No se puede entregar: la operación tiene saldo pendiente por acreditar');
      }
      const res = await tx.order.updateMany({
        where: { id: orderId, status: { in: ['CONFIRMED', 'READY_FOR_PICKUP'] }, balanceCents: 0 },
        data: { status: 'DELIVERED', deliveredAt: new Date() },
      });
      if (res.count === 0) throw conflict('INVALID_STATE', 'La operación no puede marcarse como entregada en su estado actual');
      for (const item of order.items) {
        await adjustInventory(tx, {
          productId: item.productId,
          type: 'DELIVERY',
          deltaOnHand: -item.boxes,
          deltaReserved: -item.boxes,
          reason: `Entrega de la operación ${order.code}`,
          orderId,
          userId: auth.userId,
        });
      }
      await tx.reservation.update({ where: { orderId }, data: { status: 'FULFILLED' } });
      await logEvent(tx, orderId, 'DELIVERED', note ? `Entregada: ${note}` : 'Mercancía entregada al cliente', auth.userId, order.status, 'DELIVERED');
      await notify(
        [order.customer.userId],
        { type: 'ORDER_DELIVERED', title: `Operación ${order.code} entregada`, body: 'Gracias por su compra.', link: `/cuenta/operaciones/${order.code}` },
        tx,
      );
    }
    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  });
}

export async function addOrderNote(auth: AuthContext, orderId: string, kind: 'NOTE' | 'INCIDENT', body: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, ...staffScope(auth) } });
  if (!order) throw notFound('Operación no encontrada');
  return prisma.$transaction(async (tx) => {
    const note = await tx.orderNote.create({ data: { orderId, kind, body, authorId: auth.userId } });
    if (kind === 'INCIDENT') {
      await logEvent(tx, orderId, 'INCIDENT', 'Incidencia registrada por el personal', auth.userId);
      await notify(await adminUserIds(tx), { type: 'ORDER_INCIDENT', title: `Incidencia en ${order.code}`, body: body.slice(0, 200), link: `/admin/operaciones/${orderId}` }, tx);
    }
    return note;
  });
}

/** Vence reservas sin el pago requerido y libera su inventario. */
export async function expireReservations(now = new Date()) {
  const s = await getSettings();
  const candidates = await prisma.order.findMany({
    where: { status: 'PENDING_PAYMENT', expiresAt: { lt: now } },
    select: { id: true, payments: { where: { status: 'PENDING' }, select: { id: true } } },
    take: 200,
  });
  let expired = 0;
  for (const c of candidates) {
    if (s.reservation.extendWhilePaymentPending && c.payments.length > 0) continue;
    try {
      await cancelOrder(c.id, 'Reserva vencida sin el pago requerido', null, 'EXPIRED');
      expired++;
    } catch (err) {
      if (!(err instanceof AppError && err.code === 'INVALID_STATE')) throw err;
    }
  }
  return { expired };
}

/** Avisa (una vez) de retiros vencidos y, si está configurado, cancela por no retiro. */
export async function processOverduePickups(now = new Date()) {
  const s = await getSettings();
  const cutoff = addDays(localDateString(now, s.store.timezone), -s.reservation.pickupGraceDays);
  const overdue = await prisma.order.findMany({
    where: { status: { in: ['CONFIRMED', 'READY_FOR_PICKUP'] }, pickupDate: { lt: toDbDate(cutoff) }, events: { none: { type: 'OVERDUE' } } },
    take: 200,
  });
  for (const o of overdue) {
    await prisma.$transaction(async (tx) => {
      await logEvent(tx, o.id, 'OVERDUE', 'La fecha de retiro y su tolerancia vencieron sin entrega', null);
      const sellerUser = await sellerUserId(o.sellerId, tx);
      await notify(
        [...(await adminUserIds(tx)), ...(sellerUser ? [sellerUser] : [])],
        { type: 'ORDER_OVERDUE', title: `Retiro vencido ${o.code}`, body: 'La operación no fue retirada en el plazo establecido.', link: `/vendedor/operaciones/${o.id}` },
        tx,
      );
    });
    if (s.reservation.autoCancelNoShow) {
      await cancelOrder(o.id, 'No retirada dentro del plazo de tolerancia', null).catch(() => undefined);
    }
  }
  return { overdue: overdue.length };
}
