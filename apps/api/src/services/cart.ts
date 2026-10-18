import type { FastifyReply, FastifyRequest } from 'fastify';
import type { QuantityMode } from '@prisma/client';
import { prisma } from '../db';
import { config } from '../config';
import { randomToken, sha256 } from '../lib/crypto';
import { badRequest, notFound } from '../lib/errors';
import { computeQuote, normalizeQuantity } from './quotes';

export const CART_COOKIE = 'cart_token';
const MAX_ITEMS = 50;

async function findCart(request: FastifyRequest) {
  if (request.auth) return prisma.cart.findUnique({ where: { userId: request.auth.userId } });
  const token = request.cookies[CART_COOKIE];
  if (!token) return null;
  return prisma.cart.findUnique({ where: { guestToken: sha256(token) } });
}

async function findOrCreateCart(request: FastifyRequest, reply: FastifyReply) {
  const existing = await findCart(request);
  if (existing) return existing;
  if (request.auth) {
    return prisma.cart.upsert({ where: { userId: request.auth.userId }, create: { userId: request.auth.userId }, update: {} });
  }
  const token = randomToken();
  reply.setCookie(CART_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return prisma.cart.create({ data: { guestToken: sha256(token) } });
}

export async function getCartView(request: FastifyRequest, known?: { id: string } | null) {
  const cart = known ?? (await findCart(request));
  if (!cart) return { id: null, items: [], quote: null };
  const items = await prisma.cartItem.findMany({ where: { cartId: cart.id }, orderBy: { createdAt: 'asc' } });
  if (items.length === 0) return { id: cart.id, items: [], quote: null };
  const quote = await computeQuote(
    items.map((i) => ({ productId: i.productId, mode: i.mode, quantity: i.quantity })),
    { strict: false },
  );
  return {
    id: cart.id,
    items: items.map((i, idx) => ({ id: i.id, productId: i.productId, mode: i.mode, quantity: i.quantity, line: quote.lines[idx] })),
    quote,
  };
}

export async function addCartItem(
  request: FastifyRequest,
  reply: FastifyReply,
  input: { productId: string; mode: QuantityMode; quantity: string | number },
) {
  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product || product.status !== 'ACTIVE') throw notFound('Producto no disponible');
  const quantity = normalizeQuantity(input.mode, input.quantity);
  const cart = await findOrCreateCart(request, reply);
  const count = await prisma.cartItem.count({ where: { cartId: cart.id } });
  const existing = await prisma.cartItem.findUnique({ where: { cartId_productId: { cartId: cart.id, productId: input.productId } } });
  if (!existing && count >= MAX_ITEMS) throw badRequest('CART_FULL', `El carrito admite como máximo ${MAX_ITEMS} productos`);
  await prisma.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId: input.productId } },
    create: { cartId: cart.id, productId: input.productId, mode: input.mode, quantity },
    update: { mode: input.mode, quantity },
  });
  return getCartView(request, cart);
}

export async function updateCartItem(request: FastifyRequest, itemId: string, input: { mode: QuantityMode; quantity: string | number }) {
  const cart = await findCart(request);
  if (!cart) throw notFound('Carrito vacío');
  const quantity = normalizeQuantity(input.mode, input.quantity);
  const res = await prisma.cartItem.updateMany({ where: { id: itemId, cartId: cart.id }, data: { mode: input.mode, quantity } });
  if (res.count === 0) throw notFound('Artículo no encontrado en su carrito');
  return getCartView(request);
}

export async function removeCartItem(request: FastifyRequest, itemId: string) {
  const cart = await findCart(request);
  if (!cart) throw notFound('Carrito vacío');
  const res = await prisma.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
  if (res.count === 0) throw notFound('Artículo no encontrado en su carrito');
  return getCartView(request);
}

export async function clearCart(request: FastifyRequest) {
  const cart = await findCart(request);
  if (cart) await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  return getCartView(request);
}

/** Al iniciar sesión, fusiona el carrito de visitante con el del usuario (prevalece lo último agregado). */
export async function mergeGuestCart(request: FastifyRequest, reply: FastifyReply, userId: string) {
  const token = request.cookies[CART_COOKIE];
  if (!token) return;
  const guest = await prisma.cart.findUnique({ where: { guestToken: sha256(token) }, include: { items: true } });
  reply.clearCookie(CART_COOKIE, { path: '/' });
  if (!guest) return;
  await prisma.$transaction(async (tx) => {
    const userCart = await tx.cart.upsert({ where: { userId }, create: { userId }, update: {} });
    for (const item of guest.items) {
      await tx.cartItem.upsert({
        where: { cartId_productId: { cartId: userCart.id, productId: item.productId } },
        create: { cartId: userCart.id, productId: item.productId, mode: item.mode, quantity: item.quantity },
        update: { mode: item.mode, quantity: item.quantity },
      });
    }
    await tx.cart.delete({ where: { id: guest.id } });
  });
}
