export const ROLES = ['ADMIN', 'SELLER', 'CUSTOMER'] as const;
export type Role = (typeof ROLES)[number];

export const FINISHES = ['MATE', 'BRILLANTE', 'PULIDO', 'SATINADO', 'TEXTURIZADO', 'RUSTICO', 'OTRO'] as const;
export type Finish = (typeof FINISHES)[number];
export const FINISH_LABELS: Record<Finish, string> = {
  MATE: 'Mate',
  BRILLANTE: 'Brillante',
  PULIDO: 'Pulido',
  SATINADO: 'Satinado',
  TEXTURIZADO: 'Texturizado',
  RUSTICO: 'Rústico',
  OTRO: 'Otro',
};

export const ANTISLIP = ['YES', 'NO', 'UNVERIFIED'] as const;
export type AntiSlip = (typeof ANTISLIP)[number];
export const ANTISLIP_LABELS: Record<AntiSlip, string> = {
  YES: 'Antideslizante',
  NO: 'No antideslizante',
  UNVERIFIED: 'Antideslizante no verificado',
};

export const PRODUCT_STATUS = ['DRAFT', 'ACTIVE', 'INACTIVE', 'DISCONTINUED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[number];
export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  DISCONTINUED: 'Descontinuado',
};

export const PRICING_BASIS = ['M2', 'BOX'] as const;
export type PricingBasis = (typeof PRICING_BASIS)[number];

export const QUANTITY_MODES = ['BOXES', 'M2'] as const;
export type QuantityMode = (typeof QUANTITY_MODES)[number];

export const ORDER_TYPES = ['PICKUP', 'PREPAY'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];
export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  PICKUP: 'Compra con retiro programado',
  PREPAY: 'Prepago y retiro posterior',
};

export const ORDER_STATUS = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'READY_FOR_PICKUP',
  'DELIVERED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Pendiente de pago',
  CONFIRMED: 'Confirmada',
  READY_FOR_PICKUP: 'Lista para retiro',
  DELIVERED: 'Entregada',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Vencida',
};

export const ORDER_PAYMENT_STATUS = ['UNPAID', 'PARTIAL', 'PAID'] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUS)[number];
export const ORDER_PAYMENT_STATUS_LABELS: Record<OrderPaymentStatus, string> = {
  UNPAID: 'Sin pagos acreditados',
  PARTIAL: 'Pago parcial acreditado',
  PAID: 'Pagado',
};

export const PAYMENT_STATUS = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Pendiente de verificación',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
};

export const PROOF_STATUS = ['PENDING', 'APPROVED', 'REJECTED', 'REPLACED'] as const;
export type ProofStatus = (typeof PROOF_STATUS)[number];

export const PAYMENT_METHOD_KINDS = ['PAGO_MOVIL', 'ZELLE', 'BINANCE', 'BANK_TRANSFER', 'CASH'] as const;
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethodKind, string> = {
  PAGO_MOVIL: 'Pago Móvil',
  ZELLE: 'Zelle',
  BINANCE: 'Binance',
  BANK_TRANSFER: 'Transferencia bancaria',
  CASH: 'Efectivo',
};

export const CURRENCIES = ['USD', 'VES'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CONVERSATION_STATUS = ['OPEN', 'PENDING', 'CLOSED'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUS)[number];
export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  OPEN: 'Abierta',
  PENDING: 'En espera',
  CLOSED: 'Cerrada',
};

export const ORDER_NOTE_KINDS = ['NOTE', 'INCIDENT'] as const;
export type OrderNoteKind = (typeof ORDER_NOTE_KINDS)[number];

export const INVENTORY_MOVEMENT_TYPES = [
  'INITIAL',
  'RECEIPT',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'DAMAGE',
  'RESERVE',
  'RELEASE',
  'DELIVERY',
] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];
export const INVENTORY_MOVEMENT_LABELS: Record<InventoryMovementType, string> = {
  INITIAL: 'Existencia inicial',
  RECEIPT: 'Entrada de mercancía',
  ADJUSTMENT_IN: 'Ajuste positivo',
  ADJUSTMENT_OUT: 'Ajuste negativo',
  DAMAGE: 'Merma / daño',
  RESERVE: 'Reserva por operación',
  RELEASE: 'Liberación de reserva',
  DELIVERY: 'Entrega al cliente',
};
/** Movimientos que un administrador puede registrar manualmente. */
export const MANUAL_MOVEMENT_TYPES = ['RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE'] as const;
export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number];

export const RATE_SOURCES = ['BCV_AUTO', 'MANUAL'] as const;
export type RateSource = (typeof RATE_SOURCES)[number];
