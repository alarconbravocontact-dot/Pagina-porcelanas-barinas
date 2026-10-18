import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Navigate, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, MessageSquare, XCircle } from 'lucide-react';
import { passwordSchema, profileUpdateSchema } from '@porcelanas/shared';
import { api, ApiError, errorMessage } from '../../lib/api';
import { useSession } from '../../hooks/session';
import { useSellers, useSettings } from '../../hooks/data';
import type { Conversation, Order, PickupAvailability } from '../../lib/types';
import { formatShortDate, formatUSD, ORDER_TYPE_LABELS } from '../../lib/format';
import { Alert, EmptyState, ErrorState, Field, PageHeader, Spinner } from '../../components/ui';
import { OrderPaymentBadge, OrderStatusBadge } from '../../components/StatusBadges';
import { OrderAmounts, OrderHeader, OrderItemsTable, OrderTimeline, PaymentsList, PickupInfo } from '../../components/OrderParts';
import { PaymentForm, ReplaceProofForm } from '../../components/PaymentForm';
import { ChatThread, ConversationList } from '../../components/ChatThread';
import { WhatsAppButton } from '../../components/WhatsAppButton';
import { NotFoundPage } from '../NotFound';

export function AccountLayout() {
  const { user, loading } = useSession();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/ingresar?next=/cuenta" replace />;
  if (!user.customerId) return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/vendedor'} replace />;
  const cls = ({ isActive }: { isActive: boolean }) => `whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${isActive ? 'border-ink text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`;
  return (
    <div className="container-page py-8">
      <p className="text-sm text-ink-muted">Hola, {user.fullName}</p>
      <nav className="mt-3 flex gap-6 overflow-x-auto border-b border-stone-200" aria-label="Mi cuenta">
        <NavLink to="/cuenta" end className={cls}>
          Resumen
        </NavLink>
        <NavLink to="/cuenta/operaciones" className={cls}>
          Compras y reservas
        </NavLink>
        <NavLink to="/cuenta/chat" className={cls}>
          Mensajes
        </NavLink>
        <NavLink to="/cuenta/perfil" className={cls}>
          Perfil
        </NavLink>
      </nav>
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  );
}

function useOrders() {
  return useQuery({ queryKey: ['orders'], queryFn: () => api<Order[]>('/api/orders') });
}

