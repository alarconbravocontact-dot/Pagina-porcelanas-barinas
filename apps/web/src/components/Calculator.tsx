import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calculator as CalcIcon, Check, ShoppingBag } from 'lucide-react';
import { computeLine, PricingError, usdCentsToVesCents, type QuantityMode } from '@porcelanas/shared';
import { useCartMutations, useRate } from '../hooks/data';
import { errorMessage } from '../lib/api';
import { formatM2, formatRate, formatUSD, formatVES } from '../lib/format';
import type { Product } from '../lib/types';
import { Alert } from './ui';

/**
 * Calculadora por cajas o m². La vista previa es inmediata; el servidor recalcula
 * y valida todos los importes al agregar al carrito y al confirmar la compra.
 */
export function Calculator({ product }: { product: Product }) {
  const [mode, setMode] = useState<QuantityMode>('M2');
  const [quantity, setQuantity] = useState('');
  const { data: rateData } = useRate();
  const { add } = useCartMutations();
  const [added, setAdded] = useState(false);
  const rate = rateData?.rate ?? null;

  const preview = useMemo(() => {
    if (!quantity.trim()) return { line: null, error: null };
    try {
      const line = computeLine({ mode, quantity: quantity.replace(',', '.'), boxAreaUnits: product.boxAreaUnits, priceBoxCents: product.priceBoxCents });
      return { line, error: null };
    } catch (e) {
      return { line: null, error: e instanceof PricingError ? e.message : 'Cantidad inválida' };
    }
  }, [mode, quantity, product.boxAreaUnits, product.priceBoxCents]);

  const line = preview.line;
  const overStock = line ? line.boxes > product.availableBoxes : false;
  const out = product.availableBoxes <= 0;

  const submit = () => {
    if (!line) return;
    setAdded(false);
    add.mutate(
      { productId: product.id, mode, quantity: quantity.replace(',', '.') },
      { onSuccess: () => setAdded(true) },
    );
  };

  return (
    <section className="card p-6 sm:p-8" aria-labelledby="calc-title">
      <div className="flex items-center gap-2">
        <CalcIcon className="h-4 w-4 text-ink-muted" aria-hidden />
        <h2 id="calc-title" className="text-2xl">
          Calcula tu compra
        </h2>
      </div>
      <div className="mt-5 inline-flex border border-stone-300" role="radiogroup" aria-label="Unidad de compra">
        {(['M2', 'BOXES'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            className={`px-4 py-2 text-[11px] uppercase tracking-[0.14em] ${mode === m ? 'bg-ink text-white' : 'text-ink-soft hover:bg-stone-100'}`}
            onClick={() => {
              setMode(m);
              setQuantity('');
              setAdded(false);
            }}
          >
            {m === 'M2' ? 'Metros cuadrados' : 'Cajas'}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <label htmlFor="calc-qty" className="label">
          {mode === 'M2' ? 'Superficie a cubrir (m²)' : 'Cantidad de cajas'}
        </label>
        <input
          id="calc-qty"
          className="input text-base"
          inputMode={mode === 'M2' ? 'decimal' : 'numeric'}
          placeholder={mode === 'M2' ? 'Ej.: 30' : 'Ej.: 10'}
          value={quantity}
          onChange={(e) => {
            setQuantity(e.target.value);
            setAdded(false);
          }}
        />
        <p className="mt-1 text-xs text-ink-muted">
          Cada caja contiene {product.piecesPerBox} piezas y cubre {product.boxAreaM2.replace('.', ',')} m². Se venden cajas completas.
        </p>
        {preview.error && <p className="mt-1 text-xs font-medium text-red-700">{preview.error}</p>}
      </div>

      {line && (
        <dl className="mt-5 divide-y divide-stone-200 border-y border-stone-200 text-sm">
          <Row label="Cantidad solicitada" value={mode === 'M2' ? formatM2(line.requestedAreaUnits!) : `${line.requestedBoxes} cajas`} />
          <Row label="Cajas necesarias" value={<strong>{line.boxes}</strong>} />
          <Row label="Metros cuadrados efectivos" value={formatM2(line.areaUnits)} />
          <Row label="Precio unitario" value={`${formatUSD(line.priceBoxCents)} / caja · ${formatUSD(line.priceM2Cents)} / m²`} />
          <Row label="Subtotal" value={<strong className="text-base">{formatUSD(line.lineTotalCents)}</strong>} />
          <Row label="Tasa BCV aplicada" value={rate ? `Bs. ${formatRate(rate.rate)}` : 'No registrada'} />
          <Row label="Total equivalente" value={rate ? formatVES(usdCentsToVesCents(line.lineTotalCents, rate.rate)) : '—'} />
        </dl>
      )}
      {rate?.stale && <p className="mt-2 text-xs text-amber-800">La tasa registrada está desactualizada; el monto en Bs es referencial.</p>}
      {overStock && !out && (
        <Alert kind="warning" className="mt-3">
          Solo hay {product.availableBoxes} cajas disponibles para reservar.
        </Alert>
      )}
      {add.isError && (
        <Alert kind="error" className="mt-3">
          {errorMessage(add.error)}
        </Alert>
      )}
      {added && (
        <Alert kind="success" className="mt-3">
          Agregado al carrito con importes verificados por el servidor. <Link to="/carrito" className="font-semibold underline">Ver carrito</Link>
        </Alert>
      )}
      <button type="button" className="btn-primary mt-4 w-full py-3" disabled={!line || overStock || out || add.isPending} onClick={submit}>
        {added ? <Check className="h-4 w-4" aria-hidden /> : <ShoppingBag className="h-4 w-4" aria-hidden />}
        {out ? 'Agotado' : add.isPending ? 'Agregando…' : 'Agregar al carrito'}
      </button>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
