import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { useSellers, useSettings } from '../hooks/data';
import { SellerContactCard } from '../components/SellerContact';
import { ErrorState, PageHeader, Spinner } from '../components/ui';
import { WhatsAppButton } from '../components/WhatsAppButton';

/** Ficha de contacto comercial: vendedores activos, sede y canales de atención. */
export function ContactPage() {
  const sellers = useSellers();
  const { data: settings } = useSettings();
  const store = settings?.store;
  return (
    <div className="container-page max-w-5xl py-12">
      <PageHeader title="Contacto comercial" subtitle="Asesoría, cotizaciones y seguimiento de tus operaciones." />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {sellers.isLoading && <Spinner />}
        {sellers.isError && <ErrorState error={sellers.error} onRetry={() => sellers.refetch()} />}
        {sellers.data?.map((s) => (
          <SellerContactCard key={s.id} seller={s} title="Vendedor" message="Hola, quisiera asesoría sobre porcelanatos." />
        ))}
        <div className="border border-stone-200 bg-stone-50 p-6">
          <p className="eyebrow">Sede</p>
          <p className="mt-2 font-display text-2xl font-light">{store?.name || 'Porcelanatos'}</p>
          <p className="mt-3 text-sm text-ink-soft">
            {[store?.address, store?.city].filter(Boolean).join(', ') || 'Dirección de la sede pendiente de publicación.'}
          </p>
          {store?.hoursText && (
            <p className="mt-1 text-sm text-ink-soft">
              Horario de atención: <span className="text-ink">{store.hoursText}</span>
            </p>
          )}
          {store?.mapUrl && (
            <a href={store.mapUrl} target="_blank" rel="noopener noreferrer" className="btn-outline mt-4">
              Cómo llegar
            </a>
          )}
        </div>
      </div>
      <section className="mt-12 grid grid-cols-1 gap-6 border-t border-stone-200 pt-10 md:grid-cols-2">
        <div>
          <h2 className="text-2xl">WhatsApp</h2>
          <p className="mt-2 text-sm text-ink-soft">Para consultas rápidas antes de comprar: disponibilidad, cantidades o dudas sobre un producto. Los mensajes llevan el contexto de lo que estás viendo.</p>
          <div className="mt-4">
            <WhatsAppButton />
          </div>
        </div>
        <div>
          <h2 className="text-2xl">Chat interno</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Para el seguimiento de tus compras y reservas: queda guardado en tu cuenta, ligado a la operación, y lo puedes consultar desde cualquier dispositivo.
          </p>
          <Link to="/cuenta/chat" className="btn-outline mt-4">
            <MessageSquare className="h-4 w-4" aria-hidden /> Ir a mis mensajes
          </Link>
        </div>
      </section>
    </div>
  );
}
