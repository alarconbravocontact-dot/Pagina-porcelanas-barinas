import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { Product } from '../lib/types';
import { ANTISLIP_LABELS, FINISH_LABELS, formatUSD } from '../lib/format';
import { Calculator } from '../components/Calculator';
import { StockBadge } from '../components/StatusBadges';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { ErrorState, Spinner } from '../components/ui';
import { NotFoundPage } from './NotFound';
import { ProductImage } from '../components/ProductCard';

export function ProductDetailPage() {
  const { sku = '' } = useParams();
  const q = useQuery({ queryKey: ['product', sku], queryFn: () => api<Product>(`/api/products/${encodeURIComponent(sku)}`), retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2 });
  const [active, setActive] = useState(0);
  if (q.isLoading) return <Spinner label="Cargando producto…" />;
  if (q.error instanceof ApiError && q.error.status === 404) return <NotFoundPage />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const p = q.data!;
  const img = p.images[active] ?? p.images[0];
  const specs: [string, string][] = [
    ['SKU', p.sku],
    ['Color', p.color],
    ['Formato', `${p.sizeLabel} cm`],
    ...(p.thicknessMm ? ([['Espesor', `${String(p.thicknessMm).replace('.', ',')} mm`]] as [string, string][]) : []),
    ['Piezas por caja', String(p.piecesPerBox)],
    ['m² por caja', p.boxAreaM2.replace('.', ',')],
    ['Acabado', FINISH_LABELS[p.finish]],
    ['Antideslizante', ANTISLIP_LABELS[p.antiSlip]],
    ['Ambientes', p.categories.map((c) => c.name).join(', ')],
  ];
  return (
    <div className="container-page py-8">
      <Link to="/catalogo" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Volver al catálogo
      </Link>
      <div className="mt-4 grid gap-10 lg:grid-cols-2">
        <div>
          <div className="card overflow-hidden">
            {img ? <img src={img.url} alt={img.alt} className="aspect-square w-full object-cover" /> : <ProductImage product={p} className="aspect-square w-full" />}
          </div>
          {p.images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {p.images.map((im, i) => (
                <button key={im.id} type="button" onClick={() => setActive(i)} className={`h-20 w-20 shrink-0 overflow-hidden rounded border-2 ${i === active ? 'border-ink' : 'border-transparent'}`} aria-label={`Ver imagen ${i + 1}`}>
                  <img src={im.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StockBadge status={p.stockStatus} available={p.availableBoxes} />
            {p.isDemo && <span className="chip bg-ink text-white">Producto de demostración</span>}
          </div>
          <h1 className="mt-3 text-3xl sm:text-4xl">{p.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">SKU {p.sku}</p>
          <div className="mt-5 flex items-baseline gap-4">
            <p className="text-3xl font-semibold">
              {formatUSD(p.priceM2Cents)}
              <span className="text-base font-normal text-ink-muted"> /m²</span>
            </p>
            <p className="text-ink-muted">{formatUSD(p.priceBoxCents)} por caja</p>
          </div>
          <p className="mt-1 text-xs text-ink-muted">{p.availableBoxes > 0 ? `${p.availableBoxes} cajas disponibles para reservar` : 'Sin existencias disponibles en este momento'}</p>
          {p.description && <p className="mt-5 whitespace-pre-line text-ink-soft">{p.description}</p>}
          <div className="mt-6">
            <Calculator product={p} />
          </div>
          <div className="mt-4">
            <WhatsAppButton message={`Hola, quisiera información sobre ${p.name} (SKU ${p.sku}).`} />
          </div>
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-stone-200 pt-6 text-sm">
            {specs.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs uppercase tracking-wide text-ink-muted">{k}</dt>
                <dd className="mt-0.5">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
