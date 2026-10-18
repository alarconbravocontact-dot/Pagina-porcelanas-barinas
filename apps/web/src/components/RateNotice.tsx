import { useRate } from '../hooks/data';
import { formatRate, formatShortDate } from '../lib/format';

/** Muestra la tasa BCV registrada con su fuente y fecha; nunca afirma que está actualizada si no lo está. */
export function RateNotice({ compact = false }: { compact?: boolean }) {
  const { data, isLoading, isError } = useRate();
  if (isLoading) return <span className="text-xs text-ink-muted">Consultando tasa…</span>;
  if (isError) return <span className="text-xs text-red-700">No se pudo consultar la tasa</span>;
  const r = data?.rate;
  if (!r) return <span className="text-xs text-amber-800">Tasa BCV no registrada: los montos en Bs no están disponibles</span>;
  const source = r.source === 'BCV_AUTO' ? 'BCV (consulta automática)' : 'registro manual autorizado';
  return (
    <span className={`text-xs ${r.stale ? 'text-amber-800' : 'text-ink-muted'}`}>
      Tasa BCV: <strong className="font-semibold text-ink">Bs. {formatRate(r.rate)}</strong>
      {!compact && (
        <>
          {' '}
          · fecha valor {formatShortDate(r.effectiveDate)} · {source}
        </>
      )}
      {r.stale && ' · desactualizada'}
    </span>
  );
}
