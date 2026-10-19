import { PAYMENT_REVIEW_STATE_LABELS, type OrderPaymentStatus, type OrderStatus, type PaymentReviewState, type PaymentStatus } from '@porcelanas/shared';
import { Badge } from './ui';
import { ORDER_PAYMENT_STATUS_LABELS, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '../lib/format';

const orderColor: Record<OrderStatus, 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'brass'> = {
  PENDING_PAYMENT: 'amber',
  CONFIRMED: 'blue',
  READY_FOR_PICKUP: 'brass',
  DELIVERED: 'green',
  CANCELLED: 'red',
  EXPIRED: 'gray',
};

export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => <Badge color={orderColor[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;

export const OrderPaymentBadge = ({ status }: { status: OrderPaymentStatus }) => (
  <Badge color={status === 'PAID' ? 'green' : status === 'PARTIAL' ? 'blue' : 'gray'}>{ORDER_PAYMENT_STATUS_LABELS[status]}</Badge>
);

export function PaymentReviewBadge({ state }: { state: PaymentReviewState }) {
  const color = state === 'APPROVED' ? 'green' : state === 'REJECTED' ? 'red' : state === 'PROOF_RECEIVED' ? 'amber' : state === 'PARTIALLY_APPROVED' ? 'blue' : 'gray';
  return <Badge color={color}>{PAYMENT_REVIEW_STATE_LABELS[state]}</Badge>;
}

export const PaymentStatusBadge = ({ status }: { status: PaymentStatus }) => (
  <Badge color={status === 'APPROVED' ? 'green' : status === 'REJECTED' ? 'red' : 'amber'}>{PAYMENT_STATUS_LABELS[status]}</Badge>
);

export function StockBadge({ status, available }: { status: 'IN_STOCK' | 'LOW' | 'OUT'; available: number }) {
  if (status === 'OUT') return <Badge color="red">Agotado</Badge>;
  if (status === 'LOW') return <Badge color="amber">Últimas {available} cajas</Badge>;
  return <Badge color="green">Disponible</Badge>;
}
