import { useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';
import { storeMapLinks } from '@porcelanas/shared';
import { useSettings } from '../hooks/data';

/**
 * Ubicación de la sede con botón «Cómo llegar» (Google Maps). El mapa incrustado se carga solo
 * cuando el visitante lo pide, porque Google Maps puede instalar sus propias cookies.
 */
export function StoreMap({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const { data } = useSettings();
  const [show, setShow] = useState(false);
  const store = data?.store;
  const links = store ? storeMapLinks(store) : null;
  if (!store || !links) return null;
  const address = [store.address, store.city].filter(Boolean).join(', ');
  return (
    <div className={`border border-stone-200 bg-white ${className}`} data-testid="store-map">
      <div className={compact ? 'p-4' : 'p-5 sm:p-6'}>
        <p className="eyebrow">Cómo llegar a la sede</p>
        <p className={`mt-2 flex gap-2 ${compact ? 'text-sm' : 'font-display text-xl font-light'}`}>
          <MapPin className="mt-1 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
          <span>{address}</span>
        </p>
        {store.hoursText && <p className="mt-1 pl-6 text-xs text-ink-muted">{store.hoursText}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={links.directionsUrl} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm" data-testid="directions-link">
            <Navigation className="h-4 w-4" aria-hidden /> Cómo llegar
          </a>
          {!show && (
            <button type="button" className="btn-outline btn-sm" onClick={() => setShow(true)}>
              Ver mapa
            </button>
          )}
        </div>
      </div>
      {show ? (
        <iframe
          title={`Mapa de la sede: ${address}`}
          src={links.embedUrl}
          className={`block w-full border-0 border-t border-stone-200 ${compact ? 'h-56' : 'h-72 sm:h-80'}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      ) : (
        <p className="border-t border-stone-100 px-5 py-2 text-[11px] text-ink-muted">El mapa se carga desde Google Maps al pulsar «Ver mapa»; Google puede usar sus propias cookies.</p>
      )}
    </div>
  );
}
