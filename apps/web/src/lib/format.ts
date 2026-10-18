import { formatM2, formatRate, formatUSD, formatVES, FINISH_LABELS, ANTISLIP_LABELS, ORDER_STATUS_LABELS, ORDER_PAYMENT_STATUS_LABELS, PAYMENT_STATUS_LABELS, ORDER_TYPE_LABELS, formatDateLong } from '@porcelanas/shared';

export { formatM2, formatRate, formatUSD, formatVES, FINISH_LABELS, ANTISLIP_LABELS, ORDER_STATUS_LABELS, ORDER_PAYMENT_STATUS_LABELS, PAYMENT_STATUS_LABELS, ORDER_TYPE_LABELS, formatDateLong };

export function formatDateTime(iso: string | Date) {
  return new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export function formatShortDate(date: string) {
  return new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat('es-VE', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}
