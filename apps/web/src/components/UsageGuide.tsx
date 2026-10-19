import { Check, TriangleAlert, X } from 'lucide-react';
import { SLIP_RATING_DESCRIPTIONS, SLIP_RATING_LABELS, USAGE_AREAS, USAGE_AREA_LABELS, USAGE_LEVEL_LABELS, type SlipRating, type UsageLevel } from '@porcelanas/shared';

const ICON: Record<UsageLevel, JSX.Element> = {
  YES: <Check className="h-4 w-4 text-[#3f5546]" aria-hidden />,
  CAUTION: <TriangleAlert className="h-4 w-4 text-[#6b5a2e]" aria-hidden />,
  NO: <X className="h-4 w-4 text-[#7a3030]" aria-hidden />,
};

export function SlipBadge({ rating }: { rating: SlipRating | null }) {
  if (!rating) return <span className="chip border border-stone-300 text-ink-muted">Agarre sin clasificar</span>;
  const tone = rating === 'SLIPPERY' ? 'border-[#e8d6d6] text-[#7a3030]' : rating === 'MEDIUM_LOW' ? 'border-[#e6dfcf] text-[#6b5a2e]' : 'border-[#d5ded8] text-[#3f5546]';
  return <span className={`chip border bg-white ${tone}`}>{SLIP_RATING_LABELS[rating]}</span>;
}

/** Guía de dónde instalar cada pieza, tomada del catálogo. */
export function UsageGuide({ guide, rating, note }: { guide: Record<string, UsageLevel> | null; rating: SlipRating | null; note?: string }) {
  if (!guide) return null;
  return (
    <section aria-labelledby="uso-title" className="border-t border-stone-200 pt-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="uso-title" className="text-2xl">
          Dónde instalarlo
        </h2>
        <SlipBadge rating={rating} />
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        {rating ? SLIP_RATING_DESCRIPTIONS[rating] : 'El catálogo no indica su clase de agarre: verifica la ficha técnica antes de usarlo en baño o cocina.'}
        {note && <span className="block text-xs text-ink-muted">{note}</span>}
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-px border border-stone-200 bg-stone-200 sm:grid-cols-3">
        {USAGE_AREAS.map((a) => (
          <li key={a} className="flex items-center gap-2 bg-white px-3 py-2.5 text-sm" title={USAGE_LEVEL_LABELS[guide[a]!]}>
            {ICON[guide[a]!]}
            <span>{USAGE_AREA_LABELS[a]}</span>
            <span className="sr-only">: {USAGE_LEVEL_LABELS[guide[a]!]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
        <span className="inline-flex items-center gap-1">{ICON.YES} Recomendado</span>
        <span className="inline-flex items-center gap-1">{ICON.CAUTION} Con precaución o confirmar ficha</span>
        <span className="inline-flex items-center gap-1">{ICON.NO} No recomendado</span>
      </p>
    </section>
  );
}
