import type { FastifyInstance } from 'fastify';
import { cartItemInputSchema, cartItemUpdateSchema } from '@porcelanas/shared';
import { parse } from '../lib/errors';
import { addCartItem, clearCart, getCartView, removeCartItem, updateCartItem } from '../services/cart';

export async function cartRoutes(app: FastifyInstance) {
  app.get('/api/cart', async (req) => getCartView(req));
  app.post('/api/cart/items', async (req, reply) => addCartItem(req, reply, parse(cartItemInputSchema, req.body)));
  app.patch<{ Params: { id: string } }>('/api/cart/items/:id', async (req) =>
    updateCartItem(req, req.params.id, parse(cartItemUpdateSchema, req.body)),
  );
  app.delete<{ Params: { id: string } }>('/api/cart/items/:id', async (req) => removeCartItem(req, req.params.id));
  app.delete('/api/cart', async (req) => clearCart(req));
}
