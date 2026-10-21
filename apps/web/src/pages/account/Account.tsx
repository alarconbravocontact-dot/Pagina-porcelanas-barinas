import { StoreMap } from '../../components/StoreMap';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Navigate, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, MessageSquare, XCircle } from 'lucide-react';
import { credentialsSchema, passwordSchema } from '@porcelanas/shared';
import { api, ApiError, errorMessage } from '../../lib/api';
import { useSession } from '../../hooks/session';
import { useCustomerProfile, useSellers, useSettings } from '../../hooks/data';
import { CustomerProfileForm } from '../../components/CustomerProfileForm';
import type { Conversation, Order, PickupAvailability } from '../../lib/types';
import { formatShortDate, formatUSD, ORDER_TYPE_LABELS } from '../../lib/format';
import { Alert, EmptyState, ErrorState, Field, PageHeader, Spinner } from '../../components/ui';
import { OrderStatusBadge, PaymentReviewBadge } from '../../components/StatusBadges';
import { OrderAmounts, OrderHeader, OrderItemsTable, OrderTimeline, PaymentsList, PickupInfo } from '../../components/OrderParts';
import { PaymentForm, ReplaceProofForm } from '../../components/PaymentForm';
import { ChatThread, ConversationList } from '../../components/ChatThread';
import { WhatsAppButton } from '../../components/WhatsAppButton';
import { SellerContactCard } from '../../components/SellerContact';
import { MethodInstructions } from '../Checkout';
import { OrderProgress, OrderRegisteredBanner, visitMessage } from '../../components/OrderConfirmation';
import { PAYMENT_REVIEW_STATE_LABELS } from '@porcelanas/shared';

const RESERVATION_LABELS: Record<string, string> = {
  HELD: 'apartada, pendiente del pago requerido',
  CONFIRMED: 'confirmada hasta la fecha de retiro',
  FULFILLED: 'entregada',
  RELEASED: 'liberada',
};

const orderWaMessage = (o: Order) => `Hola, te escribo por mi operación ${o.code} con retiro el ${formatShortDate(o.pickupDate)}.`;
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2" data-tour="account-active">
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
      <aside className="space-y-4" data-tour="account-seller">
        {sellers.length === 0 ? (
          <div className="card p-5">
            <h2 className="text-lg">Tu vendedor</h2>
            <p className="mt-2 text-sm text-ink-muted">Seleccionarás tu vendedor al confirmar tu primera compra.</p>
            <Link to="/contacto" className="btn-outline btn-sm mt-3">
              Ver vendedores
            </Link>
          </div>
        ) : (
          sellers.map((s) => (
            <div key={s.id}>
              <SellerContactCard seller={s} title="Tu vendedor asignado" message="Hola, te escribo por mis compras en la tienda de porcelanatos." />
              <Link to="/cuenta/chat" className="btn-ghost btn-sm mt-1">
                Abrir chat interno
              </Link>
            </div>
          ))
        )}
      </aside>
    </div>
  );
}

