import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, localDateString, ORDER_STATUS, usdCentsToVesCents, type OrderStatus } from '@porcelanas/shared';
import { api, ApiError, errorMessage, newIdempotencyKey, toQuery } from '../../lib/api';
import type { Conversation, Order, OrderPayment } from '../../lib/types';
import { formatDateTime, formatShortDate, formatUSD, formatVES, ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from '../../lib/format';
import { useSession } from '../../hooks/session';
import { usePaymentMethods, useSettings } from '../../hooks/data';
import { Alert, EmptyState, ErrorState, Field, PageHeader, Pagination, Spinner } from '../../components/ui';
import { OrderPaymentBadge, OrderStatusBadge, PaymentStatusBadge } from '../../components/StatusBadges';
import { OrderAmounts, OrderHeader, OrderItemsTable, OrderTimeline, PaymentsList, PickupInfo } from '../../components/OrderParts';
import { ChatThread, ConversationList } from '../../components/ChatThread';
import { NotFoundPage } from '../NotFound';

export const useBase = () => (window.location.pathname.startsWith('/admin') ? '/admin' : '/vendedor');

interface StaffOrderRow {
  id: string;
  code: string;
  type: 'PICKUP' | 'PREPAY';
  status: OrderStatus;
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  totalBoxes: number;
  pickupDate: string;
  contactName: string;
  contactPhone: string;
  createdAt: string;
  seller: { id: string; displayName: string };
  pendingPayments: number;
}

export function StaffOrders() {
  const base = useBase();
  const [filters, setFilters] = useState({ status: 'ACTIVE', type: '', q: '', page: 1 });
  const q = useQuery({
    queryKey: ['staff-orders', filters],
    queryFn: () => api<{ items: StaffOrderRow[]; total: number; page: number; pageSize: number }>(`/api/staff/orders${toQuery(filters)}`),
    placeholderData: keepPreviousData,
  });
  return (
    <div>
      <PageHeader title={base === '/admin' ? 'Ventas y reservas' : 'Mis operaciones'} subtitle="Operaciones asignadas según sus permisos." />
      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input w-auto" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })} aria-label="Estado">
          <option value="ACTIVE">Activas</option>
          <option value="">Todas</option>
          {ORDER_STATUS.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value, page: 1 })} aria-label="Modalidad">
          <option value="">Todas las modalidades</option>
          <option value="PICKUP">{ORDER_TYPE_LABELS.PICKUP}</option>
          <option value="PREPAY">{ORDER_TYPE_LABELS.PREPAY}</option>
        </select>
        <input className="input max-w-xs" placeholder="Código, cliente o teléfono" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value, page: 1 })} aria-label="Buscar" />
      </div>
      {q.isLoading && <Spinner />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && q.data.items.length === 0 && <EmptyState title="No hay operaciones con esos filtros" />}
      {q.data && q.data.items.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Operación</th>
                <th>Cliente</th>
                <th>Retiro</th>
                <th>Estado</th>
                <th className="text-right">Total</th>
                <th className="text-right">Saldo</th>
                {base === '/admin' && <th>Vendedor</th>}
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((o) => (
                <tr key={o.id} className="hover:bg-stone-50">
                  <td>
                    <Link to={`${base}/operaciones/${o.id}`} className="font-mono font-semibold text-ink underline-offset-4 hover:underline">
                      {o.code}
                    </Link>
                    <p className="text-xs text-ink-muted">{o.type === 'PICKUP' ? 'Retiro programado' : 'Prepago'}</p>
                  </td>
                  <td>
                    {o.contactName}
                    <p className="text-xs text-ink-muted">{o.contactPhone}</p>
                  </td>
                  <td className="whitespace-nowrap">{formatShortDate(o.pickupDate)}</td>
                  <td>
                    <div className="flex flex-col items-start gap-1">
                      <OrderStatusBadge status={o.status} />
                      <OrderPaymentBadge status={o.paymentStatus} />
                      {o.pendingPayments > 0 && <span className="text-xs font-medium text-amber-800">{o.pendingPayments} pago(s) por verificar</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-right">{formatUSD(o.totalCents)}</td>
                  <td className="whitespace-nowrap text-right">{formatUSD(o.balanceCents)}</td>
                  {base === '/admin' && <td>{o.seller.displayName}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.data && <Pagination page={q.data.page} totalPages={Math.ceil(q.data.total / q.data.pageSize)} onPage={(p) => setFilters({ ...filters, page: p })} />}
    </div>
  );
}

export function StaffOrderDetail() {
  const { id = '' } = useParams();
  const base = useBase();
  const qc = useQueryClient();
  const key = ['staff-order', id];
  const q = useQuery({ queryKey: key, queryFn: () => api<Order>(`/api/staff/orders/${id}`), retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2 });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ['staff-orders'] });
    void qc.invalidateQueries({ queryKey: ['staff-payments'] });
  };
  const [note, setNote] = useState('');
  const action = useMutation({ mutationFn: (a: { action: string; note?: string }) => api(`/api/staff/orders/${id}/status`, { body: a }), onSuccess: () => { setNote(''); refresh(); } });
  const [noteKind, setNoteKind] = useState<'NOTE' | 'INCIDENT'>('NOTE');
  const [noteBody, setNoteBody] = useState('');
  const addNote = useMutation({ mutationFn: () => api(`/api/staff/orders/${id}/notes`, { body: { kind: noteKind, body: noteBody } }), onSuccess: () => { setNoteBody(''); refresh(); } });

  if (q.isLoading) return <Spinner />;
  if (q.error instanceof ApiError && q.error.status === 404) return <NotFoundPage />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data!;
  const active = ['PENDING_PAYMENT', 'CONFIRMED', 'READY_FOR_PICKUP'].includes(o.status);
  return (
    <div>
      <Link to={base === '/admin' ? '/admin/operaciones' : '/vendedor'} className="text-sm text-ink-muted hover:text-ink">
        ← Volver
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold">{o.code}</h1>
          <div className="mt-2">
            <OrderHeader order={o} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {o.status === 'CONFIRMED' && (
            <button type="button" className="btn-accent" disabled={action.isPending} onClick={() => action.mutate({ action: 'MARK_READY', note: note || undefined })}>
              Marcar lista para retiro
            </button>
          )}
          {(o.status === 'CONFIRMED' || o.status === 'READY_FOR_PICKUP') && (
            <button type="button" className="btn-primary" disabled={action.isPending || o.balanceCents > 0} title={o.balanceCents > 0 ? 'Hay saldo pendiente' : ''} onClick={() => action.mutate({ action: 'MARK_DELIVERED', note: note || undefined })}>
              Registrar entrega
            </button>
          )}
        </div>
      </div>
      {action.isError && <Alert kind="error" className="mt-3">{errorMessage(action.error)}</Alert>}
      {active && (
        <input className="input mt-3 max-w-lg" placeholder="Observación para el cambio de estado (opcional / motivo de cancelación)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Observación" />
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section className="card p-5">
            <h2 className="mb-3 text-lg">Productos y cantidades</h2>
            <OrderItemsTable order={o} />
          </section>
          <section className="card p-5">
            <h2 className="mb-2 text-lg">Pagos y comprobantes</h2>
            {!o.canReviewPayments && <p className="mb-2 text-xs text-ink-muted">No tiene permiso para verificar pagos; un administrador o vendedor autorizado los revisará.</p>}
            <PaymentsList order={o} renderExtra={(p) => (o.canReviewPayments && p.status === 'PENDING' ? <ReviewControls payment={p} onDone={refresh} /> : null)} />
            {o.canReviewPayments && active && o.balanceCents > 0 && <InPersonPayment order={o} onDone={refresh} />}
          </section>
          <section className="card p-5">
            <h2 className="mb-3 text-lg">Observaciones e incidencias</h2>
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (noteBody.trim().length >= 2) addNote.mutate();
              }}
            >
              <select className="input sm:w-40" value={noteKind} onChange={(e) => setNoteKind(e.target.value as 'NOTE' | 'INCIDENT')} aria-label="Tipo">
                <option value="NOTE">Observación</option>
                <option value="INCIDENT">Incidencia</option>
              </select>
              <input className="input" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Escriba la observación" aria-label="Texto" />
              <button type="submit" className="btn-outline" disabled={addNote.isPending}>
                Registrar
              </button>
            </form>
            {addNote.isError && <Alert kind="error" className="mt-2">{errorMessage(addNote.error)}</Alert>}
            <ul className="mt-3 space-y-2">
              {o.notes?.map((n) => (
                <li key={n.id} className={`rounded-none p-3 text-sm ${n.kind === 'INCIDENT' ? 'bg-amber-50' : 'bg-stone-50'}`}>
                  <p className="text-xs font-semibold">{n.kind === 'INCIDENT' ? 'Incidencia' : 'Observación'} · {n.author} · {formatDateTime(n.createdAt)}</p>
                  <p className="mt-1">{n.body}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className="card p-5">
            <h2 className="mb-4 text-lg">Trazabilidad</h2>
            <OrderTimeline order={o} />
          </section>
        </div>
        <aside className="space-y-6">
          <section className="card p-5 text-sm">
            <h2 className="mb-2 text-lg">Cliente</h2>
            <p className="font-medium">{o.contactName}</p>
            <p>
              <a href={`tel:${o.contactPhone.replace(/\s/g, '')}`} className="text-ink underline-offset-4 hover:underline">
                {o.contactPhone}
              </a>
            </p>
            {o.customerNotes && <p className="mt-2 rounded-none bg-stone-50 p-2 text-xs">“{o.customerNotes}”</p>}
            <p className="mt-3 text-xs uppercase tracking-wide text-ink-muted">Vendedor</p>
            <p>{o.seller.displayName}</p>
          </section>
          <section className="card p-5">
            <PickupInfo order={o} />
          </section>
          <section className="card p-5">
            <h2 className="mb-3 text-lg">Importes</h2>
            <OrderAmounts order={o} />
          </section>
          {o.canCancel && active && (
            <section className="card p-5">
              <h2 className="text-lg">Cancelar operación</h2>
              <p className="mt-1 text-xs text-ink-muted">Libera el inventario y el cupo. Escriba el motivo en el campo de observación superior.</p>
              <button type="button" className="btn-danger btn-sm mt-3" disabled={note.trim().length < 3 || action.isPending} onClick={() => action.mutate({ action: 'CANCEL', note })}>
                Cancelar operación
              </button>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function ReviewControls({ payment, onDone }: { payment: OrderPayment; onDone: () => void }) {
  const [notes, setNotes] = useState('');
  const m = useMutation({ mutationFn: (decision: 'APPROVE' | 'REJECT') => api(`/api/staff/payments/${payment.id}/review`, { body: { decision, notes: notes || undefined } }), onSuccess: onDone });
  return (
    <div className="mt-2 rounded-none border border-amber-200 bg-amber-50 p-3">
      {payment.proofs[0] && (
        <a href={`/api/proofs/${payment.proofs[0].id}`} target="_blank" rel="noopener noreferrer">
          <img src={`/api/proofs/${payment.proofs[0].id}`} alt="Comprobante de pago" className="mb-2 max-h-56 rounded-none border border-stone-200 bg-white object-contain" />
        </a>
      )}
      <input className="input" placeholder="Observaciones (obligatorio para rechazar)" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Observaciones de revisión" />
      <div className="mt-2 flex gap-2">
        <button type="button" className="btn-primary btn-sm" disabled={m.isPending} onClick={() => m.mutate('APPROVE')}>
          Aprobar pago
        </button>
        <button type="button" className="btn-danger btn-sm" disabled={m.isPending || notes.trim().length < 3} onClick={() => m.mutate('REJECT')}>
          Rechazar
        </button>
      </div>
      {m.isError && <p className="mt-1 text-xs text-red-700">{errorMessage(m.error)}</p>}
    </div>
  );
}

function InPersonPayment({ order, onDone }: { order: Order; onDone: () => void }) {
  const methods = usePaymentMethods();
  const { data: settings } = useSettings();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ paymentMethodId: '', amount: '', reference: '', paidAt: localDateString(new Date(), settings?.store.timezone) });
  const [key] = useState(newIdempotencyKey);
  const method = methods.data?.find((m) => m.id === form.paymentMethodId);
  const m = useMutation({
    mutationFn: () => api(`/api/staff/orders/${order.id}/payments`, { body: { ...form, amount: form.amount.replace(',', '.'), currency: method?.currency ?? 'USD' }, idempotencyKey: key }),
    onSuccess: () => {
      setOpen(false);
      onDone();
    },
  });
  if (!open)
    return (
      <button type="button" className="btn-outline btn-sm mt-3" onClick={() => setOpen(true)}>
        Registrar pago presencial
      </button>
    );
  return (
    <form
      className="mt-3 grid gap-2 rounded-none bg-stone-50 p-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <select className="input" value={form.paymentMethodId} onChange={(e) => setForm({ ...form, paymentMethodId: e.target.value })} aria-label="Método">
        <option value="">Método…</option>
        {methods.data?.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name} ({x.currency})
          </option>
        ))}
      </select>
      <input className="input" placeholder={`Importe ${method?.currency ?? ''}`} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} aria-label="Importe" />
      <input className="input" placeholder="Referencia / recibo" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} aria-label="Referencia" />
      <input className="input" type="date" value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} aria-label="Fecha" />
      <p className="text-xs text-ink-muted sm:col-span-2">
        Saldo: {formatUSD(order.balanceCents)}
        {method?.currency === 'VES' && ` · equivalente ${formatVES(usdCentsToVesCents(order.balanceCents, order.rateValue))}`}
      </p>
      {m.isError && <p className="text-xs text-red-700 sm:col-span-2">{errorMessage(m.error)}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className="btn-primary btn-sm" disabled={m.isPending}>
          Registrar y aprobar
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

interface ReviewRow extends Omit<OrderPayment, 'method' | 'reviewedBy'> {
  method: { name: string; kind: string; currency: string };
  reviewedBy: { email: string } | null;
  order: { id: string; code: string; totalCents: number; paidCents: number; balanceCents: number; requiredCents: number; status: OrderStatus; customer: { fullName: string; phone: string }; seller: { displayName: string } };
}

export function StaffPayments() {
  const base = useBase();
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const q = useQuery({ queryKey: ['staff-payments', status], queryFn: () => api<ReviewRow[]>(`/api/staff/payments?status=${status}`) });
  const qc = useQueryClient();
  return (
    <div>
      <PageHeader title="Revisión de comprobantes" subtitle="Verifique cada pago contra el banco o la plataforma antes de aprobarlo." />
      <div className="mb-4 flex gap-2">
        {(['PENDING', 'APPROVED', 'REJECTED'] as const).map((s) => (
          <button key={s} type="button" className={s === status ? 'btn-primary btn-sm' : 'btn-outline btn-sm'} onClick={() => setStatus(s)}>
            {s === 'PENDING' ? 'Pendientes' : s === 'APPROVED' ? 'Aprobados' : 'Rechazados'}
          </button>
        ))}
      </div>
      {q.isLoading && <Spinner />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState title="No hay pagos en esta categoría" />}
      <div className="grid gap-4 md:grid-cols-2">
        {q.data?.map((p) => (
          <div key={p.id} className="card p-4">
            <div className="flex items-center justify-between">
              <Link to={`${base}/operaciones/${p.order.id}`} className="font-mono font-semibold text-ink underline-offset-4 hover:underline">
                {p.order.code}
              </Link>
              <PaymentStatusBadge status={p.status} />
            </div>
            <p className="mt-1 text-sm">
              {p.order.customer.fullName} · {p.order.seller.displayName}
            </p>
            <p className="mt-2 text-lg font-semibold">
              {p.currency === 'VES' ? formatVES(p.amountCents) : formatUSD(p.amountCents)}{' '}
              <span className="text-xs font-normal text-ink-muted">
                {p.method.name} · ref. {p.reference} · {p.paidAt}
                {p.currency === 'VES' && ` · acredita ${formatUSD(p.creditUsdCents)}`}
              </span>
            </p>
            <p className="text-xs text-ink-muted">
              Operación: total {formatUSD(p.order.totalCents)} · acreditado {formatUSD(p.order.paidCents)} · requerido {formatUSD(p.order.requiredCents)}
            </p>
            {p.reviewNotes && <p className="mt-1 text-xs">Observación: {p.reviewNotes}</p>}
            {status === 'PENDING' ? (
              <ReviewControls payment={p as unknown as OrderPayment} onDone={() => qc.invalidateQueries({ queryKey: ['staff-payments'] })} />
            ) : (
              p.proofs[0] && (
                <a href={`/api/proofs/${p.proofs[0].id}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-ink underline">
                  Ver comprobante
                </a>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StaffPickups() {
  const base = useBase();
  const { data: settings } = useSettings();
  const today = localDateString(new Date(), settings?.store.timezone);
  const [from, setFrom] = useState(today);
  const to = addDays(from, 13);
  const q = useQuery({
    queryKey: ['staff-pickups', from],
    queryFn: () => api<{ id: string; code: string; status: OrderStatus; pickupDate: string; totalBoxes: number; contactName: string; balanceCents: number; seller: { displayName: string } }[]>(`/api/staff/pickups?from=${from}&to=${to}`),
  });
  const days = Array.from({ length: 14 }, (_, i) => addDays(from, i));
  return (
    <div>
      <PageHeader
        title="Calendario de retiros"
        subtitle={`Del ${formatShortDate(from)} al ${formatShortDate(to)}`}
        actions={
          <>
            <button type="button" className="btn-outline btn-sm" onClick={() => setFrom(addDays(from, -14))}>
              ← Anterior
            </button>
            <button type="button" className="btn-outline btn-sm" onClick={() => setFrom(today)}>
              Hoy
            </button>
            <button type="button" className="btn-outline btn-sm" onClick={() => setFrom(addDays(from, 14))}>
              Siguiente →
            </button>
          </>
        }
      />
      {q.isLoading && <Spinner />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {days.map((d) => {
            const list = q.data.filter((o) => o.pickupDate === d);
            return (
              <div key={d} className={`card p-3 ${d === today ? 'border-brass' : ''}`}>
                <p className="text-sm font-semibold capitalize">
                  {new Intl.DateTimeFormat('es-VE', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))}
                </p>
                {list.length === 0 ? (
                  <p className="mt-1 text-xs text-ink-muted">Sin retiros</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {list.map((o) => (
                      <li key={o.id} className="text-xs">
                        <Link to={`${base}/operaciones/${o.id}`} className="font-mono font-semibold text-ink underline-offset-4 hover:underline">
                          {o.code}
                        </Link>{' '}
                        · {o.contactName} · {o.totalBoxes} cajas · {ORDER_STATUS_LABELS[o.status]}
                        {o.balanceCents > 0 && <span className="text-amber-800"> · saldo {formatUSD(o.balanceCents)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function StaffChat() {
  const { id } = useParams();
  const base = useBase();
  const navigate = useNavigate();
  const { user } = useSession();
  const [status, setStatus] = useState('');
  const convs = useQuery({ queryKey: ['conversations', status], queryFn: () => api<Conversation[]>(`/api/conversations${toQuery({ status })}`) });
  const qc = useQueryClient();
  const current = convs.data?.find((c) => c.id === id);
  const setConvStatus = useMutation({
    mutationFn: (s: string) => api(`/api/conversations/${id}/status`, { method: 'PATCH', body: { status: s } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
  return (
    <div>
      <PageHeader title={user?.role === 'ADMIN' ? 'Conversaciones (supervisión)' : 'Atención al cliente'} />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className={`card overflow-hidden ${id ? 'hidden lg:block' : ''}`}>
          <div className="border-b border-stone-200 p-3">
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Estado">
              <option value="">Todas</option>
              <option value="OPEN">Abiertas</option>
              <option value="PENDING">En espera</option>
              <option value="CLOSED">Cerradas</option>
            </select>
          </div>
          {convs.isLoading && <Spinner />}
          {convs.isError && <ErrorState error={convs.error} onRetry={() => convs.refetch()} />}
          {convs.data?.length === 0 && <p className="p-4 text-sm text-ink-muted">Sin conversaciones.</p>}
          {convs.data && <ConversationList items={convs.data} activeId={id} onSelect={(cid) => navigate(`${base}/chat/${cid}`)} perspective="staff" />}
        </div>
        <div className={`card overflow-hidden ${id ? '' : 'hidden lg:block'}`}>
          {id ? (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-3 py-2">
                <button type="button" className="btn-ghost btn-sm lg:hidden" onClick={() => navigate(`${base}/chat`)}>
                  ← Volver
                </button>
                {current && current.viewerSide !== 'admin' && (
                  <select className="input ml-auto w-auto py-1 text-xs" value={current.status} onChange={(e) => setConvStatus.mutate(e.target.value)} aria-label="Estado de la conversación">
                    <option value="OPEN">Abierta</option>
                    <option value="PENDING">En espera</option>
                    <option value="CLOSED">Cerrada</option>
                  </select>
                )}
              </div>
              <ChatThread conversationId={id} orderLinkBase={`${base}/operaciones/`} />
            </>
          ) : (
            <p className="p-10 text-center text-sm text-ink-muted">Selecciona una conversación.</p>
          )}
        </div>
      </div>
    </div>
  );
}
