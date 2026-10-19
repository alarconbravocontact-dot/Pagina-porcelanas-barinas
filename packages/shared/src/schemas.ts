import { z } from 'zod';
import {
  ANTISLIP,
  CONVERSATION_STATUS,
  CURRENCIES,
  FINISHES,
  MANUAL_MOVEMENT_TYPES,
  ORDER_NOTE_KINDS,
  ORDER_TYPES,
  PAYMENT_METHOD_KINDS,
  PRICING_BASIS,
  PRODUCT_STATUS,
  QUANTITY_MODES,
  ROLES,
  SLIP_RATINGS,
  USAGE_LEVELS,
} from './enums';
import { isValidDateString } from './dates';

const trimmed = (max: number) => z.string().trim().max(max);
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s()-]{7,20}$/, 'Teléfono inválido');
export const dateSchema = z.string().refine(isValidDateString, 'Fecha inválida (AAAA-MM-DD)');
export const uuidSchema = z.string().uuid();

// ---------- Autenticación ----------
export const passwordSchema = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(128)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Debe contener letras y números');

export const registerSchema = z.object({
  fullName: trimmed(120).min(3, 'Indique su nombre completo'),
  email: z.string().trim().toLowerCase().email('Correo inválido').max(160),
  phone: phoneSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido'),
  password: z.string().min(1, 'Indique su contraseña').max(128),
});

export const profileUpdateSchema = z.object({
  fullName: trimmed(120).min(3),
  phone: phoneSchema,
});

// ---------- Catálogo ----------
const m2String = z
  .string()
  .trim()
  .regex(/^\d+([.,]\d{1,4})?$/, 'Use un número con hasta 4 decimales');
const moneyString = z
  .string()
  .trim()
  .regex(/^\d+([.,]\d{1,2})?$/, 'Use un importe con hasta 2 decimales');

export const productInputSchema = z.object({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-_.]{1,39}$/, 'SKU: 2-40 caracteres alfanuméricos, guiones o puntos'),
  name: trimmed(160).min(2),
  description: trimmed(5000).default(''),
  color: trimmed(60).min(2),
  widthCm: z.coerce.number().positive().max(1000),
  lengthCm: z.coerce.number().positive().max(1000),
  thicknessMm: z.coerce.number().positive().max(100).nullable().optional(),
  piecesPerBox: z.coerce.number().int().min(1).max(1000),
  boxAreaM2: m2String,
  pricingBasis: z.enum(PRICING_BASIS),
  /** Precio en USD según la base de precio elegida (por m² o por caja). */
  price: moneyString,
  /** Precio de referencia BCV en la misma base (m² o caja). Vacío = igual al precio en divisas. */
  priceBcv: z.union([z.literal(''), moneyString]).nullable().optional(),
  finish: z.enum(FINISHES),
  finishNote: trimmed(200).default(''),
  slipRating: z.enum(SLIP_RATINGS).nullable().optional(),
  usageGuide: z
    .object({
      salas: z.enum(USAGE_LEVELS),
      cocina: z.enum(USAGE_LEVELS),
      pisoBano: z.enum(USAGE_LEVELS),
      ducha: z.enum(USAGE_LEVELS),
      exterior: z.enum(USAGE_LEVELS),
      paredes: z.enum(USAGE_LEVELS),
    })
    .nullable()
    .optional(),
  antiSlip: z.enum(ANTISLIP),
  status: z.enum(PRODUCT_STATUS),
  featured: z.boolean().default(false),
  categoryIds: z.array(uuidSchema).min(1, 'Seleccione al menos un ambiente'),
  lowStockThreshold: z.coerce.number().int().min(0).max(100_000).default(10),
});
export type ProductInput = z.infer<typeof productInputSchema>;

export const catalogQuerySchema = z.object({
  q: trimmed(100).optional(),
  color: trimmed(60).optional(),
  size: trimmed(30).optional(),
  category: trimmed(60).optional(),
  finish: z.enum(FINISHES).optional(),
  antiSlip: z.enum(ANTISLIP).optional(),
  slip: z.enum(SLIP_RATINGS).optional(),
  use: z.enum(['salas', 'cocina', 'pisoBano', 'ducha', 'exterior', 'paredes']).optional(),
  minPrice: moneyString.optional(),
  maxPrice: moneyString.optional(),
  available: z.enum(['true', 'false']).optional(),
  featured: z.enum(['true', 'false']).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'name']).default('newest'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(12),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

export const categoryInputSchema = z.object({
  name: trimmed(60).min(2),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,60}$/),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true),
});

export const inventoryMovementInputSchema = z.object({
  type: z.enum(MANUAL_MOVEMENT_TYPES),
  boxes: z.coerce.number().int().min(1).max(1_000_000),
  reason: trimmed(300).min(3, 'Indique el motivo'),
});

// ---------- Cotización y carrito ----------
export const quoteLineSchema = z.object({
  productId: uuidSchema,
  mode: z.enum(QUANTITY_MODES),
  quantity: z.union([z.number().positive(), z.string().trim().min(1).max(20)]),
});
export const quoteRequestSchema = z.object({ items: z.array(quoteLineSchema).min(1).max(50) });

