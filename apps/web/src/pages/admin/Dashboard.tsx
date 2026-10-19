import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatM2, formatShortDate, formatUSD, formatVES, ORDER_STATUS_LABELS } from '../../lib/format';
import { ErrorState, PageHeader, Spinner, Stat } from '../../components/ui';
import { RateNotice } from '../../components/RateNotice';
import type { OrderStatus } from '@porcelanas/shared';

interface Dashboard {
  range: { from: string; to: string; timezone: string };
  totals: { salesUsdCents: number; orders: number; areaUnitsSold: number };
  dailySales: { day: string; orders: number; totalCents: number; areaUnits: number }[];
  salesBySeller: { sellerId: string; name: string; orders: number; totalCents: number; areaUnits: number }[];
  collectedByCurrency: { currency: 'USD' | 'VES'; payments: number; amountCents: number; creditUsdCents: number }[];
  pendingPayments: number;
  pendingPaymentOrders: number;
  pendingDelivery: number;
  upcomingPickups: { id: string; code: string; pickupDate: string; status: OrderStatus; totalBoxes: number; contactName: string; seller: { displayName: string } }[];
  lowStock: { id: string; sku: string; name: string; available: number; threshold: number }[];
}

export function AdminDashboard() {
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const q = useQuery({ queryKey: ['dashboard', range], queryFn: () => api<Dashboard>(`/api/admin/reports/dashboard?${new URLSearchParams(range as Record<string, string>)}`) });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const max = Math.max(1, ...d.dailySales.map((x) => x.totalCents));
  const usd = d.collectedByCurrency.find((c) => c.currency === 'USD');
  const ves = d.collectedByCurrency.find((c) => c.currency === 'VES');
  return (
    <div>
      <PageHeader
        title="Indicadores"
        subtitle={<>Ventas confirmadas del {formatShortDate(d.range.from)} al {formatShortDate(d.range.to)} ({d.range.timezone}) · <RateNotice compact /></>}
        actions={
          <div className="flex items-center gap-2">
            <input type="date" className="input w-auto" value={range.from ?? d.range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} aria-label="Desde" />
            <input type="date" className="input w-auto" value={range.to ?? d.range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} aria-label="Hasta" />
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-tour="admin-stats">
        <Stat label="Ventas (USD)" value={formatUSD(d.totals.salesUsdCents)} hint={`${d.totals.orders} operaciones confirmadas`} />
        <Stat label="m² vendidos" value={formatM2(d.totals.areaUnitsSold)} />
        <Stat label="Pagos por verificar" value={<Link to="/admin/pagos" className="hover:underline">{d.pendingPayments}</Link>} hint={`${d.pendingPaymentOrders} operaciones esperando pago`} />
        <Stat label="Pendientes de entrega" value={d.pendingDelivery} />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="card p-5 xl:col-span-2">
          <h2 className="text-lg">Ventas diarias (USD)</h2>
          {d.dailySales.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">Sin ventas confirmadas en el período.</p>
          ) : (
            <div className="mt-4 flex h-48 items-end gap-1" role="img" aria-label="Gráfico de ventas diarias">
              {d.dailySales.map((x) => (
                <div key={x.day} className="group relative flex flex-1 flex-col items-center justify-end">
                  <div className="w-full rounded-t bg-brass/80 transition group-hover:bg-brass" style={{ height: `${(x.totalCents / max) * 100}%`, minHeight: 4 }} />
                  <span className="pointer-events-none absolute -top-10 hidden whitespace-nowrap rounded-none bg-ink px-2 py-1 text-[11px] text-white group-hover:block">
                    {x.day}: {formatUSD(x.totalCents)} · {x.orders} op.
                  </span>
                </div>
              ))}
            </div>
          )}
          <table className="table-base mt-4">
            <thead>
              <tr>
                <th>Día</th>
                <th className="text-right">Operaciones</th>
                <th className="text-right">m²</th>
                <th className="text-right">Total USD</th>
              </tr>
            </thead>
            <tbody>
              {d.dailySales.map((x) => (
                <tr key={x.day}>
                  <td>{formatShortDate(x.day)}</td>
                  <td className="text-right">{x.orders}</td>
                  <td className="text-right">{formatM2(x.areaUnits)}</td>
                  <td className="text-right">{formatUSD(x.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="text-lg">Cobros acreditados</h2>
            <p className="mt-1 text-xs text-ink-muted">Cada moneda se muestra por separado.</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt>En USD ({usd?.payments ?? 0})</dt>
                <dd className="font-semibold">{formatUSD(usd?.amountCents ?? 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>En Bs ({ves?.payments ?? 0})</dt>
                <dd className="font-semibold">{formatVES(ves?.amountCents ?? 0)}</dd>
              </div>
              {ves && (
                <div className="flex justify-between text-xs text-ink-muted">
                  <dt>Equivalente acreditado de los pagos en Bs</dt>
                  <dd>{formatUSD(ves.creditUsdCents)}</dd>
                </div>
              )}
            </dl>
          </section>
          <section className="card p-5">
            <h2 className="text-lg">Ventas por vendedor</h2>
            {d.salesBySeller.length === 0 && <p className="mt-2 text-sm text-ink-muted">Sin datos.</p>}
            <ul className="mt-3 space-y-2 text-sm">
              {d.salesBySeller.map((s) => (
                <li key={s.sellerId} className="flex justify-between">
                  <span>
                    {s.name} <span className="text-xs text-ink-muted">({s.orders})</span>
                  </span>
                  <span className="font-medium">{formatUSD(s.totalCents)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-lg">Retiros próximos (7 días)</h2>
          {d.upcomingPickups.length === 0 && <p className="mt-2 text-sm text-ink-muted">Sin retiros programados.</p>}
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {d.upcomingPickups.map((u) => (
              <li key={u.id} className="flex justify-between gap-2 py-2">
                <Link to={`/admin/operaciones/${u.id}`} className="font-mono text-ink underline-offset-4 hover:underline">
                  {u.code}
                </Link>
                <span className="text-ink-muted">
                  {formatShortDate(u.pickupDate)} · {u.contactName} · {u.totalBoxes} cajas · {ORDER_STATUS_LABELS[u.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="text-lg">Stock bajo o agotado</h2>
          {d.lowStock.length === 0 && <p className="mt-2 text-sm text-ink-muted">Todos los productos activos tienen stock suficiente.</p>}
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {d.lowStock.map((p) => (
              <li key={p.id} className="flex justify-between py-2">
                <Link to={`/admin/productos/${p.id}`} className="hover:underline">
                  {p.name} <span className="text-xs text-ink-muted">{p.sku}</span>
                </Link>
                <span className={p.available <= 0 ? 'font-semibold text-red-700' : 'text-amber-800'}>{p.available <= 0 ? 'Agotado' : `${p.available} cajas (mín. ${p.threshold})`}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