export function AccountHome() {
  const orders = useOrders();
  if (orders.isLoading) return <Spinner />;
  if (orders.isError) return <ErrorState error={orders.error} onRetry={() => orders.refetch()} />;
  const active = orders.data!.filter((o) => ['PENDING_PAYMENT', 'CONFIRMED', 'READY_FOR_PICKUP'].includes(o.status));
  const sellers = [...new Map(orders.data!.map((o) => [o.seller.id, o.seller])).values()];
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h2 className="text-xl">Operaciones activas</h2>
        {active.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No tienes operaciones activas" action={<Link to="/catalogo" className="btn-primary">Ir al catálogo</Link>} />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {active.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </div>
        )}
      </div>
      <aside className="space-y-4">
        <div className="card p-5">
          <h2 className="text-lg">Tu vendedor</h2>
          {sellers.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Seleccionarás tu vendedor al confirmar tu primera compra.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {sellers.map((s) => (
                <li key={s.id} className="flex items-center justify-between">
                  <span>{s.displayName}</span>
                  <Link to="/cuenta/chat" className="text-brass hover:underline">
                    Escribir
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <h2 className="text-lg">¿Necesitas ayuda?</h2>
          <p className="mt-1 text-sm text-ink-muted">Escribe a tu vendedor por el chat o contáctanos.</p>
          <div className="mt-3">
            <WhatsAppButton />
          </div>
        </div>
      </aside>
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  return (
    <Link to={`/cuenta/operaciones/${order.code}`} className="card block p-4 transition hover:border-ink">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-sm font-semibold">{order.code}</p>
        <div className="flex gap-1.5">
          <OrderStatusBadge status={order.status} />
          <OrderPaymentBadge status={order.paymentStatus} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm text-ink-muted">
        <span>
          {ORDER_TYPE_LABELS[order.type]} · retiro {formatShortDate(order.pickupDate)} · vendedor {order.seller.displayName}
        </span>
        <span className="font-medium text-ink">
          {formatUSD(order.totalCents)} {order.balanceCents > 0 && <span className="text-amber-800">(saldo {formatUSD(order.balanceCents)})</span>}
        </span>
      </div>
    </Link>
  );
}

export function AccountOrders() {
  const orders = useOrders();
  if (orders.isLoading) return <Spinner />;
  if (orders.isError) return <ErrorState error={orders.error} onRetry={() => orders.refetch()} />;
  return (
    <div>
      <PageHeader title="Compras y reservas" subtitle="Historial completo de tus operaciones." />
      {orders.data!.length === 0 ? (
        <EmptyState title="Aún no tienes operaciones" action={<Link to="/catalogo" className="btn-primary">Ir al catálogo</Link>} />
      ) : (
        <div className="space-y-3">
          {orders.data!.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AccountOrderDetail() {
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  const q = useQuery({ queryKey: ['order', code], queryFn: () => api<Order>(`/api/orders/${encodeURIComponent(code)}`), retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2 });
  if (q.isLoading) return <Spinner />;
  if (q.error instanceof ApiError && q.error.status === 404) return <NotFoundPage />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data!;
  const active = ['PENDING_PAYMENT', 'CONFIRMED', 'READY_FOR_PICKUP'].includes(o.status);
  return (
    <div>
      {params.get('nueva') && (
        <Alert kind="success" title={`Operación ${o.code} generada`} className="mb-6">
          Tu mercancía quedó apartada. Registra tu pago con el comprobante para que el equipo lo verifique. Tu vendedor asignado es {o.seller.displayName}.
        </Alert>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted">Número de operación</p>
          <h1 className="font-mono text-2xl font-semibold">{o.code}</h1>
          <div className="mt-2">
            <OrderHeader order={o} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <OrderChatButton order={o} />
          <WhatsAppButton message={`Hola, consulto por mi operación ${o.code}.`} label="WhatsApp" />
        </div>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5">
            <h2 className="mb-3 text-lg">Productos</h2>
            <OrderItemsTable order={o} />
          </section>
          {active && o.balanceCents > 0 && (
            <section className="card p-5" id="pagar">
              <h2 className="text-lg">Registrar un pago</h2>
              <p className="mb-4 mt-1 text-sm text-ink-muted">
                {o.paidCents < o.requiredCents
                  ? `Para confirmar la operación se requiere acreditar ${formatUSD(o.requiredCents - o.paidCents)} adicionales.`
                  : `Saldo pendiente para el retiro: ${formatUSD(o.balanceCents)}.`}
              </p>
              <PaymentForm order={o} />
            </section>
          )}
          <section className="card p-5">
            <h2 className="mb-2 text-lg">Pagos</h2>
            <PaymentsList order={o} renderExtra={(p) => (p.status === 'REJECTED' && active ? <ReplaceProofForm paymentId={p.id} orderCode={o.code} /> : null)} />
          </section>
          <section className="card p-5">
            <h2 className="mb-4 text-lg">Historial</h2>
            <OrderTimeline order={o} />
          </section>
        </div>
        <aside className="space-y-6">
          <section className="card p-5">
            <PickupInfo order={o} />
            <p className="mt-4 text-xs uppercase tracking-wide text-ink-muted">Vendedor asignado</p>
            <p className="mt-1 font-medium">{o.seller.displayName}</p>
          </section>
          <section className="card p-5">
            <h2 className="mb-3 text-lg">Importes</h2>
            <OrderAmounts order={o} />
          </section>
          {active && <ManageOrder order={o} />}
          {o.cancelReason && <Alert kind="warning" title="Motivo">{o.cancelReason}</Alert>}
        </aside>
      </div>
    </div>
  );
}

function OrderChatButton({ order }: { order: Order }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const m = useMutation({
    mutationFn: () => api<Conversation>('/api/conversations', { body: { orderId: order.id, message: text, subject: `Operación ${order.code}` } }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      navigate(`/cuenta/chat/${c.id}`);
    },
  });
  if (!open)
    return (
      <button type="button" className="btn-outline" onClick={() => setOpen(true)}>
        <MessageSquare className="h-4 w-4" aria-hidden /> Escribir al vendedor
      </button>
    );
  return (
    <form
      className="flex w-full max-w-md gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) m.mutate();
      }}
    >
      <input className="input" autoFocus placeholder={`Mensaje para ${order.seller.displayName}`} value={text} onChange={(e) => setText(e.target.value)} aria-label="Mensaje" />
      <button type="submit" className="btn-primary" disabled={m.isPending}>
        Enviar
      </button>
      {m.isError && <span className="text-xs text-red-700">{errorMessage(m.error)}</span>}
    </form>
  );
}

function ManageOrder({ order }: { order: Order }) {
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const [mode, setMode] = useState<'none' | 'reschedule' | 'cancel'>('none');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const availability = useQuery({
    queryKey: ['availability', order.type],
    queryFn: () => api<PickupAvailability>(`/api/pickup/availability?type=${order.type}`),
    enabled: mode === 'reschedule',
  });
  const done = () => {
    setMode('none');
    void qc.invalidateQueries({ queryKey: ['order', order.code] });
    void qc.invalidateQueries({ queryKey: ['orders'] });
  };
  const reschedule = useMutation({ mutationFn: () => api(`/api/orders/${order.code}/reschedule`, { body: { pickupDate: date, reason: reason || undefined } }), onSuccess: done });
  const cancel = useMutation({ mutationFn: () => api(`/api/orders/${order.code}/cancel`, { body: { reason } }), onSuccess: done });
  const max = order.terms.maxReschedules ?? settings?.cancellation.maxReschedules ?? 0;
  return (
    <section className="card p-5">
      <h2 className="text-lg">Gestionar</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Cambios de fecha disponibles: {Math.max(0, max - order.rescheduleCount)} de {max}.
      </p>
      {mode === 'none' && (
        <div className="mt-3 flex flex-col gap-2">
          <button type="button" className="btn-outline justify-start" onClick={() => setMode('reschedule')} disabled={order.rescheduleCount >= max}>
            <CalendarClock className="h-4 w-4" aria-hidden /> Solicitar cambio de fecha
          </button>
          {order.paidCents === 0 && (
            <button type="button" className="btn-ghost justify-start text-red-700" onClick={() => setMode('cancel')}>
              <XCircle className="h-4 w-4" aria-hidden /> Cancelar operación
            </button>
          )}
        </div>
      )}
      {mode === 'reschedule' && (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (date) reschedule.mutate();
          }}
        >
          {availability.isLoading && <Spinner />}
          <Field label="Nueva fecha" htmlFor="rs-date">
            <select id="rs-date" className="input" value={date} onChange={(e) => setDate(e.target.value)}>
              <option value="">Seleccione…</option>
              {availability.data?.days
                .filter((d) => d.available && d.date !== order.pickupDate)
                .map((d) => (
                  <option key={d.date} value={d.date}>
                    {formatShortDate(d.date)} ({d.remaining} cupos)
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Motivo (opcional)" htmlFor="rs-reason">
            <input id="rs-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {reschedule.isError && <Alert kind="error">{errorMessage(reschedule.error)}</Alert>}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary btn-sm" disabled={!date || reschedule.isPending}>
              Confirmar cambio
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setMode('none')}>
              Volver
            </button>
          </div>
        </form>
      )}
      {mode === 'cancel' && (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            cancel.mutate();
          }}
        >
          <Field label="Motivo de la cancelación" htmlFor="cn-reason">
            <input id="cn-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {cancel.isError && <Alert kind="error">{errorMessage(cancel.error)}</Alert>}
          <div className="flex gap-2">
            <button type="submit" className="btn-danger btn-sm" disabled={reason.trim().length < 3 || cancel.isPending}>
              Confirmar cancelación
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setMode('none')}>
              Volver
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export function AccountChat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const convs = useQuery({ queryKey: ['conversations'], queryFn: () => api<Conversation[]>('/api/conversations') });
  const sellers = useSellers();
  const qc = useQueryClient();
  const [sellerId, setSellerId] = useState('');
  const [text, setText] = useState('');
  const start = useMutation({
    mutationFn: () => api<Conversation>('/api/conversations', { body: { sellerId, message: text } }),
    onSuccess: (c) => {
      setText('');
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      navigate(`/cuenta/chat/${c.id}`);
    },
  });
  useEffect(() => {
    if (!id && convs.data?.length && window.innerWidth >= 1024) navigate(`/cuenta/chat/${convs.data[0]!.id}`, { replace: true });
  }, [id, convs.data, navigate]);
  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className={`card overflow-hidden ${id ? 'hidden lg:block' : ''}`}>
        <div className="border-b border-stone-200 p-4">
          <p className="text-sm font-semibold">Nueva conversación</p>
          <form
            className="mt-2 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (sellerId && text.trim()) start.mutate();
            }}
          >
            <select className="input" value={sellerId} onChange={(e) => setSellerId(e.target.value)} aria-label="Vendedor">
              <option value="">Elegir vendedor…</option>
              {sellers.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
            <input className="input" placeholder="Escribe tu consulta" value={text} onChange={(e) => setText(e.target.value)} aria-label="Mensaje inicial" />
            <button type="submit" className="btn-primary btn-sm w-full" disabled={!sellerId || !text.trim() || start.isPending}>
              Iniciar
            </button>
            {start.isError && <p className="text-xs text-red-700">{errorMessage(start.error)}</p>}
          </form>
        </div>
        {convs.isLoading && <Spinner />}
        {convs.isError && <ErrorState error={convs.error} onRetry={() => convs.refetch()} />}
        {convs.data?.length === 0 && <p className="p-4 text-sm text-ink-muted">Sin conversaciones todavía.</p>}
        {convs.data && <ConversationList items={convs.data} activeId={id} onSelect={(cid) => navigate(`/cuenta/chat/${cid}`)} perspective="customer" />}
      </div>
      <div className={`card overflow-hidden ${id ? '' : 'hidden lg:block'}`}>
        {id ? (
          <>
            <button type="button" className="btn-ghost btn-sm m-2 lg:hidden" onClick={() => navigate('/cuenta/chat')}>
              ← Conversaciones
            </button>
            <ChatThread conversationId={id} orderLinkBase="/cuenta/operaciones/" />
          </>
        ) : (
          <p className="p-10 text-center text-sm text-ink-muted">Selecciona una conversación.</p>
        )}
      </div>
    </div>
  );
}

export function AccountProfile() {
  const { user, refresh } = useSession();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useMutation({ mutationFn: () => api('/api/auth/profile', { method: 'PATCH', body: { fullName, phone } }), onSuccess: () => refresh() });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwErr, setPwErr] = useState<string | null>(null);
  const changePw = useMutation({ mutationFn: () => api('/api/auth/password', { body: pw }), onSuccess: () => setPw({ currentPassword: '', newPassword: '' }) });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        className="card space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          const r = profileUpdateSchema.safeParse({ fullName, phone });
          if (!r.success) {
            const f: Record<string, string> = {};
            for (const i of r.error.issues) f[i.path.join('.')] ??= i.message;
            return setFields(f);
          }
          setFields({});
          save.mutate();
        }}
      >
        <h2 className="text-lg">Datos personales</h2>
        <Field label="Correo" htmlFor="pr-email">
          <input id="pr-email" className="input" value={user?.email ?? ''} disabled />
        </Field>
        <Field label="Nombre completo" htmlFor="pr-name" error={fields.fullName}>
          <input id="pr-name" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Teléfono" htmlFor="pr-phone" error={fields.phone}>
          <input id="pr-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        {save.isSuccess && <Alert kind="success">Datos actualizados.</Alert>}
        {save.isError && <Alert kind="error">{errorMessage(save.error)}</Alert>}
        <button type="submit" className="btn-primary" disabled={save.isPending}>
          Guardar
        </button>
      </form>
      <form
        className="card space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          const r = passwordSchema.safeParse(pw.newPassword);
          setPwErr(r.success ? null : r.error.issues[0]!.message);
          if (r.success) changePw.mutate();
        }}
      >
        <h2 className="text-lg">Cambiar contraseña</h2>
        <Field label="Contraseña actual" htmlFor="pw-cur">
          <input id="pw-cur" type="password" autoComplete="current-password" className="input" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
        </Field>
        <Field label="Nueva contraseña" htmlFor="pw-new" error={pwErr ?? undefined}>
          <input id="pw-new" type="password" autoComplete="new-password" className="input" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
        </Field>
        {changePw.isSuccess && <Alert kind="success">Contraseña actualizada. Se cerraron las demás sesiones.</Alert>}
        {changePw.isError && <Alert kind="error">{errorMessage(changePw.error)}</Alert>}
        <button type="submit" className="btn-primary" disabled={changePw.isPending}>
          Actualizar contraseña
        </button>
      </form>
    </div>
  );
}
