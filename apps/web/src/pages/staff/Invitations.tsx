import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, MessageCircle } from 'lucide-react';
import { api, ApiError, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useSession } from '../../hooks/session';
import { useSellers } from '../../hooks/data';
import { Alert, Badge, EmptyState, ErrorState, Field, PageHeader, Spinner } from '../../components/ui';

interface CreatedInvite {
  id: string;
  url: string;
  expiresAt: string;
  message: string;
  whatsappUrl: string;
}

interface InviteRow {
  id: string;
  name: string;
  phone: string;
  seller: string;
  status: 'PENDING' | 'USED' | 'EXPIRED' | 'REVOKED';
  expiresAt: string;
  usedAt: string | null;
  customerName: string | null;
  createdAt: string;
}

const STATUS: Record<InviteRow['status'], { label: string; color: 'amber' | 'green' | 'gray' | 'red' }> = {
  PENDING: { label: 'Pendiente', color: 'amber' },
  USED: { label: 'Usada', color: 'green' },
  EXPIRED: { label: 'Vencida', color: 'gray' },
  REVOKED: { label: 'Anulada', color: 'red' },
};

/** Enlaces personales de un solo uso para que cada cliente entre al portal privado. */
export function StaffInvitations() {
  const { user } = useSession();
  const isAdmin = user?.role === 'ADMIN';
  const sellers = useSellers();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', phone: '', sellerId: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const list = useQuery({ queryKey: ['invites'], queryFn: () => api<InviteRow[]>('/api/staff/invites') });
  const create = useMutation({
    mutationFn: () => api<CreatedInvite>('/api/staff/invites', { body: { name: form.name || undefined, phone: form.phone || undefined, sellerId: form.sellerId || undefined } }),
    onSuccess: () => {
      setFields({});
      setCopied(false);
      void qc.invalidateQueries({ queryKey: ['invites'] });
    },
    onError: (e) => e instanceof ApiError && setFields(e.fields),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/api/staff/invites/${id}/revoke`, { body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites'] }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const inv = create.data;

  return (
    <div>
      <PageHeader title="Invitaciones al portal" subtitle="Cada cliente entra al portal privado con un enlace personal de un solo uso. Envíaselo por WhatsApp." />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
        <section className="card h-fit p-5" data-tour="invite-form">
          <h2 className="text-lg">Nuevo enlace</h2>
          <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
            <Field label="Nombre del cliente (opcional)" htmlFor="inv-name" hint="Aparece en el saludo de bienvenida y en tu lista.">
              <input id="inv-name" className="input" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Teléfono del cliente (opcional)" htmlFor="inv-phone" error={fields.phone} hint="Con teléfono, el botón abre WhatsApp directo en su chat.">
              <input id="inv-phone" className="input" inputMode="tel" value={form.phone} maxLength={30} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            {isAdmin && (
              <Field label="Vendedor que lo atenderá" htmlFor="inv-seller">
                <select id="inv-seller" className="input" value={form.sellerId} onChange={(e) => setForm({ ...form, sellerId: e.target.value })}>
                  <option value="">{sellers.data?.length === 1 ? sellers.data[0]!.displayName : 'Seleccione…'}</option>
                  {sellers.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {create.isError && <Alert kind="error">{errorMessage(create.error)}</Alert>}
            <button type="submit" className="btn-primary w-full" disabled={create.isPending}>
              Generar enlace personal
            </button>
          </form>
          {inv && (
            <div className="mt-6 border-t border-stone-200 pt-5" data-testid="invite-created" data-tour="invite-created">
              <p className="eyebrow">Enlace listo · vence {formatDateTime(inv.expiresAt)}</p>
              <p className="mt-2 break-all border border-stone-200 bg-stone-50 p-3 font-mono text-xs" data-testid="invite-url">
                {inv.url}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={inv.whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm">
                  <MessageCircle className="h-4 w-4" aria-hidden /> Enviar por WhatsApp
                </a>
                <button type="button" className="btn-outline btn-sm" onClick={() => void copy(inv.url)}>
                  {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? 'Copiado' : 'Copiar enlace'}
                </button>
              </div>
              <p className="mt-3 text-xs text-ink-muted">Mensaje que se envía: «{inv.message}»</p>
            </div>
          )}
        </section>

        <section className="min-w-0" data-tour="invite-list">
          {list.isLoading && <Spinner />}
          {list.isError && <ErrorState error={list.error} onRetry={() => list.refetch()} />}
          {list.data?.length === 0 && <EmptyState title="Aún no has invitado clientes">Genera el primer enlace y envíalo por WhatsApp.</EmptyState>}
          {list.data && list.data.length > 0 && (
            <div className="card overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Estado</th>
                    {isAdmin && <th>Vendedor</th>}
                    <th>Creada</th>
                    <th>Vence / usada</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <p>{r.customerName ?? (r.name || 'Sin nombre')}</p>
                        {r.phone && <p className="text-xs text-ink-muted">{r.phone}</p>}
                      </td>
                      <td>
                        <Badge color={STATUS[r.status].color}>{STATUS[r.status].label}</Badge>
                      </td>
                      {isAdmin && <td>{r.seller}</td>}
                      <td className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</td>
                      <td className="whitespace-nowrap text-xs">{r.usedAt ? formatDateTime(r.usedAt) : formatDateTime(r.expiresAt)}</td>
                      <td className="text-right">
                        {r.status === 'PENDING' && (
                          <button type="button" className="btn-ghost btn-sm" disabled={revoke.isPending} onClick={() => revoke.mutate(r.id)}>
                            Anular
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
