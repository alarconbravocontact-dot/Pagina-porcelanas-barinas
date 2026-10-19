import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useCart, useCartMutations } from '../hooks/data';
import { errorMessage } from '../lib/api';
import { formatM2, formatRate, formatUSD, formatVES } from '../lib/format';
import { Alert, EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui';
import { WhatsAppButton } from '../components/WhatsAppButton';
import type { CartView } from '../lib/types';

export function CartPage() {
  const cart = useCart();
  const { update, remove } = useCartMutations();
  if (cart.isLoading) return <Spinner label="Cargando carrito…" />;
  if (cart.isError) return <ErrorState error={cart.error} onRetry={() => cart.refetch()} />;
  const data = cart.data!;
  const quote = data.quote;
  const mutError = update.error ?? remove.error;
  return (
    <div className="container-page py-8">
      <PageHeader title="Carrito" subtitle="Los importes se recalculan en el servidor con los precios vigentes." />
      {data.items.length === 0 ? (
        <EmptyState title="Tu carrito está vacío" action={<Link to="/catalogo" className="btn-primary">Explorar catálogo</Link>}>
          Agrega productos desde la ficha de cada porcelanato usando la calculadora.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            {mutError && <Alert kind="error">{errorMessage(mutError)}</Alert>}
            {data.items.map((item) => (
              <CartRow key={item.id} item={item} busy={update.isPending || remove.isPending} onUpdate={(mode, quantity) => update.mutate({ id: item.id, mode, quantity })} onRemove={() => remove.mutate(item.id)} />
            ))}
          </div>
          {quote && (
            <aside className="card h-fit p-5 lg:sticky lg:top-24">
              <h2 className="text-lg">Resumen</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Cajas</dt>
                  <dd>{quote.totalBoxes}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Superficie</dt>
                  <dd>{formatM2(quote.totalAreaUnits)}</dd>
                </div>
                <div className="flex justify-between border-t border-stone-100 pt-2 text-base">
                  <dt className="font-medium">Pagando en divisas</dt>
                  <dd className="font-semibold">{formatUSD(quote.subtotalCents)}</dd>
                </div>
                {quote.subtotalBcvCents !== quote.subtotalCents && (
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">Precio BCV (pago en Bs)</dt>
                    <dd>{formatUSD(quote.subtotalBcvCents)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Tasa BCV</dt>
                  <dd>{quote.rate ? `Bs. ${formatRate(quote.rate.rate)}` : 'No registrada'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Pagando en bolívares</dt>
                  <dd>{quote.totalVesCents != null ? formatVES(quote.totalVesCents) : '—'}</dd>
                </div>
              </dl>
              {!quote.valid && <Alert kind="warning" className="mt-4">Corrige los artículos marcados antes de continuar.</Alert>}
              {quote.rate?.stale && <Alert kind="warning" className="mt-4">La tasa registrada está desactualizada.</Alert>}
              <Link to="/checkout" className={`btn-primary mt-5 w-full py-3 ${!quote.valid ? 'pointer-events-none opacity-50' : ''}`} aria-disabled={!quote.valid}>
                Continuar con la compra
              </Link>
              <div className="mt-3 flex justify-center">
                <WhatsAppButton message={cartMessage(data)} label="Consultar este pedido" />
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

function cartMessage(cart: CartView) {
  const lines = cart.items.map((i) => `• ${i.line.name} (${i.line.sku}): ${i.line.boxes} cajas`).join('\n');
  return `Hola, quisiera consultar este pedido:\n${lines}\nTotal en divisas: ${formatUSD(cart.quote?.subtotalCents ?? 0)}`;
}

function CartRow({ item, onUpdate, onRemove, busy }: { item: CartView['items'][number]; onUpdate: (mode: 'BOXES' | 'M2', q: string) => void; onRemove: () => void; busy: boolean }) {
  const l = item.line;
  const [m2, setM2] = useState(item.mode === 'M2' ? item.quantity : '');
  return (
    <div className={`card flex gap-4 p-4 ${l.error ? 'border-amber-300' : ''}`}>
      {l.imageUrl ? <img src={l.imageUrl} alt="" className="h-24 w-24 shrink-0 rounded-none object-cover" /> : <div className="h-24 w-24 shrink-0 rounded-none bg-stone-200" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link to={`/producto/${l.sku}`} className="font-medium hover:underline">
              {l.name}
            </Link>
            <p className="text-xs text-ink-muted">
              SKU {l.sku} · {l.sizeLabel} cm · {formatUSD(l.priceM2Cents)}/m² · {formatUSD(l.priceBoxCents)}/caja
            </p>
          </div>
          <button type="button" className="btn-ghost px-2 text-red-700" onClick={onRemove} disabled={busy} aria-label={`Quitar ${l.name}`}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {item.mode === 'BOXES' ? (
            <div className="flex items-center rounded-none border border-stone-300">
              <button type="button" className="px-2 py-1.5" disabled={busy || l.boxes <= 1} onClick={() => onUpdate('BOXES', String(l.boxes - 1))} aria-label="Restar una caja">
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[3rem] text-center text-sm">{item.quantity} cajas</span>
              <button type="button" className="px-2 py-1.5" disabled={busy} onClick={() => onUpdate('BOXES', String(Number(item.quantity) + 1))} aria-label="Sumar una caja">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onUpdate('M2', m2.replace(',', '.'));
              }}
            >
              <input className="input w-24" value={m2} onChange={(e) => setM2(e.target.value)} inputMode="decimal" aria-label="Metros cuadrados" />
              <span className="text-sm text-ink-muted">m²</span>
              <button type="submit" className="btn-outline btn-sm" disabled={busy}>
                Actualizar
              </button>
            </form>
          )}
          <p className="text-sm text-ink-muted">
            {l.boxes} cajas = {formatM2(l.areaUnits)}
          </p>
          <p className="ml-auto font-semibold">{formatUSD(l.lineTotalCents)}</p>
        </div>
        {l.error && <p className="mt-2 text-sm font-medium text-amber-800">{l.error}</p>}
      </div>
    </div>
  );
}
