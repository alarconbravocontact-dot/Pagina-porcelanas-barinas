import { legalDocuments, type LegalDocument } from '@porcelanas/shared';
import { useSettings, useSellers } from '../hooks/data';
import { PageHeader, Spinner } from '../components/ui';
import type { PublicSettings } from '../lib/types';

function Text({ value, empty }: { value?: string; empty: string }) {
  return value ? <p className="whitespace-pre-line text-sm text-ink-soft">{value}</p> : <p className="text-sm italic text-ink-muted">{empty}</p>;
}

const OVERRIDE: Record<LegalDocument['id'], keyof PublicSettings['policies']> = {
  terminos: 'legalTermsText',
  privacidad: 'legalPrivacyText',
  cookies: 'legalCookiesText',
  asistente: 'legalAiText',
};

/** Documentos legales con los datos reales de la tienda; un texto escrito por la administración reemplaza al predeterminado. */
export function useLegalDocuments() {
  const { data } = useSettings();
  const sellers = useSellers();
  if (!data) return null;
  const seller = sellers.data?.find((s) => s.whatsapp || s.publicEmail);
  const contact =
    [data.store.email, data.store.phone].filter(Boolean).join(' o ') ||
    (seller ? `su vendedor (${seller.displayName}${seller.publicEmail ? `, ${seller.publicEmail}` : ''})` : '');
  const docs = legalDocuments({
    storeName: data.store.name,
    city: data.store.city,
    hoursText: data.store.hoursText,
    contact,
    assistantProvider: data.legal?.assistantProvider ?? 'local',
    customerSessionDays: data.legal?.customerSessionDays ?? 180,
    staffSessionHours: data.legal?.staffSessionHours ?? 168,
  });
  return docs.map((d) => ({ ...d, override: (data.policies[OVERRIDE[d.id]] as string | undefined) || '' }));
}

function LegalDoc({ doc }: { doc: LegalDocument & { override: string } }) {
  return (
    <section id={doc.id} className="card mt-6 scroll-mt-24 p-6 sm:p-8" aria-labelledby={`h-${doc.id}`}>
      <h2 id={`h-${doc.id}`} className="text-2xl">
        {doc.title}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">{doc.summary}</p>
      {doc.override ? (
        <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{doc.override}</p>
      ) : (
        <div className="mt-5 space-y-5">
          {doc.sections.map((s) => (
            <div key={s.heading}>
              <h3 className="text-[11px] font-normal uppercase tracking-[0.16em] text-ink">{s.heading}</h3>
              {s.paragraphs?.map((p) => (
                <p key={p} className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {p}
                </p>
              ))}
              {s.bullets && (
                <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink-soft">
                  {s.bullets.map((b) => (
                    <li key={b} className="flex gap-2">
                      <span aria-hidden>—</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function PoliciesPage() {
  const { data, isLoading } = useSettings();
  const docs = useLegalDocuments();
  if (isLoading || !data || !docs) return <Spinner />;
  const { reservation: r, cancellation: c, pickup: p, quote } = data;
  const index = [...docs.map((d) => ({ id: d.id, title: d.title })), { id: 'condiciones', title: 'Condiciones comerciales' }, { id: 'cancelaciones', title: 'Cancelaciones y devoluciones' }];
  return (
    <div className="container-page max-w-3xl py-10">
      <PageHeader title="Términos y políticas" subtitle="Cómo funciona el portal, qué datos usamos, las cookies, el asistente de IA y las condiciones comerciales." />
      <nav aria-label="Documentos" className="flex flex-wrap gap-2">
        {index.map((i) => (
          <a key={i.id} href={`#${i.id}`} className="border border-stone-300 px-3 py-1.5 text-xs text-ink-soft transition hover:border-ink hover:text-ink">
            {i.title}
          </a>
        ))}
      </nav>
      {docs.map((d) => (
        <LegalDoc key={d.id} doc={d} />
      ))}
      <section id="condiciones" className="card mt-6 scroll-mt-24 p-6 sm:p-8">
        <h2 className="text-2xl">Condiciones comerciales</h2>
        <p className="mt-1 text-sm text-ink-muted">Condiciones vigentes aplicadas por el sistema. Cada orden conserva las que se aceptaron al confirmarla.</p>
        <ul className="mt-4 space-y-2 text-sm text-ink-soft">
          <li>• Los precios se expresan en USD; el equivalente en Bs usa la tasa BCV registrada y queda fijado en la operación.</li>
          <li>• Las cotizaciones son válidas por {quote.validityMinutes} minutos. Si los precios cambian, se solicitará confirmar los nuevos importes.</li>
          <li>• Se venden cajas completas; la cantidad en m² se redondea a la caja superior.</li>
          <li>• La mercancía se aparta por {r.holdHours} horas hasta acreditar el pago requerido{r.extendWhilePaymentPending ? ' (se mantiene mientras haya un pago en verificación)' : ''}.</li>
          <li>• Prepago mínimo para reservas: {r.prepayMinPercent}% del total.</li>
          <li>• Anticipación mínima para el retiro: {p.minAdvanceHours} horas. Tolerancia posterior a la fecha de retiro: {r.pickupGraceDays} días.</li>
          <li>• Es obligatorio seleccionar un vendedor activo para confirmar la operación.</li>
        </ul>
        {data.policies.termsText && (
          <div className="mt-4">
            <Text value={data.policies.termsText} empty="" />
          </div>
        )}
      </section>
      <section id="cancelaciones" className="card mt-6 scroll-mt-24 p-6 sm:p-8">
        <h2 className="text-2xl">Cancelaciones y devoluciones</h2>
        <ul className="mt-4 space-y-2 text-sm text-ink-soft">
          <li>• Puede cancelar en línea operaciones sin pagos acreditados con al menos {c.customerCancelMinHours} horas de anticipación al retiro.</li>
          <li>• Con pagos acreditados, la cancelación se gestiona con su vendedor según la política de reembolsos.</li>
          <li>• Cambios de fecha: hasta {c.maxReschedules} por operación, con al menos {c.rescheduleMinHours} horas de anticipación y sujetos a disponibilidad.</li>
        </ul>
        <div className="mt-4">
          <Text value={c.policyText} empty="La tienda aún no ha publicado su política de cancelación detallada." />
        </div>
        <h3 className="mt-6 text-lg">Devoluciones</h3>
        <Text value={data.policies.returnsText} empty="La tienda aún no ha publicado su política de devoluciones." />
        {data.policies.privacyText && (
          <>
            <h3 className="mt-6 text-lg">Aviso adicional de privacidad</h3>
            <Text value={data.policies.privacyText} empty="" />
          </>
        )}
      </section>
    </div>
  );
}