export function OrderCard({ order }: { order: Order }) {
  return (
    <Link to={`/cuenta/operaciones/${order.code}`} className="card block p-4 transition hover:border-ink">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-sm font-semibold">{order.code}</p>
        <div className="flex gap-1.5">
          <OrderStatusBadge status={order.status} />
          <PaymentReviewBadge state={order.paymentReviewState} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm text-ink-muted">
        <span>
          {ORDER_TYPE_LABELS[order.type]} · retiro {formatShortDate(order.pickupDate)} · vendedor {order.seller.displayName}
          {order.preferredMethod && ` · ${order.preferredMethod.name}`} · {PAYMENT_REVIEW_STATE_LABELS[order.paymentReviewState]}
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
  const navigate = useNavigate();
  const [skipProof, setSkipProof] = useState(false);
  const { data: settings } = useSettings();
  const q = useQuery({ queryKey: ['order', code], queryFn: () => api<Order>(`/api/orders/${encodeURIComponent(code)}`), retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2 });
  if (q.isLoading) return <Spinner />;
  if (q.error instanceof ApiError && q.error.status === 404) return <NotFoundPage />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data!;
  const active = ['PENDING_PAYMENT', 'CONFIRMED', 'READY_FOR_PICKUP'].includes(o.status);
  const isNew = !!params.get('nueva');
  // Tras crear la orden: primero el comprobante (si el método lo requiere), luego el cartel de confirmación.
  const needsProof = isNew && active && o.payments.length === 0 && !!o.preferredMethod?.requiresProof && !skipProof;
  const showBanner = isNew && !needsProof;
  const viewOrder = () => {
    navigate(`/cuenta/operaciones/${o.code}`, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  if (needsProof) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="eyebrow">Orden {o.code} registrada · último paso</p>
        <h1 className="mt-3 text-4xl">Adjunta tu comprobante de pago</h1>
        <p className="mt-3 text-ink-soft">
          Tu orden ya está guardada. Si ya pagaste por {o.preferredMethod?.name}, registra el pago y adjunta la captura para que tu vendedor lo verifique. Adjuntarla no confirma el pago
          automáticamente.
        </p>
        <div className="mt-6 border border-stone-200 p-6">
          {o.preferredMethod && <MethodInstructions method={o.preferredMethod} />}
          <div className="mt-6">
            <PaymentForm order={o} />
          </div>
        </div>
        <button type="button" className="btn-ghost mt-4" onClick={() => setSkipProof(true)}>
          Pagaré después · adjuntar el comprobante más tarde
        </button>
      </div>
    );
  }
  return (
    <div>
      {showBanner && (
        <div className="mb-10">
          <OrderRegisteredBanner order={o} onViewOrder={viewOrder} />
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted">Número de orden</p>
          <h1 className="font-mono text-2xl font-semibold">{o.code}</h1>
          <div className="mt-2">
            <OrderHeader order={o} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <OrderChatButton order={o} />
          <WhatsAppButton number={o.seller.whatsapp} message={orderWaMessage(o)} label="WhatsApp" />
        </div>
      </div>
      <div className="mt-6">
        <OrderProgress order={o} />
      </div>
      {active && !showBanner && (
        <Alert kind="info" className="mt-6" title="Antes de acudir a la sede">
          Contacta a tu vendedor {o.seller.displayName} con tu número de orden {o.code} para que esté preparado para recibirte.
          {settings?.store.hoursText && ` Horario de atención: ${settings.store.hoursText}.`}{' '}
          <WhatsAppButton variant="link" number={o.seller.whatsapp} message={visitMessage(o)} label="Escribir por WhatsApp" />
        </Alert>
      )}
      {active && <StoreMap compact className="mt-4" />}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5" data-tour="order-items">
            <h2 className="mb-3 text-lg">Productos</h2>
            <OrderItemsTable order={o} />
          </section>
          {o.preferredMethod && (
            <section className="card p-5">
              <h2 className="text-lg">Método de pago elegido</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {o.preferredMethod.name} · {o.priceList === 'BCV' ? 'precio BCV, pago en bolívares' : 'precio en divisas, pago en dólares'}. Estado del pago:{' '}
                <strong>{PAYMENT_REVIEW_STATE_LABELS[o.paymentReviewState]}</strong>.
              </p>
              {active && o.balanceCents > 0 && <MethodInstructions method={o.preferredMethod} />}
            </section>
          )}
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
        <aside className="space-y-6" data-tour="order-aside">
          <section className="card p-5">
            <PickupInfo order={o} />
            {o.reservation && (
              <p className="mt-2 text-xs text-ink-muted">
                Reserva: {RESERVATION_LABELS[o.reservation.status] ?? o.reservation.status}
              </p>
            )}
          </section>
          <SellerContactCard seller={o.seller} title="Vendedor responsable" message={visitMessage(o)} />
          <section className="card p-5 text-sm">
            <h2 className="mb-2 text-lg">Datos de la orden</h2>
            <p>{o.contactName}</p>
            <p className="text-ink-muted">{o.contactPhone}</p>
            <p className="text-ink-muted">
              {o.contactCity} · {o.contactAddressRef}
            </p>
            <p className="text-ink-muted">Cédula {o.contactDocumentMasked}</p>
            <p className="mt-2 text-xs text-ink-muted">Registrada el {formatShortDate(o.createdAt.slice(0, 10))}</p>
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
      <div className={`card overflow-hidden ${id ? 'hidden lg:block' : ''}`} data-tour="chat-list">
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
  const profile = useCustomerProfile(true);
  const [saved, setSaved] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwErr, setPwErr] = useState<string | null>(null);
  const changePw = useMutation({ mutationFn: () => api('/api/auth/password', { body: pw }), onSuccess: () => setPw({ currentPassword: '', newPassword: '' }) });
  const [cred, setCred] = useState({ email: '', password: '' });
  const [credErr, setCredErr] = useState<Record<string, string>>({});
  const addCred = useMutation({ mutationFn: () => api('/api/auth/credentials', { body: cred }), onSuccess: () => refresh() });
  if (profile.isLoading) return <Spinner />;
  if (profile.isError) return <ErrorState error={profile.error} onRetry={() => profile.refetch()} />;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="card p-6">
        <h2 className="mb-1 text-2xl">Tus datos</h2>
        <p className="mb-5 text-sm text-ink-muted">Se usan en tus órdenes de compra. Cédula registrada: {profile.data?.documentMasked || '—'}.</p>
        {saved && <Alert kind="success" className="mb-4">Datos actualizados.</Alert>}
        <CustomerProfileForm initial={profile.data} submitLabel="Guardar cambios" onSaved={() => setSaved(true)} />
      </section>
      {user?.hasCredentials ? (
        <form
          className="card h-fit space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            const r = passwordSchema.safeParse(pw.newPassword);
            setPwErr(r.success ? null : r.error.issues[0]!.message);
            if (r.success) changePw.mutate();
          }}
        >
          <h2 className="text-2xl">Cambiar contraseña</h2>
          <p className="text-sm text-ink-muted">Correo de acceso: {user.email}</p>
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
      ) : (
        <form
          className="card h-fit space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            const r = credentialsSchema.safeParse(cred);
            if (!r.success) {
              const f: Record<string, string> = {};
              for (const i of r.error.issues) f[i.path.join('.')] ??= i.message;
              return setCredErr(f);
            }
            setCredErr({});
            addCred.mutate();
          }}
        >
          <h2 className="text-2xl">Acceso desde otros dispositivos</h2>
          <p className="text-sm text-ink-soft">
            Tu perfil está abierto en este dispositivo. Opcionalmente, agrega un correo y una contraseña para entrar desde cualquier otro. Si no, tu vendedor puede enviarte un enlace de
            acceso.
          </p>
          <Field label="Correo (opcional)" htmlFor="cr-email" error={credErr.email}>
            <input id="cr-email" type="email" autoComplete="email" className="input" value={cred.email} onChange={(e) => setCred({ ...cred, email: e.target.value })} />
          </Field>
          <Field label="Contraseña" htmlFor="cr-pw" error={credErr.password} hint="Mínimo 10 caracteres, con letras y números.">
            <input id="cr-pw" type="password" autoComplete="new-password" className="input" value={cred.password} onChange={(e) => setCred({ ...cred, password: e.target.value })} />
          </Field>
          {addCred.isSuccess && <Alert kind="success">Listo: ya puedes iniciar sesión con tu correo.</Alert>}
          {addCred.isError && <Alert kind="error">{errorMessage(addCred.error)}</Alert>}
          <button type="submit" className="btn-outline" disabled={addCred.isPending}>
            Guardar acceso
          </button>
        </form>
      )}
    </div>
  );
}
