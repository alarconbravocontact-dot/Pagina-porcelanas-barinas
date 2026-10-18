import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { centsToDecimalString, localDateString, paymentSubmitSchema, usdCentsToVesCents } from '@porcelanas/shared';
import { api, ApiError, errorMessage, newIdempotencyKey } from '../lib/api';
import { usePaymentMethods, useSettings } from '../hooks/data';
import type { Order } from '../lib/types';
import { formatUSD, formatVES } from '../lib/format';
import { Alert, Field } from './ui';

const ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

export function validateProofFile(file: File | null, maxMB: number): string | null {
  if (!file) return null;
  if (!/\.(jpe?g|png|webp)$/i.test(file.name) || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Formato no permitido. Use JPG, PNG o WebP.';
  if (file.size > maxMB * 1024 * 1024) return `El archivo supera el máximo de ${maxMB} MB.`;
  return null;
}

/** Registro de un pago con comprobante. El pago queda pendiente hasta la verificación manual. */
export function PaymentForm({ order }: { order: Order }) {
  const qc = useQueryClient();
  const methods = usePaymentMethods();
  const { data: settings } = useSettings();
  const maxMB = settings?.uploads.maxProofMB ?? 5;
  const [methodId, setMethodId] = useState(order.preferredMethod?.id ?? '');
  const method = methods.data?.find((m) => m.id === methodId);
  const suggestedUsd = order.paidCents < order.requiredCents ? order.requiredCents - order.paidCents : order.balanceCents;
  const suggested = method?.currency === 'VES' ? usdCentsToVesCents(suggestedUsd, order.rateValue) : suggestedUsd;
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState(localDateString(new Date(), settings?.store.timezone));
  const [payerName, setPayerName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const idem = useRef(newIdempotencyKey());
  const fileInput = useRef<HTMLInputElement>(null);

  const m = useMutation({
    mutationFn: (form: FormData) => api<{ paymentId: string; status: string }>(`/api/orders/${order.code}/payments`, { form, idempotencyKey: idem.current }),
    onSuccess: () => {
      idem.current = newIdempotencyKey();
      setDone(true);
      setAmount('');
      setReference('');
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      void qc.invalidateQueries({ queryKey: ['order', order.code] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setFields(err.fields);
        if (err.status !== 0) idem.current = newIdempotencyKey();
      }
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setDone(false);
    const input = { paymentMethodId: methodId, amount: amount.replace(',', '.'), currency: method?.currency ?? 'USD', reference, paidAt, payerName: payerName || undefined };
    const parsed = paymentSubmitSchema.safeParse(input);
    const f: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) f[i.path.join('.')] ??= i.message;
    const fileErr = validateProofFile(file, maxMB) ?? (method?.requiresProof && !file ? 'Adjunte el comprobante de pago' : null);
    if (fileErr) f.file = fileErr;
    setFields(f);
    if (Object.keys(f).length) return;
    const form = new FormData();
    for (const [k, v] of Object.entries(parsed.data!)) if (v !== undefined) form.append(k, String(v));
    if (file) form.append('file', file);
    m.mutate(form);
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {done && <Alert kind="success" title="Pago registrado">Lo verificaremos manualmente y te notificaremos el resultado. Registrar un comprobante no confirma el pago.</Alert>}
      {m.isError && <Alert kind="error">{errorMessage(m.error)}</Alert>}
      <Field label="Método de pago" htmlFor="pf-method" error={fields.paymentMethodId}>
        <select id="pf-method" className="input" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
          <option value="">Seleccione…</option>
          {methods.data?.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} ({x.currency === 'VES' ? 'Bs' : 'USD'})
            </option>
          ))}
        </select>
      </Field>
      {method && (
        <div className="rounded-md bg-stone-50 p-3 text-sm">
          <p className="whitespace-pre-line text-ink-soft">{method.instructions}</p>
          <p className="mt-2 text-xs text-ink-muted">
            Importe sugerido: <strong>{method.currency === 'VES' ? formatVES(suggested) : formatUSD(suggested)}</strong>
            {method.currency === 'VES' && ' (calculado con la tasa fijada en su operación)'}
            <button type="button" className="ml-2 text-brass underline" onClick={() => setAmount(centsToDecimalString(suggested))}>
              usar
            </button>
          </p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Importe pagado (${method?.currency === 'VES' ? 'Bs' : 'USD'})`} htmlFor="pf-amount" error={fields.amount}>
          <input id="pf-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
        </Field>
        <Field label="Referencia de la operación" htmlFor="pf-ref" error={fields.reference}>
          <input id="pf-ref" className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Fecha del pago" htmlFor="pf-date" error={fields.paidAt}>
          <input id="pf-date" type="date" className="input" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </Field>
        <Field label="Titular (opcional)" htmlFor="pf-payer">
          <input id="pf-payer" className="input" value={payerName} onChange={(e) => setPayerName(e.target.value)} />
        </Field>
      </div>
      <Field label="Comprobante" htmlFor="pf-file" error={fields.file} hint={`JPG, PNG o WebP · máximo ${maxMB} MB`}>
        <input id="pf-file" ref={fileInput} type="file" accept={ACCEPT} className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-stone-200 file:px-3 file:py-2 file:text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
      <button type="submit" className="btn-primary" disabled={m.isPending}>
        <Upload className="h-4 w-4" aria-hidden /> {m.isPending ? 'Enviando…' : 'Registrar pago'}
      </button>
    </form>
  );
}

export function ReplaceProofForm({ paymentId, orderCode }: { paymentId: string; orderCode: string }) {
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => {
      const f = new FormData();
      f.append('file', file!);
      return api(`/api/payments/${paymentId}/proofs`, { form: f });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['order', orderCode] }),
  });
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const v = validateProofFile(file, settings?.uploads.maxProofMB ?? 5) ?? (file ? null : 'Seleccione un archivo');
        setErr(v);
        if (!v) m.mutate();
      }}
    >
      <input type="file" accept={ACCEPT} aria-label="Nuevo comprobante" className="text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button type="submit" className="btn-outline btn-sm" disabled={m.isPending}>
        {m.isPending ? 'Enviando…' : 'Reemplazar comprobante'}
      </button>
      {(err || m.isError) && <span className="text-xs text-red-700">{err ?? errorMessage(m.error)}</span>}
    </form>
  );
}
