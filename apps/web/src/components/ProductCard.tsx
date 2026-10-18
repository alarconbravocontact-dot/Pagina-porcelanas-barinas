import { Link } from 'react-router-dom';
import type { Product } from '../lib/types';
import { FINISH_LABELS, formatUSD } from '../lib/format';
import { StockBadge } from './StatusBadges';

export function ProductImage({ product, className = '' }: { product: Pick<Product, 'images' | 'name' | 'color'>; className?: string }) {
  const img = product.images[0];
  if (!img) {
    return (
      <div className={`flex items-center justify-center bg-stone-200 text-xs text-ink-muted ${className}`} role="img" aria-label={`${product.name} (sin fotografía)`}>
        Sin fotografía
      </div>
    );
  }
  return <img src={img.url} alt={img.alt || product.name} loading="lazy" className={`object-cover ${className}`} />;
}

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link to={`/producto/${product.sku}`} className="group card flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative aspect-square overflow-hidden">
        <ProductImage product={product} className="h-full w-full transition duration-500 group-hover:scale-105" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1">
          <StockBadge status={product.stockStatus} available={product.availableBoxes} />
          {product.isDemo && <span className="chip bg-ink/80 text-white">Demo</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">
          {product.sizeLabel} cm · {FINISH_LABELS[product.finish]}
        </p>
        <h3 className="mt-1 font-display text-lg leading-snug">{product.name}</h3>
        <p className="text-xs text-ink-muted">SKU {product.sku}</p>
        <div className="mt-auto flex items-end justify-between pt-4">
          <div>
            <p className="text-lg font-semibold">
              {formatUSD(product.priceM2Cents)}
              <span className="text-xs font-normal text-ink-muted"> /m²</span>
            </p>
            <p className="text-xs text-ink-muted">{formatUSD(product.priceBoxCents)} por caja</p>
          </div>
          <span className="text-xs font-medium text-brass group-hover:underline">Ver y calcular →</span>
        </div>
      </div>
    </Link>
  );
}
