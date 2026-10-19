import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SlidersHorizontal, X } from 'lucide-react';
import { ANTISLIP, ANTISLIP_LABELS, FINISHES } from '@porcelanas/shared';
import { api } from '../lib/api';
import type { Paged, Product } from '../lib/types';
import { FINISH_LABELS } from '../lib/format';
import { ProductCard } from '../components/ProductCard';
import { EmptyState, ErrorState, Pagination, Spinner } from '../components/ui';
import { RateNotice } from '../components/RateNotice';

interface Facets {
  colors: { value: string; count: number }[];
  sizes: { value: string; count: number }[];
  categories: { id: string; name: string; slug: string; count: number }[];
}

const FILTER_KEYS = ['q', 'category', 'color', 'size', 'finish', 'antiSlip', 'minPrice', 'maxPrice', 'available', 'sort', 'page'] as const;

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const query = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = params.get(k);
    if (v) query.set(k, v);
  }
  query.set('pageSize', '12');
  const qs = query.toString();
  const list = useQuery({ queryKey: ['catalog', qs], queryFn: () => api<Paged<Product>>(`/api/catalog?${qs}`), placeholderData: keepPreviousData });
  const facets = useQuery({ queryKey: ['facets'], queryFn: () => api<Facets>('/api/catalog/facets') });

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: key !== 'page' });
  };
  const activeCount = FILTER_KEYS.filter((k) => !['q', 'sort', 'page'].includes(k) && params.get(k)).length;

  const [minP, setMinP] = useState(params.get('minPrice') ?? '');
  const [maxP, setMaxP] = useState(params.get('maxPrice') ?? '');
  const applyPrice = (e: FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(params);
    const clean = (v: string) => v.trim().replace(',', '.');
    for (const [k, v] of [['minPrice', clean(minP)], ['maxPrice', clean(maxP)]] as const) {
      if (v && /^\d+(\.\d{1,2})?$/.test(v)) next.set(k, v);
      else next.delete(k);
    }
    next.delete('page');
    setParams(next);
  };

  const filters = (
    <div className="space-y-6">
      <FilterGroup title="Ambiente">
        <Select value={params.get('category')} onChange={(v) => set('category', v)} options={(facets.data?.categories ?? []).map((c) => ({ value: c.slug, label: `${c.name} (${c.count})` }))} />
      </FilterGroup>
      <FilterGroup title="Color">
        <div className="flex flex-wrap gap-2">
          {facets.data?.colors.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={params.get('color') === c.value}
              onClick={() => set('color', params.get('color') === c.value ? null : c.value)}
              className={`chip border px-3 py-1 ${params.get('color') === c.value ? 'border-ink bg-ink text-white' : 'border-stone-300 bg-white text-ink-soft hover:border-ink'}`}
            >
              {c.value} <span className="ml-1 opacity-60">{c.count}</span>
            </button>
          ))}
        </div>
      </FilterGroup>
      <FilterGroup title="Tamaño (cm)">
        <Select value={params.get('size')} onChange={(v) => set('size', v)} options={(facets.data?.sizes ?? []).map((s) => ({ value: s.value, label: `${s.value} (${s.count})` }))} />
      </FilterGroup>
      <FilterGroup title="Acabado">
        <Select value={params.get('finish')} onChange={(v) => set('finish', v)} options={FINISHES.map((f) => ({ value: f, label: FINISH_LABELS[f] }))} />
      </FilterGroup>
      <FilterGroup title="Antideslizante">
        <Select value={params.get('antiSlip')} onChange={(v) => set('antiSlip', v)} options={ANTISLIP.map((a) => ({ value: a, label: ANTISLIP_LABELS[a] }))} />
      </FilterGroup>
      <FilterGroup title="Precio por m² (USD)">
        <form onSubmit={applyPrice} className="flex items-center gap-2">
          <input className="input" inputMode="decimal" placeholder="Mín." aria-label="Precio mínimo" value={minP} onChange={(e) => setMinP(e.target.value)} />
          <span className="text-ink-muted">–</span>
          <input className="input" inputMode="decimal" placeholder="Máx." aria-label="Precio máximo" value={maxP} onChange={(e) => setMaxP(e.target.value)} />
          <button type="submit" className="btn-outline btn-sm">
            Aplicar
          </button>
        </form>
      </FilterGroup>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 rounded-none border-stone-300" checked={params.get('available') === 'true'} onChange={(e) => set('available', e.target.checked ? 'true' : null)} />
        Solo con existencias disponibles
      </label>
      {activeCount > 0 && (
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => {
            setMinP('');
            setMaxP('');
            setParams(params.get('q') ? { q: params.get('q')! } : {});
          }}
        >
          <X className="h-4 w-4" aria-hidden /> Limpiar filtros
        </button>
      )}
    </div>
  );

  return (
    <div className="container-page py-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Galería</p>
          <h1 className="mt-3 text-4xl sm:text-5xl">Catálogo</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {params.get('q') ? (
              <>
                Resultados para “{params.get('q')}” ·{' '}
                <button type="button" className="text-ink underline" onClick={() => set('q', null)}>
                  quitar búsqueda
                </button>
              </>
            ) : (
              <RateNotice />
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-outline lg:hidden" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filtros {activeCount > 0 && `(${activeCount})`}
          </button>
          <label htmlFor="sort" className="sr-only">
            Ordenar
          </label>
          <select id="sort" className="input w-auto" value={params.get('sort') ?? 'newest'} onChange={(e) => set('sort', e.target.value === 'newest' ? null : e.target.value)}>
            <option value="newest">Más recientes</option>
            <option value="price_asc">Precio: menor a mayor</option>
            <option value="price_desc">Precio: mayor a menor</option>
            <option value="name">Nombre</option>
          </select>
        </div>
      </div>
      <div className="mt-10 grid gap-10 lg:grid-cols-[240px_1fr]">
        <aside className={`${showFilters ? 'block' : 'hidden'} h-fit border-b border-stone-200 pb-6 lg:block lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8`} aria-label="Filtros">
          {facets.isError ? <p className="text-sm text-red-700">No se pudieron cargar los filtros.</p> : filters}
        </aside>
        <div>
          {list.isLoading && <Spinner label="Cargando productos…" />}
          {list.isError && <ErrorState error={list.error} onRetry={() => list.refetch()} />}
          {list.data && (
            <>
              <p className="mb-4 text-sm text-ink-muted" aria-live="polite">
                {list.data.total} {list.data.total === 1 ? 'producto' : 'productos'}
                {list.isFetching && ' · actualizando…'}
              </p>
              {list.data.items.length === 0 ? (
                <EmptyState title="No encontramos productos con esos filtros">Prueba con otros criterios o limpia los filtros.</EmptyState>
              ) : (
                <div className="grid gap-x-8 gap-y-14 sm:grid-cols-2 xl:grid-cols-3">
                  {list.data.items.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              )}
              <Pagination page={list.data.page} totalPages={list.data.totalPages} onPage={(p) => set('page', String(p))} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">{title}</legend>
      {children}
    </fieldset>
  );
}

function Select({ value, onChange, options }: { value: string | null; onChange: (v: string | null) => void; options: { value: string; label: string }[] }) {
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Todos</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
