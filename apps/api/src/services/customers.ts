import type { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { customerProfileSchema, maskDocumentId, normalizeDocumentId, normalizePhone } from '@porcelanas/shared';
import { prisma } from '../db';
import { audit } from '../lib/audit';
import { createSession } from '../lib/auth';
import { conflict, forbidden, parse } from '../lib/errors';
import { mergeGuestCart } from './cart';

export const DOCUMENT_TAKEN_MESSAGE =
  'Ya existe un cliente registrado con esta cédula. Por seguridad no podemos abrir ese perfil desde aquí: inicia sesión con tu cuenta o pide a tu vendedor un enlace de acceso.';

export function isProfileComplete(p: { fullName: string; phone: string; city: string; addressRef: string; documentId: string | null } | null) {
  return !!p && !!p.fullName && !!p.phone && !!p.city && !!p.addressRef && !!p.documentId;
}

/** Vista del perfil para su propio dueño (la cédula se muestra enmascarada y aparte completa para editar). */
export function ownProfile(p: { fullName: string; phone: string; city: string; addressRef: string; documentId: string | null }, hasCredentials: boolean) {
  return {
    fullName: p.fullName,
    phone: p.phone,
    city: p.city,
    addressRef: p.addressRef,
    documentId: p.documentId ?? '',
    documentMasked: maskDocumentId(p.documentId),
    complete: isProfileComplete(p),
    hasCredentials,
  };
}

/**
 * Crea o actualiza el perfil con los cuatro datos obligatorios.
 * - Sin sesión: crea un cliente sin contraseña y abre una sesión segura en este dispositivo.
 * - Con sesión de cliente: actualiza su propio perfil.
 * La cédula es única: nunca se vincula ni se revela un perfil ajeno a partir de ella.
 */
export async function upsertCustomerProfile(request: FastifyRequest, reply: FastifyReply, body: unknown) {
  const input = parse(customerProfileSchema, body);
  const data = {
    fullName: input.fullName.replace(/\s+/g, ' '),
    city: input.city,
    addressRef: input.addressRef,
    phone: normalizePhone(input.phone)!,
    documentId: normalizeDocumentId(input.documentId)!,
  };
  const auth = request.auth;
  if (auth && !auth.customerId) throw forbidden('Las cuentas de personal no tienen perfil de cliente');
  const owner = await prisma.customerProfile.findUnique({ where: { documentId: data.documentId } });
  if (owner && owner.id !== auth?.customerId) throw conflict('DOCUMENT_REGISTERED', DOCUMENT_TAKEN_MESSAGE);
  try {
    if (auth?.customerId) {
      const p = await prisma.customerProfile.update({ where: { id: auth.customerId }, data, include: { user: true } });
      await audit(request, 'customer.profile_update', 'CustomerProfile', p.id);
      return { created: false, profile: ownProfile(p, p.user.passwordHash !== '') };
    }
    const user = await prisma.user.create({
      data: { email: null, passwordHash: '', role: 'CUSTOMER', customer: { create: data } },
      include: { customer: true },
    });
    await createSession(reply, request, user.id, { passwordless: true });
    await mergeGuestCart(request, reply, user.id);
    await audit(request, 'customer.quick_register', 'CustomerProfile', user.customer!.id);
    return { created: true, profile: ownProfile(user.customer!, false) };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict('DOCUMENT_REGISTERED', DOCUMENT_TAKEN_MESSAGE);
    }
    throw err;
  }
}

export async function getOwnProfile(customerId: string) {
  const p = await prisma.customerProfile.findUniqueOrThrow({ where: { id: customerId }, include: { user: true } });
  return ownProfile(p, p.user.passwordHash !== '');
}
