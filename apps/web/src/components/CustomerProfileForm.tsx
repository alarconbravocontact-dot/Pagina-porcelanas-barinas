import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { customerProfileSchema } from '@porcelanas/shared';
import { api, ApiError, errorMessage } from '../lib/api';
import type { CustomerProfile } from '../lib/types';
import { Alert, Field } from './ui';

const EMPTY = { fullName: '', city: '', addressRef: '', phone: '', documentId: '' };

/**
 * Los cuatro datos obligatorios para comprar. Sin sesión crea el perfil y abre una sesión
 * segura en este dispositivo; con sesión de cliente corrige el perfil propio.
 */
export function CustomerProfileForm({
  initial,
  onSaved,
  submitLabel = 'Guardar y continuar',
  onCancel,
  submitTo,
}: {
  initial?: Partial<CustomerProfile> | null;
  onSaved?: (p: CustomerProfile) => void;
  submitLabel?: string;
  onCancel?: () => void;
  /** Ruta POST alternativa (p. ej. aceptar una invitación al portal). */
  submitTo?: string;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY, ...pick(initial) });
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: (body: typeof form) =>
      api<{ created: boolean; profile: CustomerProfile }>(submitTo ?? '/api/customers/profile', { method: submitTo ? 'POST' : 'PUT', body }),
    onSuccess: async (r) => {
      qc.setQueryData(['customer-profile'], r.profile);
      await qc.invalidateQueries({ queryKey: ['session'] });
      await qc.invalidateQueries({ queryKey: ['cart'] });
      onSaved?.(r.profile);
    },
    onError: (e) => e instanceof ApiError && setFields(e.fields),
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = customerProfileSchema.safeParse(form);
    if (!r.success) {
      const f: Record<string, string> = {};
      for (const i of r.error.issues) f[i.path.join('.')] ??= i.message;
      return setFields(f);
    }
    setFields({});
    save.mutate(form);
  };
  const taken = save.error instanceof ApiError && save.error.code === 'DOCUMENT_REGISTERED';
  return (
    <form onSubmit={submit} className="space-y-5" noValidate aria-label="Tus datos">
      {save.isError && (
        <Alert kind={taken ? 'warning' : 'error'} title={taken ? 'Esta cédula ya está registrada' : undefined}>
          {errorMessage(save.error)}
          {taken && (
            <span className="mt-1 block">
              <Link to="/ingresar?next=/checkout" className="underline">
                Iniciar sesión
              </Link>{' '}
              ·{' '}
              <Link to="/contacto" className="underline">
                Contactar a un vendedor
              </Link>
            </span>
          )}
        </Alert>
      )}
      <Field label="Nombre completo" htmlFor="cp-name" error={fields.fullName}>
        <input id="cp-name" className="input text-base" autoComplete="name" value={form.fullName} onChange={set('fullName')} placeholder="Nombre y apellido" />
      </Field>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Ciudad" htmlFor="cp-city" error={fields.city}>
          <input id="cp-city" className="input text-base" autoComplete="address-level2" value={form.city} onChange={set('city')} placeholder="Ej.: Barinas" />
        </Field>
        <Field label="Zona o dirección de referencia" htmlFor="cp-addr" error={fields.addressRef}>
          <input id="cp-addr" className="input text-base" autoComplete="street-address" value={form.addressRef} onChange={set('addressRef')} placeholder="Urbanización, sector o punto de referencia" />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Teléfono" htmlFor="cp-phone" error={fields.phone} hint="Con código de país si no es de Venezuela.">
          <input id="cp-phone" className="input text-base" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} placeholder="0412 1234567" />
        </Field>
        <Field label="Cédula de identidad" htmlFor="cp-doc" error={fields.documentId}>
          <input id="cp-doc" className="input text-base" inputMode="text" autoComplete="off" value={form.documentId} onChange={set('documentId')} placeholder="V-12345678" />
        </Field>
      </div>
      <p className="text-xs text-ink-muted">Usamos estos datos solo para tu orden y para que tu vendedor te atienda. Tu cédula no se muestra completa en la plataforma.</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary py-3" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

function pick(p?: Partial<CustomerProfile> | null) {
  if (!p) return {};
  return { fullName: p.fullName ?? '', city: p.city ?? '', addressRef: p.addressRef ?? '', phone: p.phone ?? '', documentId: p.documentId ?? '' };
}
