import type { FastifyReply, FastifyRequest } from 'fastify';
import { normalizePhone, whatsappLink } from '@porcelanas/shared';
import { prisma } from '../db';
import { audit } from '../lib/audit';
import type { AuthContext } from '../lib/auth';
import { randomToken, sha256 } from '../lib/crypto';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { upsertCustomerProfile } from './customers';
import { getSettings } from './settings';

/**
 * Portal de compra privado: cada cliente entra con un enlace personal de un solo uso que le envía
 * su vendedor. Al abrirlo registra sus cuatro datos una sola vez y queda con sesión en su dispositivo.
 * Para otro dispositivo se usa el enlace de acceso existente (`/acceso`).
 */

const INVALID = 'El enlace de invitación no es válido, ya se usó o venció. Pide uno nuevo a tu vendedor.';

export type InviteStatus = 'PENDING' | 'USED' | 'EXPIRED' | 'REVOKED';

function statusOf(i: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date }): InviteStatus {
  if (i.usedAt) return 'USED';
  if (i.revokedAt) return 'REVOKED';
  return i.expiresAt < new Date() ? 'EXPIRED' : 'PENDING';
}

async function sellerFor(auth: AuthContext, sellerId?: string) {
  if (auth.role === 'SELLER') {
    const own = await prisma.seller.findUnique({ where: { userId: auth.userId } });
    if (!own?.active) throw forbidden('Su cuenta de vendedor está desactivada');
    return own;
  }
  // Administración: elige el vendedor que atenderá al invitado (o el único activo).
  const seller = sellerId
    ? await prisma.seller.findFirst({ where: { id: sellerId, active: true } })
    : ((await prisma.seller.findMany({ where: { active: true }, take: 2 })).length === 1 ? await prisma.seller.findFirst({ where: { active: true } }) : null);
  if (!seller) throw badRequest('SELLER_REQUIRED', 'Seleccione el vendedor que atenderá al cliente');
  return seller;
}

export function inviteMessage(sellerName: string, guestName: string, url: string, expiresAt: Date, timezone: string) {
  const until = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'long', timeZone: timezone }).format(expiresAt);
  const hello = guestName ? `Hola, ${guestName.split(' ')[0]}.` : 'Hola.';
  return `${hello} Soy ${sellerName}. Te comparto tu enlace personal al portal de compra de porcelanatos: ${url} . Al abrirlo registras tus datos una sola vez y quedas dentro de tu portal. Es de un solo uso y vence el ${until}.`;
}

export async function createInvite(
  request: FastifyRequest,
  auth: AuthContext,
  input: { name?: string; phone?: string; sellerId?: string },
  origin: string,
) {
  const [seller, settings] = await Promise.all([sellerFor(auth, input.sellerId), getSettings()]);
  const phone = input.phone ? normalizePhone(input.phone) : null;
  if (input.phone && !phone) throw badRequest('VALIDATION_ERROR', 'Teléfono inválido', { fields: { phone: 'Teléfono inválido' } });
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + settings.portal.inviteValidDays * 86_400_000);
  const invite = await prisma.portalInvite.create({
    data: { tokenHash: sha256(token), sellerId: seller.id, name: input.name?.trim() ?? '', phone: phone ?? '', expiresAt, createdById: auth.userId },
  });
  await audit(request, 'portal.invite_create', 'PortalInvite', invite.id);
  const path = `/portal?invitacion=${token}`;
  const url = `${origin.replace(/\/$/, '')}${path}`;
  const message = inviteMessage(seller.displayName, invite.name, url, expiresAt, settings.store.timezone);
  return {
    id: invite.id,
    path,
    url,
    expiresAt,
    message,
    // Con teléfono, el vendedor lo envía directo al chat del cliente; sin él, WhatsApp pide el contacto.
    whatsappUrl: phone ? whatsappLink(phone.replace(/\D/g, ''), message) : `https://wa.me/?text=${encodeURIComponent(message)}`,
  };
}

export async function listInvites(auth: AuthContext) {
  const where = auth.role === 'SELLER' ? { seller: { userId: auth.userId } } : {};
  const rows = await prisma.portalInvite.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { seller: { select: { displayName: true } }, customer: { select: { fullName: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    seller: r.seller.displayName,
    status: statusOf(r),
    expiresAt: r.expiresAt,
    usedAt: r.usedAt,
    customerName: r.customer?.fullName ?? null,
    createdAt: r.createdAt,
  }));
}

export async function revokeInvite(request: FastifyRequest, auth: AuthContext, id: string) {
  const where = auth.role === 'SELLER' ? { id, seller: { userId: auth.userId } } : { id };
  const r = await prisma.portalInvite.updateMany({ where: { ...where, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  if (r.count === 0) throw notFound('Invitación no encontrada o ya utilizada');
  await audit(request, 'portal.invite_revoke', 'PortalInvite', id);
  return { ok: true };
}

async function findPending(token: string) {
  const invite = await prisma.portalInvite.findUnique({ where: { tokenHash: sha256(token) }, include: { seller: true } });
  if (!invite || statusOf(invite) !== 'PENDING' || !invite.seller.active) throw new AppError(400, 'INVALID_INVITE', INVALID);
  return invite;
}

/** Datos mínimos para la pantalla de bienvenida (sin datos del invitado más allá de su nombre de pila). */
export async function checkInvite(token: string) {
  const invite = await findPending(token);
  return {
    guestName: invite.name.split(' ')[0] ?? '',
    seller: { name: invite.seller.displayName, branch: invite.seller.branch, city: invite.seller.city },
    expiresAt: invite.expiresAt,
  };
}

/**
 * Consume la invitación y crea el perfil con sesión. El enlace se marca usado antes de crear el
 * perfil (operación condicional) y se libera si el registro falla, para que dos aperturas
 * simultáneas no creen dos cuentas con el mismo enlace.
 */
export async function acceptInvite(request: FastifyRequest, reply: FastifyReply, token: string, body: unknown) {
  if (request.auth?.customerId) return { created: false, alreadySignedIn: true };
  if (request.auth) throw forbidden('Las cuentas de personal no pueden aceptar invitaciones de cliente');
  const invite = await findPending(token);
  const claimed = await prisma.portalInvite.updateMany({ where: { id: invite.id, usedAt: null, revokedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count === 0) throw new AppError(400, 'INVALID_INVITE', INVALID);
  try {
    const r = await upsertCustomerProfile(request, reply, body, { viaInvite: true });
    const customer = await prisma.customerProfile.findUniqueOrThrow({ where: { documentId: r.profile.documentId } });
    await prisma.portalInvite.update({ where: { id: invite.id }, data: { customerId: customer.id } });
    await audit(request, 'portal.invite_accept', 'PortalInvite', invite.id);
    return { ...r, alreadySignedIn: false };
  } catch (err) {
    await prisma.portalInvite.update({ where: { id: invite.id }, data: { usedAt: null } });
    throw err;
  }
}

/** Vendedor que invitó al cliente (para mostrarlo en su portal antes de su primera compra). */
export async function invitingSeller(customerId: string) {
  const invite = await prisma.portalInvite.findFirst({
    where: { customerId },
    orderBy: { usedAt: 'desc' },
    select: { seller: { select: { id: true, displayName: true, bio: true, city: true, branch: true, publicPhone: true, whatsapp: true, publicEmail: true, active: true } } },
  });
  return invite?.seller.active ? invite.seller : null;
}
