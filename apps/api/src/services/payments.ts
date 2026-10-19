import { Prisma } from '@prisma/client';
import { parseMoneyToCents, vesCentsToUsdCents, type PaymentSubmitInput } from '@porcelanas/shared';
import { prisma } from '../db';
import type { AuthContext } from '../lib/auth';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { storage, type ValidatedImage } from '../lib/storage';
import { adminUserIds, notify, sellerUserId } from './notifications';
import { ACTIVE_STATUSES, recalcPayments, staffScope } from './orders';
import { toDbDate } from './pickup';
import { isMethodConfigured } from './paymentMethods';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';

export const normalizeReference = (ref: string) => ref.toUpperCase().replace(/[\s.\-_/]+/g, '');

async function reviewerUserIds(sellerId: string) {
  const ids = await adminUserIds();
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
  if (seller?.active && seller.canReviewPayments) ids.push(seller.userId);
  return ids;
}

async function removePrivate(key: string) {
  await fs.rm(path.join(config.storage.privateDir, key), { force: true }).catch(() => undefined);
}

interface SubmitOptions {
  /** Registro presencial por personal autorizado (se aprueba de inmediato). */
  staffApproved?: boolean;
}

export async function submitPayment(
  auth: AuthContext,
  orderWhere: Prisma.OrderWhereInput,
  input: PaymentSubmitInput,
  file: ValidatedImage | null,
  idempotencyKey: string,
  opts: SubmitOptions = {},
) {
  if (!/^[\w-]{16,100}$/.test(idempotencyKey)) throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'Falta la cabecera Idempotency-Key válida');
  const order = await prisma.order.findFirst({ where: orderWhere });
  if (!order) throw notFound('Operación no encontrada');

  const replay = await prisma.payment.findUnique({ where: { orderId_idempotencyKey: { orderId: order.id, idempotencyKey } } });
  if (replay) return { payment: replay, replayed: true };

  if (!ACTIVE_STATUSES.includes(order.status)) throw conflict('INVALID_STATE', 'La operación no admite pagos en su estado actual');
  if (order.balanceCents <= 0) throw conflict('NO_BALANCE', 'La operación no tiene saldo pendiente');
  const method = await prisma.paymentMethod.findUnique({ where: { id: input.paymentMethodId } });
  if (!method || !method.active) throw new AppError(422, 'PAYMENT_METHOD_INVALID', 'Método de pago no disponible');
  if (method.currency !== input.currency) {
    throw badRequest('CURRENCY_MISMATCH', `El método ${method.name} se registra en ${method.currency}`);
  }
  if (!opts.staffApproved && !isMethodConfigured(method)) {
    throw new AppError(422, 'PAYMENT_METHOD_NOT_CONFIGURED', `El método ${method.name} aún no tiene sus datos de pago configurados`);
  }
  // Los importes de la operación están en la lista de precios elegida: USD (divisas) o Bs (precio BCV).
  const expectedCurrency = order.priceList === 'BCV' ? 'VES' : 'USD';
  if (method.currency !== expectedCurrency) {
    throw badRequest(
      'PRICE_LIST_MISMATCH',
      order.priceList === 'BCV'
        ? 'Esta operación se cotizó con el precio BCV: registre el pago con un método en bolívares.'
        : 'Esta operación se cotizó con el precio en divisas: registre el pago con un método en dólares.',
    );
  }
  if (method.requiresProof && !file && !opts.staffApproved) {
    throw badRequest('PROOF_REQUIRED', 'Debe adjuntar el comprobante de pago');
  }
  const amountCents = parseMoneyToCents(input.amount);
  if (amountCents <= 0) throw badRequest('INVALID_AMOUNT', 'El importe debe ser mayor que cero');
  const rate = order.rateValue.toFixed(8);
  const creditUsdCents = input.currency === 'USD' ? amountCents : vesCentsToUsdCents(amountCents, rate);
  const referenceKey = normalizeReference(input.reference);

  const replayOf = (p: { orderId: string; idempotencyKey: string } | null) => p && p.orderId === order.id && p.idempotencyKey === idempotencyKey;
  const dupApproved = await prisma.payment.findFirst({ where: { methodId: method.id, referenceKey, status: 'APPROVED' } });
  if (dupApproved && replayOf(dupApproved)) return { payment: dupApproved, replayed: true };
  if (dupApproved) throw conflict('DUPLICATE_REFERENCE', 'Esa referencia de pago ya fue registrada y aprobada anteriormente');
  const dupPending = await prisma.payment.findFirst({ where: { orderId: order.id, methodId: method.id, referenceKey, status: 'PENDING' } });
  if (dupPending && replayOf(dupPending)) return { payment: dupPending, replayed: true };
  if (dupPending) throw conflict('DUPLICATE_REFERENCE', 'Ya registró un pago con esa referencia y está pendiente de verificación');

  const storageKey = file ? await storage.savePrivate('proofs', file) : null;
  try {
    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          orderId: order.id,
          methodId: method.id,
          currency: input.currency,
          amountCents,
          creditUsdCents,
          rateValue: rate,
          reference: input.reference,
          referenceKey,
          paidAt: toDbDate(input.paidAt),
          payerName: input.payerName || null,
          notes: input.notes || null,
          status: opts.staffApproved ? 'APPROVED' : 'PENDING',
          submittedById: auth.userId,
          reviewedById: opts.staffApproved ? auth.userId : null,
          reviewedAt: opts.staffApproved ? new Date() : null,
          reviewNotes: opts.staffApproved ? 'Pago registrado presencialmente por el personal' : null,
          idempotencyKey,
          proofs:
            file && storageKey
              ? {
                  create: {
                    storageKey,
                    originalName: file.originalName,
                    mimeType: file.mimeType,
                    sizeBytes: file.buffer.length,
                    sha256: file.sha256,
                    status: opts.staffApproved ? 'APPROVED' : 'PENDING',
                    uploadedById: auth.userId,
                  },
                }
              : undefined,
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: opts.staffApproved ? 'PAYMENT_RECORDED' : 'PAYMENT_SUBMITTED',
          message: opts.staffApproved
            ? `Pago presencial registrado (${method.name}, ref. ${input.reference})`
            : `Pago reportado por ${method.name} (ref. ${input.reference}); pendiente de verificación`,
          actorId: auth.userId,
        },
      });
      if (opts.staffApproved) await recalcPayments(tx, order.id, auth.userId);
      return p;
    });
    if (!opts.staffApproved) {
      await notify(await reviewerUserIds(order.sellerId), {
        type: 'PAYMENT_SUBMITTED',
        title: `Pago por verificar en ${order.code}`,
        body: `${method.name} · ref. ${input.reference}`,
        link: `/vendedor/pagos`,
      });
    }
    return { payment, replayed: false };
  } catch (err) {
    if (storageKey) await removePrivate(storageKey);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = String(err.meta?.target ?? '');
      if (target.includes('idempotencyKey')) {
        const p = await prisma.payment.findUnique({ where: { orderId_idempotencyKey: { orderId: order.id, idempotencyKey } } });
        if (p) return { payment: p, replayed: true };
      }
      throw conflict('DUPLICATE_REFERENCE', 'Esa referencia de pago ya fue registrada y aprobada anteriormente');
    }
    throw err;
  }
}

