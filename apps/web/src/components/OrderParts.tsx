import type { Order } from '../lib/types';
import { formatDateLong, formatDateTime, formatM2, formatRate, formatUSD, formatVES, ORDER_TYPE_LABELS } from '../lib/format';
import { OrderStatusBadge, PaymentReviewBadge, PaymentStatusBadge } from './StatusBadges';
import { PRICE_LIST_LABELS } from '@porcelanas/shared';

export function OrderHeader({ order }: { order: Order }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <OrderStatusBadge status={order.status} />
      <PaymentReviewBadge state={order.paymentReviewState} />
      <span className="text-sm text-ink-muted">
        {ORDER_TYPE_LABELS[order.type]} · {PRICE_LIST_LABELS[order.priceList]}
      </span>
    </div>
  );
}

export function OrderItemsTable({ order }: { order: Order }) {
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Solicitado</th>
            <th className="text-right">Cajas</th>
            <th className="text-right">m²</th>
            <th className="text-right">Precio/caja</th>
            <th className="text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.id}>
              <td>
                <p className="font-medium">{i.productName}</p>
                <p className="text-xs text-ink-muted">
                  {i.sku} · {i.sizeLabel} cm · {i.color}
                </p>
              </td>
              <td className="whitespace-nowrap">{i.mode === 'M2' ? `${i.requestedQuantity.replace('.', ',')} m²` : `${i.requestedQuantity} cajas`}</td>
              <td className="text-right">{i.boxes}</td>
              <td className="whitespace-nowrap text-right">{formatM2(i.areaUnits)}</td>
              <td className="whitespace-nowrap text-right">{formatUSD(i.priceBoxCents)}</td>
              <td className="whitespace-nowrap text-right font-medium">{formatUSD(i.lineTotalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrderAmounts({ order }: { order: Order }) {
  return (
    <dl className="space-y-1.5 text-sm">
      <Row k={order.priceList === 'BCV' ? 'Total (precio BCV)' : 'Total (divisas)'} v={<strong>{formatUSD(order.totalCents)}</strong>} />
      <Row k="Equivalente en Bs" v={formatVES(order.totalVesCents)} />
      <Row k="Tasa aplicada (fijada)" v={`Bs. ${formatRate(order.rateValue)}`} />
      <Row k={order.type === 'PICKUP' ? 'Pago requerido' : 'Prepago mínimo'} v={formatUSD(order.requiredCents)} />
      <Row k="Acreditado" v={<span className="text-emerald-700">{formatUSD(order.paidCents)}</span>} />
      <Row k="Saldo pendiente" v={<strong className={order.balanceCents > 0 ? 'text-amber-800' : ''}>{formatUSD(order.balanceCents)}</strong>} />
      <Row k="Cajas / superficie" v={`${order.totalBoxes} · ${formatM2(order.totalAreaUnits)}`} />
      <Row k="Método de pago elegido" v={order.preferredMethod?.name ?? '—'} />
    </dl>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}

export function PickupInfo({ order }: { order: Order }) {
  return (
    <div className="text-sm">
      <p className="text-xs uppercase tracking-wide text-ink-muted">Fecha de retiro</p>
      <p className="mt-1 font-display text-lg capitalize">{formatDateLong(order.pickupDate)}</p>
      {order.status === 'PENDING_PAYMENT' && order.expiresAt && (
        <p className="mt-1 text-xs text-amber-800">Mercancía apartada hasta {formatDateTime(order.expiresAt)} si no se acredita el pago requerido.</p>
      )}
      {order.rescheduleCount > 0 && <p className="mt-1 text-xs text-ink-muted">Cambios de fecha realizados: {order.rescheduleCount}</p>}
    </div>
  );
}

export function OrderTimeline({ order }: { order: Order }) {
  return (
    <ol className="relative ml-2 space-y-4 border-l border-stone-200 pl-5">
      {[...order.events].reverse().map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-brass" aria-hidden />
          <p className="text-sm">{e.message}</p>
          <p className="text-xs text-ink-muted">
            {formatDateTime(e.createdAt)} · {e.actor}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function PaymentsList({ order, renderExtra }: { order: Order; renderExtra?: (p: Order['payments'][number]) => React.ReactNode }) {
  if (order.payments.length === 0) return <p className="text-sm text-ink-muted">Aún no hay pagos registrados.</p>;
  return (
    <ul className="divide-y divide-stone-100">
      {order.payments.map((p) => (
        <li key={p.id} className="py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">
              {p.method.name} · {p.currency === 'VES' ? formatVES(p.amountCents) : formatUSD(p.amountCents)}
              {p.currency === 'VES' && <span className="text-xs font-normal text-ink-muted"> (≈ {formatUSD(p.creditUsdCents)})</span>}
            </span>
            <PaymentStatusBadge status={p.status} />
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">
            Ref. {p.reference} · pagado el {p.paidAt} · registrado {formatDateTime(p.createdAt)}
            {p.reviewedBy && ` · revisado por ${p.reviewedBy}`}
          </p>
          {p.reviewNotes && <p className="mt-1 text-xs">Observación: {p.reviewNotes}</p>}
          {p.proofs.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-3 text-xs">
              {p.proofs.map((pr, idx) => (
                <a key={pr.id} href={`/api/proofs/${pr.id}`} target="_blank" rel="noopener noreferrer" className={`underline ${pr.status === 'REPLACED' ? 'text-ink-muted line-through' : 'text-ink-soft'}`}>
                  Comprobante {p.proofs.length - idx}
                </a>
              ))}
            </div>
          )}
          {renderExtra?.(p)}
        </li>
      ))}
    </ul>
  );
}
