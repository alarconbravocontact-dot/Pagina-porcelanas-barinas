import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CURRENCIES,
  PAYMENT_METHOD_KINDS,
  PAYMENT_METHOD_LABELS,
  ROLES,
  localDateString,
  manualRateSchema,
  paymentMethodInputSchema,
  sellerCreateSchema,
  type Role,
} from '@porcelanas/shared';
import { api, ApiError, errorMessage, toQuery } from '../../lib/api';
import type { PaymentMethod, RateStatus } from '../../lib/types';
import { formatDateTime, formatRate, formatShortDate } from '../../lib/format';
import { Alert, Badge, EmptyState, ErrorState, Field, PageHeader, Pagination, Spinner } from '../../components/ui';
import { useSession } from '../../hooks/session';
import { useSettings } from '../../hooks/data';

function issuesToFields(issues: { path: (string | number)[]; message: string }[]) {
  const f: Record<string, string> = {};
  for (const i of issues) f[i.path.join('.')] ??= i.message;
  return f;
}

// ------------------------------------------------------------------ Vendedores
interface AdminSeller {
  id: string;
  fullName: string;
  displayName: string;
  phone: string;
  bio: string | null;
  city: string;
  branch: string;
  publicPhone: string;
  whatsapp: string;
  publicEmail: string;
  active: boolean;
  canReviewPayments: boolean;
  canViewProofs: boolean;
  user: { id: string; email: string; active: boolean; lastLoginAt: string | null; pendingActivation: boolean };
  _count: { orders: number };
}