/** Reemplaza el comprobante de un pago rechazado; el pago vuelve a revisión. */
export async function replaceProof(auth: AuthContext & { customerId: string }, paymentId: string, file: ValidatedImage) {
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, order: { customerId: auth.customerId } }, include: { order: true } });
  if (!payment) throw notFound('Pago no encontrado');
  if (payment.status !== 'REJECTED') throw conflict('INVALID_STATE', 'Solo se pueden reemplazar comprobantes de pagos rechazados');
  if (!ACTIVE_STATUSES.includes(payment.order.status)) throw conflict('INVALID_STATE', 'La operación ya no admite pagos');
  const storageKey = await storage.savePrivate('proofs', file);
  try {
    await prisma.$transaction(async (tx) => {
      const res = await tx.payment.updateMany({
        where: { id: paymentId, status: 'REJECTED' },
        data: { status: 'PENDING', reviewedAt: null, reviewedById: null },
      });
      if (res.count === 0) throw conflict('INVALID_STATE', 'El pago cambió de estado');
      await tx.paymentProof.updateMany({ where: { paymentId, status: { in: ['REJECTED', 'PENDING'] } }, data: { status: 'REPLACED' } });
      await tx.paymentProof.create({
        data: {
          paymentId,
          storageKey,
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.buffer.length,
          sha256: file.sha256,
          uploadedById: auth.userId,
        },
      });
      await tx.orderEvent.create({
        data: { orderId: payment.orderId, type: 'PROOF_REPLACED', message: `Comprobante reemplazado (ref. ${payment.reference}); pendiente de verificación`, actorId: auth.userId },
      });
    });
  } catch (err) {
    await removePrivate(storageKey);
    throw err;
  }
  await notify(await reviewerUserIds(payment.order.sellerId), {
    type: 'PAYMENT_SUBMITTED',
    title: `Comprobante reemplazado en ${payment.order.code}`,
    body: `Ref. ${payment.reference}`,
    link: `/vendedor/pagos`,
  });
  return prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { proofs: true } });
}