export const cartItemInputSchema = quoteLineSchema;
export const cartItemUpdateSchema = quoteLineSchema.pick({ mode: true, quantity: true });

// ---------- Checkout ----------
export const checkoutSchema = z.object({
  quoteId: uuidSchema.optional(),
  sellerId: uuidSchema,
  sellerConfirmed: z.literal(true, { errorMap: () => ({ message: 'Confirme el vendedor que lo atenderá en la sede' }) }),
  type: z.enum(ORDER_TYPES),
  pickupDate: dateSchema,
  paymentMethodId: uuidSchema,
  fullName: trimmed(120).min(3),
  phone: phoneSchema,
  customerNotes: trimmed(1000).optional(),
  acceptPolicies: z.literal(true, { errorMap: () => ({ message: 'Debe aceptar las políticas comerciales' }) }),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const rescheduleSchema = z.object({ pickupDate: dateSchema, reason: trimmed(500).optional() });
export const cancelOrderSchema = z.object({ reason: trimmed(500).min(3, 'Indique el motivo') });

// ---------- Pagos ----------
export const paymentSubmitSchema = z.object({
  paymentMethodId: uuidSchema,
  amount: moneyString,
  currency: z.enum(CURRENCIES),
  reference: trimmed(80).min(3, 'Indique la referencia de la operación'),
  paidAt: dateSchema,
  payerName: trimmed(120).optional(),
  notes: trimmed(500).optional(),
});
export type PaymentSubmitInput = z.infer<typeof paymentSubmitSchema>;

export const paymentReviewSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('APPROVE'), notes: trimmed(500).optional() }),
  z.object({ decision: z.literal('REJECT'), notes: trimmed(500).min(3, 'Indique el motivo del rechazo') }),
]);

export const paymentMethodInputSchema = z.object({
  kind: z.enum(PAYMENT_METHOD_KINDS),
  name: trimmed(80).min(2),
  currency: z.enum(CURRENCIES),
  instructions: trimmed(3000).min(5, 'Escriba las instrucciones de pago'),
  receivingDetails: trimmed(2000).default(''),
  buyerNote: trimmed(1000).default(''),
  proofInstructions: trimmed(1000).default(''),
  requiresProof: z.boolean(),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});

// ---------- Tasa ----------
export const manualRateSchema = z.object({
  rate: z
    .string()
    .trim()
    .regex(/^\d+([.,]\d{1,8})?$/, 'Tasa inválida (máximo 8 decimales)'),
  effectiveDate: dateSchema,
  sourceNote: trimmed(300).min(3, 'Indique de dónde proviene la tasa'),
});

// ---------- Retiro ----------
export const blockedDateSchema = z.object({ date: dateSchema, reason: trimmed(200).min(2) });

// ---------- Vendedores y usuarios ----------
/** Datos de contacto comercial públicos del vendedor (todos opcionales). */
const sellerContactShape = {
  city: trimmed(120).default(''),
  branch: trimmed(120).default(''),
  publicPhone: z.union([z.literal(''), phoneSchema]).default(''),
  publicEmail: z.union([z.literal(''), z.string().trim().toLowerCase().email().max(160)]).default(''),
};

export const sellerCreateSchema = z.object({
  fullName: trimmed(120).min(3),
  displayName: trimmed(80).min(2),
  email: z.string().trim().toLowerCase().email().max(160),
  phone: phoneSchema,
  /** Opcional: si se omite, la cuenta queda pendiente de activación por enlace. */
  password: z.union([z.literal(''), passwordSchema]).optional(),
  canReviewPayments: z.boolean().default(false),
  canViewProofs: z.boolean().default(true),
  ...sellerContactShape,
});
export const sellerUpdateSchema = z.object({
  displayName: trimmed(80).min(2),
  phone: phoneSchema,
  ...sellerContactShape,
  active: z.boolean(),
  canReviewPayments: z.boolean(),
  canViewProofs: z.boolean(),
  bio: trimmed(300).optional(),
});
export const userRoleUpdateSchema = z.object({ role: z.enum(ROLES), active: z.boolean() });

// ---------- Operación de órdenes ----------
export const orderStatusActionSchema = z.object({
  action: z.enum(['MARK_READY', 'MARK_DELIVERED', 'CANCEL']),
  note: trimmed(500).optional(),
});
export const orderNoteSchema = z.object({
  kind: z.enum(ORDER_NOTE_KINDS),
  body: trimmed(2000).min(2),
});

// ---------- Chat ----------
export const startConversationSchema = z.object({
  sellerId: uuidSchema.optional(),
  orderId: uuidSchema.optional(),
  subject: trimmed(120).optional(),
  message: trimmed(4000).min(1),
});
export const sendMessageSchema = z.object({ body: trimmed(4000).min(1, 'Escriba un mensaje') });
export const conversationStatusSchema = z.object({ status: z.enum(CONVERSATION_STATUS) });

export const activationSchema = z.object({
  token: z.string().trim().min(20).max(200),
  password: passwordSchema,
});
