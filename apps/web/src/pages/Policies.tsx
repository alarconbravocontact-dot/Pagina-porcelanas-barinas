import { useSettings } from '../hooks/data';
import { PageHeader, Spinner } from '../components/ui';

function Text({ value, empty }: { value?: string; empty: string }) {
  return value ? <p className="whitespace-pre-line text-sm text-ink-soft">{value}</p> : <p className="text-sm italic text-ink-muted">{empty}</p>;
}

export function PoliciesPage() {
  const { data, isLoading } = useSettings();
  if (isLoading || !data) return <Spinner />;
  const { reservation: r, cancellation: c, pickup: p, quote } = data;
  return (
    <div className="container-page max-w-3xl py-10">
      <PageHeader title="Políticas comerciales" subtitle="Condiciones vigentes aplicadas por el sistema. Cada operación conserva las condiciones aceptadas al confirmarla." />
      <section id="condiciones" className="card scroll-mt-24 p-6">
        <h2 className="text-xl">Condiciones de compra</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink-soft">
          <li>• Los precios se expresan en USD; el equivalente en Bs usa la tasa BCV registrada y queda fijado en la operación.</li>
          <li>• Las cotizaciones son válidas por {quote.validityMinutes} minutos. Si los precios cambian, se solicitará confirmar los nuevos importes.</li>
          <li>• Se venden cajas completas; la cantidad en m² se redondea a la caja superior.</li>
          <li>• La mercancía se aparta por {r.holdHours} horas hasta acreditar el pago requerido{r.extendWhilePaymentPending ? ' (se mantiene mientras haya un pago en verificación)' : ''}.</li>
          <li>• Prepago mínimo para reservas: {r.prepayMinPercent}% del total.</li>
          <li>• Anticipación mínima para el retiro: {p.minAdvanceHours} horas. Tolerancia posterior a la fecha de retiro: {r.pickupGraceDays} días.</li>
          <li>• Es obligatorio seleccionar un vendedor activo para confirmar la operación.</li>
        </ul>
        <div className="mt-4">
          <Text value={data.policies.termsText} empty="La tienda aún no ha publicado condiciones adicionales." />
        </div>
      </section>
      <section id="cancelaciones" className="card mt-6 scroll-mt-24 p-6">
        <h2 className="text-xl">Cancelaciones y cambios de fecha</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink-soft">
          <li>• Puede cancelar en línea operaciones sin pagos acreditados con al menos {c.customerCancelMinHours} horas de anticipación al retiro.</li>
          <li>• Con pagos acreditados, la cancelación se gestiona con su vendedor según la política de reembolsos.</li>
          <li>
            • Cambios de fecha: hasta {c.maxReschedules} por operación, con al menos {c.rescheduleMinHours} horas de anticipación y sujetos a disponibilidad.
          </li>
        </ul>
        <div className="mt-4">
          <Text value={c.policyText} empty="La tienda aún no ha publicado su política de cancelación detallada." />
        </div>
        <h3 className="mt-6 text-lg">Devoluciones</h3>
        <Text value={data.policies.returnsText} empty="La tienda aún no ha publicado su política de devoluciones." />
      </section>
      <section id="privacidad" className="card mt-6 scroll-mt-24 p-6">
        <h2 className="text-xl">Privacidad</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Solicitamos únicamente los datos necesarios para gestionar su operación (nombre, correo y teléfono). Los comprobantes de pago se almacenan de forma privada y solo los ven usted y el
          personal autorizado.
        </p>
        <div className="mt-3">
          <Text value={data.policies.privacyText} empty="" />
        </div>
      </section>
    </div>
  );
}
