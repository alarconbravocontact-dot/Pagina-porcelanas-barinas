import { Link } from 'react-router-dom';
import type { Product } from '../lib/types';
import { FINISH_LABELS, formatUSD } from '../lib/format';

export function ProductImage({ product, className = '' }: { product: Pick<Product, 'images' | 'name' | 'color'>; className?: string }) {
  const img = product.images[0];
  if (!img) {
    return (
      <div className={`flex items-center justify-center bg-stone-100 text-[11px] uppercase tracking-gallery text-ink-muted ${className}`} role="img" aria-label={`${product.name} (sin fotografía)`}>
        Sin fotografía
      </div>
    );
  }
  return <img src={img.url} alt={img.alt || product.name} loading="lazy" className={`object-cover ${className}`} />;
}

const stockText = (p: Product) => (p.stockStatus === 'OUT' ? 'Agotado' : p.stockStatus === 'LOW' ? `Últimas ${p.availableBoxes} cajas` : 'Disponible');

/** Pieza expuesta como en una galería: la muestra sobre muro claro y una cartela debajo. */
export function ProductCard({ product }: { product: Product }) {
  return (
    <Link to={`/producto/${product.sku}`} className="group block">
      <div className="bg-stone-100 p-6 transition duration-500 group-hover:bg-stone-200/70 sm:p-8">
        <div className="relative aspect-square overflow-hidden shadow-gallery">
          <ProductImage product={product} className={`h-full w-full transition duration-700 group-hover:scale-[1.03] ${product.stockStatus === 'OUT' ? 'grayscale opacity-70' : ''}`} />
        </div>
      </div>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate font-display text-xl font-light leading-tight">{product.name}</h3>
          <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-ink-muted">
            {product.sizeLabel} cm · {FINISH_LABELS[product.finish]} · {product.sku}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm">
            {formatUSD(product.priceM2Cents)}
            <span className="text-ink-muted"> /m²</span>
          </p>
          <p className="text-[11px] text-ink-muted">{formatUSD(product.priceBoxCents)} caja</p>
        </div>
      </div>
      <p className={`mt-2 text-[10px] uppercase tracking-gallery ${product.stockStatus === 'OUT' ? 'text-[#7a3030]' : 'text-ink-muted'}`}>
        {stockText(product)}
        {product.isDemo && ' · Demostración'}
      </p>
    </Link>
  );
}
