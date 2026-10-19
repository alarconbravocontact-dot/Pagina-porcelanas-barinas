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
  PENDING_PAYMENT: 'Orden registrada',
  CONFIRMED: 'Pedido en preparación',
  READY_FOR_PICKUP: 'Listo para retirar',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Vencido',
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

export const SLIP_RATINGS = ['R11', 'R10', 'MODERATE', 'MEDIUM_LOW', 'SLIPPERY'] as const;
export type SlipRating = (typeof SLIP_RATINGS)[number];
export const SLIP_RATING_LABELS: Record<SlipRating, string> = {
  R11: 'Antideslizante alto R11',
  R10: 'Antideslizante R10',
  MODERATE: 'Antideslizante moderado',
  MEDIUM_LOW: 'Agarre medio-bajo',
  SLIPPERY: 'Resbaladizo',
};
export const SLIP_RATING_DESCRIPTIONS: Record<SlipRating, string> = {
  R11: 'La opción más segura: piso de ducha, baños, terrazas, exteriores y bordes de piscina.',
  R10: 'Agarre intermedio. Pisos interiores, cocinas, baños y terrazas techadas o exteriores con pendiente y drenaje. Ducha: mejor R11.',
  MODERATE: 'Buen agarre en interiores. Apto para cocina y piso de baño. Para ducha o exterior descubierto, pedir ficha con R10–R11.',
  MEDIUM_LOW: 'Menos brillo que el pulido, sin clase antideslizante declarada. Pisos interiores y paredes; en baño, con alfombra y lejos de la ducha.',
  SLIPPERY: 'Brillo alto; mojado resbala. Ideal para salas, habitaciones y paredes. Evitar en piso de baño, ducha y exterior.',
};

export const USAGE_AREAS = ['salas', 'cocina', 'pisoBano', 'ducha', 'exterior', 'paredes'] as const;
export type UsageArea = (typeof USAGE_AREAS)[number];
export const USAGE_AREA_LABELS: Record<UsageArea, string> = {
  salas: 'Salas',
  cocina: 'Cocina',
  pisoBano: 'Piso de baño',
  ducha: 'Ducha',
  exterior: 'Exterior',
  paredes: 'Paredes',
};
export const USAGE_LEVELS = ['YES', 'CAUTION', 'NO'] as const;
export type UsageLevel = (typeof USAGE_LEVELS)[number];
export const USAGE_LEVEL_LABELS: Record<UsageLevel, string> = {
  YES: 'Recomendado',
  CAUTION: 'Con precaución o confirmar ficha técnica',
  NO: 'No recomendado',
};
export type UsageGuide = Record<UsageArea, UsageLevel>;

export const PRICE_LISTS = ['DIVISA', 'BCV'] as const;
export type PriceList = (typeof PRICE_LISTS)[number];
export const PRICE_LIST_LABELS: Record<PriceList, string> = {
  DIVISA: 'Precio en divisas (pago en USD)',
  BCV: 'Precio BCV (pago en bolívares)',
};
/** La moneda del método de pago determina la lista de precios de la operación. */
export const priceListForCurrency = (currency: Currency): PriceList => (currency === 'VES' ? 'BCV' : 'DIVISA');
export const currencyForPriceList = (list: PriceList): Currency => (list === 'BCV' ? 'VES' : 'USD');

/** Estado de revisión visible para el comprador (distinto del método de pago elegido). */
export const PAYMENT_REVIEW_STATES = ['AWAITING_PAYMENT', 'PROOF_RECEIVED', 'IN_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED'] as const;
export type PaymentReviewState = (typeof PAYMENT_REVIEW_STATES)[number];
export const PAYMENT_REVIEW_STATE_LABELS: Record<PaymentReviewState, string> = {
  AWAITING_PAYMENT: 'Pago pendiente',
  PROOF_RECEIVED: 'Comprobante recibido',
  IN_REVIEW: 'Pago en revisión',
  APPROVED: 'Pago confirmado',
  PARTIALLY_APPROVED: 'Pago parcial confirmado',
  REJECTED: 'Pago rechazado',
};
