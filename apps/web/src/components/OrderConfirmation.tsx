import { CheckCircle2, Circle, CircleDot, MessageCircle, XCircle } from 'lucide-react';
import { PAYMENT_REVIEW_STATE_LABELS, whatsappLink } from '@porcelanas/shared';
import type { Order } from '../lib/types';
import { formatDateLong } from '../lib/format';

/** Mensaje prellenado para coordinar la visita con el vendedor, con el número de orden real. */
export function visitMessage(order: Pick<Order, 'code' | 'seller'>) {
  const first = order.seller.displayName.split(' ')[0];
  const city = order.seller.city || 'Barinas';
  return `Hola, ${first}. Acabo de realizar una orden de compra de porcelanas en la plataforma. Mi número de orden es ${order.code}. Quiero coordinar mi visita a la sede de ${city} para que puedas recibirme y atender mi pedido.`;
}

/**
 * Cartel posterior a la creación de la orden. Solo se muestra con datos devueltos por el
 * servidor (la orden ya existe). No bloquea la navegación ni da a entender que el pago fue aprobado.
 */
export function OrderRegisteredBanner({ order, onViewOrder }: { order: Order; onViewOrder: () => void }) {
  const s = order.seller;
  const city = s.city || 'Barinas';
  const wa = whatsappLink(s.whatsapp, visitMessage(order));
  return (
    <section role="status" aria-labelledby="orden-registrada" className="border border-ink bg-white">
      <div className="border-b border-stone-200 bg-stone-50 px-6 py-5 sm:px-8">
        <p className="eyebrow">Número de orden</p>
        <p className="mt-1 font-mono text-3xl font-semibold tracking-wide sm:text-4xl" data-testid="banner-order-code">
          {order.code}
        </p>
      </div>
      <div className="space-y-4 px-6 py-6 sm:px-8">
        <h2 id="orden-registrada" className="flex items-start gap-3 text-3xl sm:text-4xl">
          <CheckCircle2 className="mt-1 h-7 w-7 shrink-0" aria-hidden />
          ¡Tu orden de compra ha sido registrada!
        </h2>
        <p className="text-base leading-relaxed">
          Para garantizar una atención adecuada, antes de dirigirte a nuestra sede en {city}, debes contactar a tu vendedor asignado para que esté preparado para recibirte y atender tu
          pedido.
        </p>
        <dl className="space-y-1 border-l-2 border-ink pl-4 text-base">
          <div>
            <dt className="inline">Vendedor responsable: </dt>
            <dd className="inline font-medium">{s.displayName}</dd>
          </div>
          {(s.publicPhone || s.whatsapp) && (
            <div>
              <dt className="inline">Teléfono / WhatsApp: </dt>
              <dd className="inline font-medium">
                <a href={`tel:+${s.whatsapp}`} className="hover:underline">
                  {s.publicPhone || `+${s.whatsapp}`}
                </a>
              </dd>
            </div>
          )}
          {s.publicEmail && (
            <div>
              <dt className="inline">Correo electrónico: </dt>
              <dd className="inline font-medium">
                <a href={`mailto:${s.publicEmail}`} className="break-all underline underline-offset-4">
                  {s.publicEmail}
                </a>
              </dd>
            </div>
          )}
        </dl>
        <p className="text-base">Ten a mano tu número de orden cuando te comuniques con el vendedor.</p>
        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-primary px-6 py-4 text-sm tracking-[0.08em]" data-testid="banner-whatsapp">
              <MessageCircle className="h-5 w-5" aria-hidden /> Contactar a mi vendedor por WhatsApp
            </a>
          )}
          <button type="button" className="btn-outline px-6 py-4 text-sm" onClick={onViewOrder}>
            Ver mi orden de compra
          </button>
        </div>
        <div className="space-y-1.5 border-t border-stone-200 pt-4 text-sm text-ink-soft">
          <p>
            Estado del pago: <strong className="text-ink">{PAYMENT_REVIEW_STATE_LABELS[order.paymentReviewState]}</strong>. Registrar la orden no significa que el pago haya sido aprobado ni
            que el pedido esté listo para entregar: te avisaremos cuando el pago se confirme y cuando tu pedido esté listo para retirar.
          </p>
          <p>
            Fecha de retiro registrada: <strong className="text-ink">{formatDateLong(order.pickupDate)}</strong>. Cualquier cambio debe coordinarse con tu vendedor conforme a las
            políticas comerciales.
          </p>
        </div>
      </div>
    </section>
  );
}

type StepState = 'done' | 'current' | 'pending' | 'failed';

/** Progreso de la orden: el estado de la orden y el del pago se muestran por separado. */
export function OrderProgress({ order }: { order: Order }) {
  const cancelled = order.status === 'CANCELLED' || order.status === 'EXPIRED';
  const pay = order.paymentReviewState;
  const paid = pay === 'APPROVED' || pay === 'PARTIALLY_APPROVED' || ['CONFIRMED', 'READY_FOR_PICKUP', 'DELIVERED'].includes(order.status);
  const steps: { label: string; detail?: string; state: StepState }[] = [
    { label: 'Orden registrada', state: 'done' },
    {
      label: paid ? PAYMENT_REVIEW_STATE_LABELS[pay === 'PARTIALLY_APPROVED' ? 'PARTIALLY_APPROVED' : 'APPROVED'] : PAYMENT_REVIEW_STATE_LABELS[pay],
      detail: paid ? undefined : pay === 'AWAITING_PAYMENT' ? 'Realiza el pago y adjunta el comprobante' : pay === 'REJECTED' ? 'Adjunta un nuevo comprobante' : 'Tu vendedor verificará el pago',
      state: paid ? 'done' : pay === 'REJECTED' ? 'failed' : cancelled ? 'pending' : 'current',
    },
    { label: 'Pedido en preparación', state: order.status === 'CONFIRMED' ? 'current' : ['READY_FOR_PICKUP', 'DELIVERED'].includes(order.status) ? 'done' : 'pending' },
    { label: 'Listo para retirar', state: order.status === 'READY_FOR_PICKUP' ? 'current' : order.status === 'DELIVERED' ? 'done' : 'pending' },
    { label: 'Entregado', state: order.status === 'DELIVERED' ? 'done' : 'pending' },
  ];
  if (cancelled) steps.push({ label: order.status === 'EXPIRED' ? 'Vencido' : 'Cancelado', detail: order.cancelReason ?? undefined, state: 'failed' });
  const icon = (st: StepState) =>
    st === 'done' ? <CheckCircle2 className="h-5 w-5 text-ink" aria-hidden /> : st === 'current' ? <CircleDot className="h-5 w-5 text-ink" aria-hidden /> : st === 'failed' ? <XCircle className="h-5 w-5 text-[#7a3030]" aria-hidden /> : <Circle className="h-5 w-5 text-stone-300" aria-hidden />;
  return (
    <ol className="grid grid-cols-1 gap-3 sm:grid-cols-5" aria-label="Progreso de la orden">
      {steps.map((st, i) => (
        <li key={i} className={`flex items-start gap-2 border-t-2 pt-3 sm:flex-col ${st.state === 'pending' ? 'border-stone-200 text-ink-muted' : st.state === 'failed' ? 'border-[#7a3030]' : 'border-ink'}`}>
          {icon(st.state)}
          <span>
            <span className="block text-sm">{st.label}</span>
            {st.detail && st.state !== 'done' && <span className="block text-xs text-ink-muted">{st.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