export function AdminSellers() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-sellers'], queryFn: () => api<AdminSeller[]>('/api/admin/sellers') });
  const EMPTY = { fullName: '', displayName: '', email: '', phone: '', password: '', canReviewPayments: false, canViewProofs: true, city: '', branch: '', publicPhone: '', publicEmail: '' };
  const [form, setForm] = useState(EMPTY);
  const [links, setLinks] = useState<Record<string, string>>({});
  const activation = useMutation({
    mutationFn: (userId: string) => api<{ path: string; expiresInHours: number }>(`/api/admin/users/${userId}/activation-link`, { method: 'POST', body: {} }),
    onSuccess: (r, userId) => setLinks((l) => ({ ...l, [userId]: `${window.location.origin}${r.path}` })),
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: () => api('/api/admin/sellers', { body: form }),
    onSuccess: () => {
      setForm(EMPTY);
      void qc.invalidateQueries({ queryKey: ['admin-sellers'] });
      void qc.invalidateQueries({ queryKey: ['sellers'] });
    },
    onError: (e) => e instanceof ApiError && setFields(e.fields),
  });
  const update = useMutation({
    mutationFn: (s: AdminSeller) =>
      api(`/api/admin/sellers/${s.id}`, {
        method: 'PUT',
        body: { displayName: s.displayName, phone: s.phone, active: s.active, canReviewPayments: s.canReviewPayments, canViewProofs: s.canViewProofs, bio: s.bio ?? undefined, city: s.city, branch: s.branch, publicPhone: s.publicPhone, publicEmail: s.publicEmail },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-sellers'] });
      void qc.invalidateQueries({ queryKey: ['sellers'] });
    },
  });
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div>
      <PageHeader title="Vendedores" subtitle="Solo los vendedores activos aparecen en el selector obligatorio del checkout." />
      {q.data?.filter((s) => s.active).length === 0 && <Alert kind="warning" className="mb-4">No hay vendedores activos: los clientes no pueden confirmar operaciones.</Alert>}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {q.isLoading && <Spinner />}
          {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
          {q.data?.length === 0 && <EmptyState title="Aún no hay vendedores" />}
          {update.isError && <Alert kind="error">{errorMessage(update.error)}</Alert>}
          {q.data?.map((s) => (
            <div key={s.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {s.displayName} <span className="text-sm font-normal text-ink-muted">({s.fullName})</span>
                  </p>
                  <p className="text-xs text-ink-muted">
                    {s.user.email} · {s.phone} · {s._count.orders} operaciones · último acceso {s.user.lastLoginAt ? formatDateTime(s.user.lastLoginAt) : 'nunca'}
                  </p>
                </div>
                <span className="flex gap-1">
                  {s.user.pendingActivation && <Badge color="amber">Pendiente de activación</Badge>}
                  <Badge color={s.active ? 'green' : 'red'}>{s.active ? 'Activo' : 'Desactivado'}</Badge>
                </span>
              </div>
              <p className="mt-2 text-xs text-ink-soft">
                Contacto público: {[s.branch || s.city, s.whatsapp && `WhatsApp +${s.whatsapp}`, s.publicEmail].filter(Boolean).join(' · ') || 'sin datos públicos'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" className="btn-outline btn-sm" onClick={() => activation.mutate(s.user.id)} disabled={activation.isPending}>
                  {s.user.pendingActivation ? 'Generar enlace de activación' : 'Enlace para restablecer contraseña'}
                </button>
                {links[s.user.id] && (
                  <span className="text-xs">
                    Válido 72 h, un solo uso: <code className="break-all bg-stone-100 px-1">{links[s.user.id]}</code>
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={s.active} onChange={(e) => update.mutate({ ...s, active: e.target.checked })} /> Activo
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={s.canReviewPayments} onChange={(e) => update.mutate({ ...s, canReviewPayments: e.target.checked })} /> Puede verificar pagos
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={s.canViewProofs} onChange={(e) => update.mutate({ ...s, canViewProofs: e.target.checked })} /> Puede ver comprobantes
                </label>
              </div>
            </div>
          ))}
        </div>
        <form
          className="card h-fit space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const r = sellerCreateSchema.safeParse(form);
            if (!r.success) return setFields(issuesToFields(r.error.issues));
            setFields({});
            create.mutate();
          }}
          noValidate
        >
          <h2 className="text-lg">Nuevo vendedor</h2>
          {create.isSuccess && <Alert kind="success">Vendedor creado. Si no definió contraseña, genere su enlace de activación.</Alert>}
          {create.isError && <Alert kind="error">{errorMessage(create.error)}</Alert>}
          <Field label="Nombre completo" htmlFor="s-fn" error={fields.fullName}>
            <input id="s-fn" className="input" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
          </Field>
          <Field label="Nombre visible para clientes" htmlFor="s-dn" error={fields.displayName}>
            <input id="s-dn" className="input" value={form.displayName} onChange={(e) => set('displayName', e.target.value)} />
          </Field>
          <Field label="Correo (usuario)" htmlFor="s-em" error={fields.email}>
            <input id="s-em" type="email" className="input" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Teléfono" htmlFor="s-ph" error={fields.phone}>
            <input id="s-ph" className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Ciudad" htmlFor="s-city" error={fields.city}>
            <input id="s-city" className="input" value={form.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="Sede de referencia" htmlFor="s-branch" error={fields.branch}>
            <input id="s-branch" className="input" value={form.branch} onChange={(e) => set('branch', e.target.value)} />
          </Field>
          <Field label="Teléfono / WhatsApp público" htmlFor="s-pph" error={fields.publicPhone} hint="Se convierte a +58 sin el 0 inicial para el enlace de WhatsApp.">
            <input id="s-pph" className="input" value={form.publicPhone} onChange={(e) => set('publicPhone', e.target.value)} />
          </Field>
          <Field label="Correo público" htmlFor="s-pem" error={fields.publicEmail}>
            <input id="s-pem" type="email" className="input" value={form.publicEmail} onChange={(e) => set('publicEmail', e.target.value)} />
          </Field>
          <Field label="Contraseña inicial (opcional)" htmlFor="s-pw" error={fields.password} hint="Déjela vacía para que el vendedor la defina con un enlace de activación.">
            <input id="s-pw" type="password" autoComplete="new-password" className="input" value={form.password} onChange={(e) => set('password', e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.canReviewPayments} onChange={(e) => set('canReviewPayments', e.target.checked)} /> Puede verificar pagos
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.canViewProofs} onChange={(e) => set('canViewProofs', e.target.checked)} /> Puede ver comprobantes
          </label>
          <button type="submit" className="btn-primary w-full" disabled={create.isPending}>
            Crear vendedor
          </button>
        </form>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Usuarios
interface AdminUser {
  id: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  customer: { fullName: string; phone: string } | null;
  seller: { id: string; displayName: string; active: boolean } | null;
}

const ROLE_LABELS: Record<Role, string> = { ADMIN: 'Administrador', SELLER: 'Vendedor', CUSTOMER: 'Cliente' };

export function AdminUsers() {
  const qc = useQueryClient();
  const { user: me } = useSession();
  const [f, setF] = useState({ q: '', role: '' });
  const q = useQuery({ queryKey: ['admin-users', f], queryFn: () => api<AdminUser[]>(`/api/admin/users${toQuery(f)}`) });
  const update = useMutation({
    mutationFn: (u: { id: string; role: Role; active: boolean }) => api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { role: u.role, active: u.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
  return (
    <div>
      <PageHeader title="Usuarios y roles" subtitle="Administrador: acceso total. Vendedor: operaciones asignadas y chat (más permisos opcionales). Cliente: su propia cuenta." />
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Correo o nombre" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Buscar" />
        <select className="input w-auto" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} aria-label="Rol">
          <option value="">Todos los roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      {update.isError && <Alert kind="error" className="mb-3">{errorMessage(update.error)}</Alert>}
      {q.isLoading && <Spinner />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Alta</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.email}
                    <p className="text-xs text-ink-muted">{u.customer?.fullName ?? u.seller?.displayName ?? ''}</p>
                  </td>
                  <td>
                    <select className="input w-auto py-1" value={u.role} disabled={u.id === me?.id} onChange={(e) => update.mutate({ id: u.id, role: e.target.value as Role, active: u.active })} aria-label={`Rol de ${u.email}`}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={u.active} disabled={u.id === me?.id} onChange={(e) => update.mutate({ id: u.id, role: u.role, active: e.target.checked })} /> {u.active ? 'Activo' : 'Desactivado'}
                    </label>
                  </td>
                  <td className="text-xs text-ink-muted">{formatDateTime(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Tasa BCV
interface RateRow {
  id: string;
  rate: string;
  source: 'BCV_AUTO' | 'MANUAL';
  sourceUrl: string | null;
  sourceNote: string | null;
  effectiveDate: string;
  createdAt: string;
  createdBy: string | null;
}

export function AdminRates() {
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const q = useQuery({ queryKey: ['admin-rates'], queryFn: () => api<{ current: RateStatus | null; history: RateRow[] }>('/api/admin/rates') });
  const [form, setForm] = useState({ rate: '', effectiveDate: localDateString(new Date(), settings?.store.timezone), sourceNote: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-rates'] });
    void qc.invalidateQueries({ queryKey: ['rate'] });
  };
  const add = useMutation({ mutationFn: () => api('/api/admin/rates', { body: form }), onSuccess: () => { setForm({ ...form, rate: '', sourceNote: '' }); refresh(); } });
  const fetchBcv = useMutation({ mutationFn: () => api<{ ok: boolean; error?: string; rate?: string; created?: boolean }>('/api/admin/rates/fetch', { method: 'POST', body: {} }), onSuccess: refresh });
  const cur = q.data?.current;
  return (
    <div>
      <PageHeader title="Tasa BCV" subtitle="Cada cotización y operación guarda la tasa utilizada. Las operaciones confirmadas conservan su tasa original." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="text-lg">Tasa vigente</h2>
            {q.isLoading && <Spinner />}
            {cur ? (
              <div className="mt-2 text-sm">
                <p className="font-display text-3xl">Bs. {formatRate(cur.rate)}</p>
                <p className="mt-1 text-ink-muted">Fecha valor {formatShortDate(cur.effectiveDate)}</p>
                <p className="text-ink-muted">
                  {cur.source === 'MANUAL' ? `Manual por ${cur.createdBy}` : 'Consulta automática'} · registrada {formatDateTime(cur.createdAt)}
                </p>
                {cur.stale ? <Alert kind="warning" className="mt-2">Desactualizada ({cur.ageHours} h). {settings ? '' : ''}</Alert> : <Badge color="green">Dentro de la vigencia configurada</Badge>}
              </div>
            ) : (
              !q.isLoading && <Alert kind="error" className="mt-2">No hay tasa registrada. Las compras no pueden confirmarse.</Alert>
            )}
          </section>
          <form
            className="card space-y-3 p-5"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              const r = manualRateSchema.safeParse(form);
              if (!r.success) return setFields(issuesToFields(r.error.issues));
              setFields({});
              add.mutate();
            }}
            noValidate
          >
            <h2 className="text-lg">Registrar tasa manual</h2>
            <p className="text-xs text-ink-muted">Ingrese solo tasas verificadas en la publicación oficial. Queda registrado su usuario.</p>
            {add.isSuccess && <Alert kind="success">Tasa registrada.</Alert>}
            {add.isError && <Alert kind="error">{errorMessage(add.error)}</Alert>}
            <Field label="Bs por 1 USD" htmlFor="r-rate" error={fields.rate}>
              <input id="r-rate" className="input" inputMode="decimal" placeholder="Ej.: 36,5432" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
            </Field>
            <Field label="Fecha valor" htmlFor="r-date" error={fields.effectiveDate}>
              <input id="r-date" type="date" className="input" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
            </Field>
            <Field label="Fuente / referencia" htmlFor="r-note" error={fields.sourceNote}>
              <input id="r-note" className="input" placeholder="Ej.: bcv.org.ve, publicación del día" value={form.sourceNote} onChange={(e) => setForm({ ...form, sourceNote: e.target.value })} />
            </Field>
            <button type="submit" className="btn-primary w-full" disabled={add.isPending}>
              Registrar
            </button>
          </form>
          <section className="card p-5">
            <h2 className="text-lg">Consulta automática</h2>
            <p className="mt-1 text-xs text-ink-muted">Lee la tasa del portal configurado en Configuración → Tasa. Solo se registra si la respuesta se pudo leer y validar.</p>
            <button type="button" className="btn-outline btn-sm mt-3" onClick={() => fetchBcv.mutate()} disabled={fetchBcv.isPending}>
              {fetchBcv.isPending ? 'Consultando…' : 'Consultar ahora'}
            </button>
            {fetchBcv.data && (fetchBcv.data.ok ? <Alert kind="success" className="mt-2">Tasa leída: {fetchBcv.data.rate} {fetchBcv.data.created ? '(registrada)' : '(ya existía)'}</Alert> : <Alert kind="error" className="mt-2">{fetchBcv.data.error}</Alert>)}
            {fetchBcv.isError && <Alert kind="error" className="mt-2">{errorMessage(fetchBcv.error)}</Alert>}
          </section>
        </div>
        <section className="card overflow-x-auto p-0 lg:col-span-2">
          <table className="table-base">
            <thead>
              <tr>
                <th>Fecha valor</th>
                <th className="text-right">Tasa</th>
                <th>Fuente</th>
                <th>Registrada</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.history.map((r) => (
                <tr key={r.id}>
                  <td>{formatShortDate(r.effectiveDate)}</td>
                  <td className="text-right font-mono">{formatRate(r.rate)}</td>
                  <td>
                    {r.source === 'MANUAL' ? 'Manual' : 'Automática'}
                    <p className="text-xs text-ink-muted">{r.sourceNote}</p>
                  </td>
                  <td className="text-xs text-ink-muted">
                    {formatDateTime(r.createdAt)}
                    <br />
                    {r.createdBy ?? 'sistema'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {q.data?.history.length === 0 && <p className="p-6 text-center text-sm text-ink-muted">Sin registros.</p>}
        </section>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Métodos de pago
export function AdminPaymentMethods() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-methods'], queryFn: () => api<PaymentMethod[]>('/api/admin/payment-methods') });
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  return (
    <div>
      <PageHeader title="Métodos de pago" subtitle="Las instrucciones se muestran a los clientes al pagar. Solo los métodos activos se ofrecen." actions={<button type="button" className="btn-primary" onClick={() => setEditing({ id: '', kind: 'PAGO_MOVIL', name: '', currency: 'VES', instructions: '', receivingDetails: '', buyerNote: '', proofInstructions: '', requiresProof: true, configured: false, active: false, sortOrder: 0 })}>Nuevo método</button>} />
      {q.isLoading && <Spinner />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          {q.data?.map((m) => (
            <button key={m.id} type="button" onClick={() => setEditing(m)} className={`card block w-full p-4 text-left hover:border-ink ${editing?.id === m.id ? 'border-ink' : ''}`}>
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  {m.name} <span className="text-xs text-ink-muted">({PAYMENT_METHOD_LABELS[m.kind]} · {m.currency})</span>
                </p>
                <span className="flex gap-1">
                  {!m.configured && <Badge color="amber">Requiere configuración</Badge>}
                  <Badge color={m.active ? 'green' : 'gray'}>{m.active ? 'Activo' : 'Inactivo'}</Badge>
                </span>
              </div>
              <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-ink-muted">{m.instructions}</p>
            </button>
          ))}
        </div>
        {editing && <MethodForm key={editing.id || 'new'} method={editing} onDone={() => { setEditing(null); void qc.invalidateQueries({ queryKey: ['admin-methods'] }); void qc.invalidateQueries({ queryKey: ['payment-methods'] }); }} />}
      </div>
    </div>
  );
}

function MethodForm({ method, onDone }: { method: PaymentMethod; onDone: () => void }) {
  const [form, setForm] = useState({ ...method });
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: (body: unknown) => (method.id ? api(`/api/admin/payment-methods/${method.id}`, { method: 'PUT', body }) : api('/api/admin/payment-methods', { body })),
    onSuccess: onDone,
  });
  return (
    <form
      className="card h-fit space-y-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const r = paymentMethodInputSchema.safeParse(form);
        if (!r.success) return setFields(issuesToFields(r.error.issues));
        setFields({});
        save.mutate(r.data);
      }}
      noValidate
    >
      <h2 className="text-lg">{method.id ? 'Editar método' : 'Nuevo método'}</h2>
      {save.isError && <Alert kind="error">{errorMessage(save.error)}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="m-kind">
          <select id="m-kind" className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as PaymentMethod['kind'] })}>
            {PAYMENT_METHOD_KINDS.map((k) => (
              <option key={k} value={k}>
                {PAYMENT_METHOD_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Moneda en que se recibe" htmlFor="m-cur">
          <select id="m-cur" className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as PaymentMethod['currency'] })}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c === 'VES' ? 'Bolívares (VES)' : 'Dólares (USD)'}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Nombre visible" htmlFor="m-name" error={fields.name}>
        <input id="m-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Instrucciones para pagar" htmlFor="m-ins" error={fields.instructions} hint="Pasos que debe seguir el comprador.">
        <textarea id="m-ins" className="input min-h-[100px]" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
      </Field>
      <Field
        label="Datos de recepción"
        htmlFor="m-rec"
        error={fields.receivingDetails}
        hint={form.kind === 'CASH' ? 'Opcional para efectivo.' : 'Banco, titular, documento, teléfono, correo Zelle o ID de Binance. Mientras esté vacío, el método se muestra como "pendiente de configuración" y no se puede usar.'}
      >
        <textarea id="m-rec" className="input min-h-[100px]" value={form.receivingDetails} onChange={(e) => setForm({ ...form, receivingDetails: e.target.value })} />
      </Field>
      <Field label="Texto adicional para el comprador" htmlFor="m-note" error={fields.buyerNote}>
        <input id="m-note" className="input" value={form.buyerNote} onChange={(e) => setForm({ ...form, buyerNote: e.target.value })} />
      </Field>
      <Field label="Requisitos del comprobante" htmlFor="m-proof" error={fields.proofInstructions}>
        <input id="m-proof" className="input" value={form.proofInstructions} onChange={(e) => setForm({ ...form, proofInstructions: e.target.value })} />
      </Field>
      <Field label="Orden en el checkout" htmlFor="m-order">
        <input id="m-order" type="number" min={0} className="input w-28" value={form.sortOrder ?? 0} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
      </Field>
      {form.active && form.kind !== 'CASH' && !form.receivingDetails.trim() && (
        <Alert kind="warning">Activo pero sin datos de recepción: se mostrará deshabilitado como “pendiente de configuración”.</Alert>
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.requiresProof} onChange={(e) => setForm({ ...form, requiresProof: e.target.checked })} /> Exige comprobante
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Activo
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={save.isPending}>
          Guardar
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cerrar
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ Auditoría
interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  data: unknown;
  ip: string | null;
  createdAt: string;
  actor: { email: string; role: Role } | null;
}

export function AdminAudit() {
  const [f, setF] = useState({ entityType: '', page: 1 });
  const q = useQuery({ queryKey: ['audit', f], queryFn: () => api<{ total: number; page: number; pageSize: number; items: AuditRow[] }>(`/api/admin/audit${toQuery(f)}`) });
  return (
    <div>
      <PageHeader title="Auditoría" subtitle="Registro de operaciones sensibles: precios, inventario, tasas, pagos, configuración y permisos." />
      <select className="input mb-4 w-auto" value={f.entityType} onChange={(e) => setF({ entityType: e.target.value, page: 1 })} aria-label="Entidad">
        <option value="">Todas las entidades</option>
        {['Product', 'Payment', 'ExchangeRate', 'Order', 'Seller', 'User', 'BusinessSetting', 'PaymentMethod', 'BlockedPickupDate', 'Category'].map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      {q.isLoading && <Spinner />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Entidad</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap text-xs">{formatDateTime(a.createdAt)}</td>
                  <td className="text-xs">{a.actor?.email ?? 'sistema'}</td>
                  <td className="font-mono text-xs">{a.action}</td>
                  <td className="text-xs">
                    {a.entityType}
                    <span className="block max-w-[10rem] truncate text-ink-muted">{a.entityId}</span>
                  </td>
                  <td className="max-w-md">
                    <code className="block max-h-24 overflow-auto whitespace-pre-wrap break-all text-[11px] text-ink-muted">{a.data ? JSON.stringify(a.data) : ''}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.data && <Pagination page={q.data.page} totalPages={Math.ceil(q.data.total / q.data.pageSize)} onPage={(p) => setF({ ...f, page: p })} />}
    </div>
  );
}

export { issuesToFields };