function canReviewOrder(auth: AuthContext, sellerId: string) {
  if (!auth.permissions.includes('payments:review')) return false;
  return auth.role === 'ADMIN' || (auth.role === 'SELLER' && auth.sellerId === sellerId);
}

/** Revisión manual. La actualización condicional impide revisar dos veces el mismo pago. */
export async function reviewPayment(auth: AuthContext, paymentId: string, decision: 'APPROVE' | 'REJECT', notes?: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { order: { include: { customer: true } }, method: true } });
  if (!payment) throw notFound('Pago no encontrado');
  if (!canReviewOrder(auth, payment.order.sellerId)) throw forbidden('No está autorizado para revisar este pago');
  if (decision === 'APPROVE' && !ACTIVE_STATUSES.includes(payment.order.status)) {
    throw conflict('INVALID_STATE', 'La operación no está activa; no se puede aprobar el pago');
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const res = await tx.payment.updateMany({
        where: { id: paymentId, status: 'PENDING' },
        data: {
          status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          reviewedById: auth.userId,
          reviewedAt: new Date(),
          reviewNotes: notes || null,
        },
      });
      if (res.count === 0) throw conflict('ALREADY_REVIEWED', 'Este pago ya fue revisado');
      await tx.paymentProof.updateMany({
        where: { paymentId, status: 'PENDING' },
        data: { status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED' },
      });
      await tx.orderEvent.create({
        data: {
          orderId: payment.orderId,
          type: decision === 'APPROVE' ? 'PAYMENT_APPROVED' : 'PAYMENT_REJECTED',
          message:
            decision === 'APPROVE'
              ? `Pago aprobado (${payment.method.name}, ref. ${payment.reference})`
              : `Pago rechazado (ref. ${payment.reference}): ${notes}`,
          actorId: auth.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: auth.userId,
          action: decision === 'APPROVE' ? 'payment.approve' : 'payment.reject',
          entityType: 'Payment',
          entityId: paymentId,
          data: { orderId: payment.orderId, amountCents: payment.amountCents, currency: payment.currency, notes: notes ?? null },
        },
      });
      return decision === 'APPROVE' ? recalcPayments(tx, payment.orderId, auth.userId) : null;
    });
    await notify([payment.order.customer.userId], {
      type: decision === 'APPROVE' ? 'PAYMENT_APPROVED' : 'PAYMENT_REJECTED',
      title: decision === 'APPROVE' ? `Pago aprobado en ${payment.order.code}` : `Pago rechazado en ${payment.order.code}`,
      body:
        decision === 'APPROVE'
          ? result?.confirmed
            ? 'Su operación quedó confirmada.'
            : 'El pago fue acreditado.'
          : `Motivo: ${notes}. Puede adjuntar un nuevo comprobante.`,
      link: `/cuenta/operaciones/${payment.order.code}`,
    });
    return prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict('DUPLICATE_REFERENCE', 'Ya existe un pago aprobado con la misma referencia y método. Rechace este pago.');
    }
    throw err;
  }
}

export async function listPaymentsForReview(auth: AuthContext, status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING') {
  if (!auth.permissions.includes('payments:review')) throw forbidden();
  const rows = await prisma.payment.findMany({
    where: { status, order: staffScope(auth) },
    orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
    take: 100,
    include: {
      method: { select: { name: true, kind: true, currency: true } },
      proofs: { orderBy: { createdAt: 'desc' }, select: { id: true, status: true, mimeType: true, createdAt: true } },
      order: {
        select: {
          id: true,
          code: true,
          totalCents: true,
          paidCents: true,
          balanceCents: true,
          requiredCents: true,
          status: true,
          rateValue: true,
          customer: { select: { fullName: true, phone: true } },
          seller: { select: { displayName: true } },
        },
      },
      reviewedBy: { select: { email: true } },
    },
  });
  return rows.map((p) => ({ ...p, rateValue: p.rateValue.toFixed(8), order: { ...p.order, rateValue: p.order.rateValue.toFixed(8) } }));
}

/** Verifica el acceso a un comprobante privado. */
export async function authorizeProof(auth: AuthContext, proofId: string) {
  const proof = await prisma.paymentProof.findUnique({ where: { id: proofId }, include: { payment: { include: { order: true } } } });
  if (!proof) throw notFound('Comprobante no encontrado');
  const order = proof.payment.order;
  const isOwner = auth.customerId && order.customerId === auth.customerId;
  const isAdmin = auth.role === 'ADMIN';
  const isSeller = auth.role === 'SELLER' && auth.sellerId === order.sellerId && auth.permissions.includes('proofs:view');
  if (!isOwner && !isAdmin && !isSeller) throw notFound('Comprobante no encontrado');
  return proof;
}
