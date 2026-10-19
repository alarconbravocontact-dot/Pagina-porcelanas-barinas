import type {
  AntiSlip,
  BusinessSettings,
  ConversationStatus,
  Currency,
  Finish,
  OrderPaymentStatus,
  OrderStatus,
  OrderType,
  PaymentMethodKind,
  PaymentStatus,
  Permission,
  ProductStatus,
  QuantityMode,
  Role,
  SlipRating,
  PriceList,
  PaymentReviewState,
  UsageLevel,
} from '@porcelanas/shared';

export interface SessionUser {
  id: string;
  email: string | null;
  profileComplete: boolean;
  hasCredentials: boolean;
  role: Role;
  fullName: string;
  phone: string | null;
  customerId: string | null;
  sellerId: string | null;
  permissions: Permission[];
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  color: string;
  widthCm: number;
  lengthCm: number;
  sizeLabel: string;
  thicknessMm: number | null;
  piecesPerBox: number;
  boxAreaUnits: number;
  boxAreaM2: string;
  pricingBasis: 'M2' | 'BOX';
  priceBoxCents: number;
  priceM2Cents: number;
  priceBcvBoxCents: number;
  priceBcvM2Cents: number;
  hasBcvPrice: boolean;
  finish: Finish;
  finishNote: string;
  slipRating: SlipRating | null;
  usageGuide: Record<'salas' | 'cocina' | 'pisoBano' | 'ducha' | 'exterior' | 'paredes', UsageLevel> | null;
  sourceNote?: string;
  antiSlip: AntiSlip;
  status: ProductStatus;
  featured: boolean;
  isDemo: boolean;
  categories: { id: string; name: string; slug: string }[];
  images: { id: string; url: string; alt: string }[];
  availableBoxes: number;
  stockStatus: 'IN_STOCK' | 'LOW' | 'OUT';
  createdAt: string;
  updatedAt: string;
  onHandBoxes?: number;
  reservedBoxes?: number;
  lowStockThreshold?: number;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface RateStatus {
  id: string;
  rate: string;
  source: 'BCV_AUTO' | 'MANUAL';
  sourceUrl: string | null;
  sourceNote: string | null;
  effectiveDate: string;
  createdAt: string;
  createdBy: string | null;
  ageHours: number;
  stale: boolean;
}

export interface QuoteLine {
  productId: string;
  sku: string;
  name: string;
  color: string;
  sizeLabel: string;
  imageUrl: string | null;
  boxAreaUnits: number;
  piecesPerBox: number;
  mode: QuantityMode;
  requestedQuantity: string;
  boxes: number;
  areaUnits: number;
  priceBoxCents: number;
  priceM2Cents: number;
  lineTotalCents: number;
  priceBcvBoxCents: number;
  priceBcvM2Cents: number;
  lineTotalBcvCents: number;
  availableBoxes: number;
  stockOk: boolean;
  error: string | null;
}

export interface Quote {
  lines: QuoteLine[];
  subtotalCents: number;
  subtotalBcvCents: number;
  totalBoxes: number;
  totalAreaUnits: number;
  rate: RateStatus | null;
  totalVesCents: number | null;
  valid: boolean;
  quoteId?: string;
  validUntil?: string;
}

export interface CartView {
  id: string | null;
  items: { id: string; productId: string; mode: QuantityMode; quantity: string; line: QuoteLine }[];
  quote: Quote | null;
}

/** Datos de contacto comercial públicos del vendedor. */
export interface SellerContact {
  city?: string;
  branch?: string;
  publicPhone?: string;
  whatsapp?: string;
  publicEmail?: string;
}

export interface Seller extends SellerContact {
  id: string;
  displayName: string;
  bio: string | null;
}

export interface PaymentMethod {
  id: string;
  kind: PaymentMethodKind;
  name: string;
  currency: Currency;
  instructions: string;
  receivingDetails: string;
  buyerNote: string;
  proofInstructions: string;
  requiresProof: boolean;
  priceList?: PriceList;
  configured: boolean;
  available?: boolean;
  active?: boolean;
  sortOrder?: number;
}

export interface OrderPayment {
  id: string;
  method: { id: string; name: string; kind: PaymentMethodKind; currency: Currency };
  currency: Currency;
  amountCents: number;
  creditUsdCents: number;
  reference: string;
  paidAt: string;
  payerName: string | null;
  notes: string | null;
  status: PaymentStatus;
  reviewedAt: string | null;
  reviewNotes: string | null;
  reviewStartedAt: string | null;
  reviewedBy?: string | null;
  createdAt: string;
  proofs: { id: string; status: string; mimeType: string; sizeBytes: number; originalName: string; createdAt: string }[];
}

export interface Order {
  id: string;
  code: string;
  type: OrderType;
  priceList: PriceList;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  paymentReviewState: PaymentReviewState;
  subtotalCents: number;
  totalCents: number;
  totalVesCents: number;
  requiredCents: number;
  paidCents: number;
  balanceCents: number;
  totalBoxes: number;
  totalAreaUnits: number;
  rateValue: string;
  pickupDate: string;
  rescheduleCount: number;
  expiresAt: string | null;
  confirmedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  contactName: string;
  contactPhone: string;
  contactCity: string;
  contactAddressRef: string;
  contactDocumentMasked: string;
  customerNotes: string | null;
  createdAt: string;
  terms: Record<string, unknown> & { maxReschedules?: number; prepayMinPercent?: number };
  seller: { id: string; displayName: string; phone?: string } & SellerContact;
  customer?: { id: string; fullName: string; phone: string };
  preferredMethod: PaymentMethod | null;
  reservation: { status: string; pickupDate: string; heldUntil: string | null; releasedAt: string | null; releaseReason: string | null } | null;
  items: {
    id: string;
    productId: string;
    sku: string;
    productName: string;
    color: string;
    sizeLabel: string;
    boxAreaUnits: number;
    piecesPerBox: number;
    mode: QuantityMode;
    requestedQuantity: string;
    boxes: number;
    areaUnits: number;
    priceBoxCents: number;
    priceM2Cents: number;
    lineTotalCents: number;
  }[];
  payments: OrderPayment[];
  events: { id: string; type: string; fromStatus: OrderStatus | null; toStatus: OrderStatus | null; message: string; createdAt: string; actor: string }[];
  notes?: { id: string; kind: 'NOTE' | 'INCIDENT'; body: string; author: string; createdAt: string }[];
  canReviewPayments?: boolean;
  canCancel?: boolean;
}

export interface Conversation {
  id: string;
  status: ConversationStatus;
  subject: string | null;
  customer: { id: string; fullName: string };
  seller: { id: string; displayName: string } & SellerContact;
  order: { id: string; code: string; status: OrderStatus } | null;
  lastMessageAt: string;
  customerLastReadAt: string | null;
  sellerLastReadAt: string | null;
  unread: number;
  lastMessage: { body: string; createdAt: string; senderId: string } | null;
  viewerSide: 'customer' | 'seller' | 'admin';
}

export interface ChatMessage {
  id: string;
  conversationId?: string;
  body: string;
  createdAt: string;
  senderId: string;
  senderSide: 'customer' | 'seller' | 'staff';
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export type PublicSettings = Pick<
  BusinessSettings,
  'store' | 'whatsapp' | 'pickup' | 'reservation' | 'cancellation' | 'quote' | 'uploads' | 'policies' | 'faq'
>;

export interface PickupAvailability {
  timezone: string;
  today: string;
  days: { date: string; available: boolean; reason: string | null; remaining: number; open: string | null; close: string | null }[];
}

export interface CustomerProfile {
  fullName: string;
  phone: string;
  city: string;
  addressRef: string;
  documentId: string;
  documentMasked: string;
  complete: boolean;
  hasCredentials: boolean;
}
