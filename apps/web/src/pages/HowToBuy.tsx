import { Link } from 'react-router-dom';
import { WEEKDAY_LABELS } from '@porcelanas/shared';
import { useSettings } from '../hooks/data';
import { RateNotice } from '../components/RateNotice';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { PageHeader } from '../components/ui';

/** FAQ administrable; si no se configuró, se muestran respuestas derivadas de la configuración vigente. */
export function useFaq() {
  const { data } = useSettings();
  if (data?.faq.items.length) return data.faq.items;
  const r = data?.reservation;
  const c = data?.cancellation;
  const p = data?.pickup;
  return [
    {
      q: '¿Puedo comprar por metros cuadrados?',
      a: 'Sí. Indica los m² y el sistema calcula las cajas completas necesarias (siempre se redondea hacia arriba) y los m² efectivos que recibirás.',
    },
    {
      q: '¿En qué moneda están los precios?',
      a: 'Los precios se fijan en dólares (USD). El equivalente en bolívares se calcula con la tasa BCV registrada por la tienda y queda guardado en tu operación.',
    },
    {
      q: '¿Cuánto debo prepagar para reservar?',
      a: r ? `En la modalidad de prepago, el mínimo es el ${r.prepayMinPercent}% del total. El saldo se cancela antes o al momento del retiro.` : 'Consulte la política de prepago vigente.',
    },
    {
      q: '¿Cuánto tiempo queda apartada mi mercancía?',
      a: r
        ? `La mercancía queda apartada ${r.holdHours} horas mientras registras el pago requerido. Si no se acredita a tiempo, la reserva vence y el inventario se libera.`
        : 'El inventario se aparta por un tiempo limitado mientras se registra el pago.',
    },
    {
      q: '¿Puedo cambiar la fecha de retiro?',
      a: c ? `Sí, hasta ${c.maxReschedules} veces y con al menos ${c.rescheduleMinHours} horas de anticipación, sujeto a disponibilidad del calendario.` : 'Sí, según la política vigente.',
    },
    {
      q: '¿Con cuánta anticipación debo programar el retiro?',
      a: p ? `Se requieren al menos ${p.minAdvanceHours} horas de anticipación.` : 'Consulte el calendario de retiro.',
    },
    { q: '¿Por qué debo elegir un vendedor?', a: 'El vendedor seleccionado te representa en la sede: recibe tu operación, responde tus mensajes y gestiona la entrega.' },
    { q: '¿Subir el comprobante confirma mi pago?', a: 'No. Cada comprobante se verifica manualmente. Recibirás una notificación cuando sea aprobado o rechazado.' },
  ];
}

export function HowToBuyPage() {
  const { data } = useSettings();
  const r = data?.reservation;
  const p = data?.pickup;
  return (
    <div className="container-page max-w-4xl py-10">
      <PageHeader title="Cómo comprar" subtitle="Compra con retiro programado o prepago y retiro posterior en la sede." />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2" data-tour="howto-modes">
        <div className="card p-6">
          <h2 className="text-xl">Compra con retiro programado</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-soft">
            <li>• Pagas el total de la operación.</li>
            <li>• Escoges una fecha de retiro habilitada{p ? ` dentro de los próximos ${p.maxDaysAheadPickup} días` : ''}.</li>
            <li>• Al verificarse el pago, la operación queda confirmada.</li>
          </ul>
        </div>
        <div className="card p-6">
          <h2 className="text-xl">Prepago y retiro posterior</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-soft">
            <li>• Abonas al menos el {r?.prepayMinPercent ?? '—'}% del total.</li>
            <li>• Reservas una fecha futura{p ? ` (hasta ${p.maxDaysAheadPrepay} días)` : ''}.</li>
            <li>• Consultas el importe acreditado y el saldo pendiente en tu cuenta.</li>
          </ul>
        </div>
      </div>
      {p && (
        <div className="card mt-6 p-6" data-tour="howto-hours">
          <h2 className="text-xl">Días y horarios de retiro</h2>
          <ul className="mt-3 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {p.weekdays.map((d, i) => (
              <li key={i} className="flex justify-between border-b border-stone-100 py-1.5">
                <span>{WEEKDAY_LABELS[i]}</span>
                <span className={d.enabled ? '' : 'text-ink-muted'}>{d.enabled ? `${d.open} – ${d.close}` : 'Sin retiros'}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-muted">Capacidad diaria limitada. Algunas fechas pueden estar bloqueadas por la sede.</p>
        </div>
      )}
      <div className="card mt-6 p-6" data-tour="howto-rate">
        <h2 className="text-xl">Precios y tasa</h2>
        <p className="mt-2 text-sm text-ink-soft">Los precios están en USD. El monto en bolívares es el equivalente con la tasa BCV registrada; la tasa aplicada queda guardada en tu operación.</p>
        <p className="mt-2">
          <RateNotice />
        </p>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/catalogo" className="btn-primary">
          Ir al catálogo
        </Link>
        <WhatsAppButton />
      </div>
    </div>
  );
}
