import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { WEEKDAY_LABELS, settingsSchemas, type BusinessSettings, type SettingsKey } from '@porcelanas/shared';
import { api, ApiError, errorMessage } from '../../lib/api';
import { formatShortDate } from '../../lib/format';
import { Alert, ErrorState, Field, PageHeader, Spinner } from '../../components/ui';
import { issuesToFields } from './AdminMisc';

const SECTIONS: { key: SettingsKey | 'blocked' | 'categories'; label: string }[] = [
  { key: 'store', label: 'Sede y marca' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'pickup', label: 'Días, horarios y capacidad' },
  { key: 'blocked', label: 'Días bloqueados' },
  { key: 'reservation', label: 'Reservas y prepago' },
  { key: 'cancellation', label: 'Cancelaciones' },
  { key: 'quote', label: 'Cotizaciones' },
  { key: 'rate', label: 'Tasa BCV' },
  { key: 'uploads', label: 'Comprobantes' },
  { key: 'policies', label: 'Textos legales' },
  { key: 'faq', label: 'Preguntas frecuentes' },
  { key: 'categories', label: 'Ambientes (categorías)' },
];

export function AdminSettings() {
  const [section, setSection] = useState<(typeof SECTIONS)[number]['key']>('store');
  const q = useQuery({ queryKey: ['admin-settings'], queryFn: () => api<BusinessSettings>('/api/admin/settings') });
  return (
    <div>
      <PageHeader title="Configuración comercial" subtitle="Políticas y datos administrables. Los cambios se auditan y no alteran operaciones ya confirmadas." />
      <div className="mb-6 flex flex-wrap gap-2" data-tour="settings-sections">
        {SECTIONS.map((s) => (
          <button key={s.key} type="button" className={section === s.key ? 'btn-primary btn-sm' : 'btn-outline btn-sm'} onClick={() => setSection(s.key)}>
            {s.label}
          </button>
        ))}
      </div>
      {q.isLoading && <Spinner />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && (
        <div className="max-w-3xl">
          {section === 'blocked' ? <BlockedDates /> : section === 'categories' ? <Categories /> : <SectionForm key={section} sectionKey={section} value={q.data[section]} />}
        </div>
      )}
    </div>
  );
}

function SectionForm<K extends SettingsKey>({ sectionKey, value }: { sectionKey: K; value: BusinessSettings[K] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<BusinessSettings[K]>(value);
  const [fields, setFields] = useState<Record<string, string>>({});
  useEffect(() => setForm(value), [value]);
  const save = useMutation({
    mutationFn: () => api(`/api/admin/settings/${sectionKey}`, { method: 'PUT', body: form }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-settings'] });
      void qc.invalidateQueries({ queryKey: ['settings'] });
      void qc.invalidateQueries({ queryKey: ['rate'] });
    },
    onError: (e) => e instanceof ApiError && setFields(e.fields),
  });
  const f = form as Record<string, unknown>;
  const set = (k: string, v: unknown) => setForm((s) => ({ ...(s as object), [k]: v }) as BusinessSettings[K]);
  const text = (k: string, label: string, hint?: ReactNode, multiline = false) => (
    <Field label={label} htmlFor={`st-${k}`} error={fields[k]} hint={hint}>
      {multiline ? (
        <textarea id={`st-${k}`} className="input min-h-[160px]" value={String(f[k] ?? '')} onChange={(e) => set(k, e.target.value)} />
      ) : (
        <input id={`st-${k}`} className="input" value={String(f[k] ?? '')} onChange={(e) => set(k, e.target.value)} />
      )}
    </Field>
  );
  const num = (k: string, label: string, hint?: ReactNode) => (
    <Field label={label} htmlFor={`st-${k}`} error={fields[k]} hint={hint}>
      <input id={`st-${k}`} className="input" type="number" step="any" value={String(f[k] ?? '')} onChange={(e) => set(k, e.target.value === '' ? '' : Number(e.target.value))} />
    </Field>
  );
  const bool = (k: string, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={!!f[k]} onChange={(e) => set(k, e.target.checked)} /> {label}
    </label>
  );

  let body: ReactNode = null;
  switch (sectionKey) {
    case 'store':
      body = (
        <>
          {text('name', 'Nombre comercial')}
          {text('tagline', 'Lema o descripción breve')}
          {text('address', 'Dirección de la sede')}
          {text('city', 'Ciudad')}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {text('phone', 'Teléfono')}
            {text('email', 'Correo')}
          </div>
          {text('hoursText', 'Horario visible', 'Ej.: Lunes a viernes 8:00–17:00')}
          {text('mapUrl', 'Enlace a mapa (URL)')}
          {text('timezone', 'Zona horaria comercial (IANA)', 'Ej.: America/Caracas')}
          <HeroUpload current={String(f.heroImageUrl ?? '')} />
        </>
      );
      break;
    case 'whatsapp':
      body = (
        <>
          {text('number', 'Número de WhatsApp', 'Formato internacional sin + ni espacios (p. ej. 58412XXXXXXX). Vacío = botón oculto.')}
          {text('greeting', 'Mensaje prellenado por defecto')}
        </>
      );
      break;
    case 'pickup': {
      const weekdays = f.weekdays as BusinessSettings['pickup']['weekdays'];
      body = (
        <>
          <table className="table-base">
            <thead>
              <tr>
                <th>Día</th>
                <th>Atiende retiros</th>
                <th>Apertura</th>
                <th>Cierre</th>
              </tr>
            </thead>
            <tbody>
              {weekdays.map((d, i) => (
                <tr key={i}>
                  <td>{WEEKDAY_LABELS[i]}</td>
                  <td>
                    <input type="checkbox" checked={d.enabled} onChange={(e) => set('weekdays', weekdays.map((w, j) => (j === i ? { ...w, enabled: e.target.checked } : w)))} aria-label={`Atiende ${WEEKDAY_LABELS[i]}`} />
                  </td>
                  <td>
                    <input type="time" className="input py-1" value={d.open} onChange={(e) => set('weekdays', weekdays.map((w, j) => (j === i ? { ...w, open: e.target.value } : w)))} aria-label={`Apertura ${WEEKDAY_LABELS[i]}`} />
                  </td>
                  <td>
                    <input type="time" className="input py-1" value={d.close} onChange={(e) => set('weekdays', weekdays.map((w, j) => (j === i ? { ...w, close: e.target.value } : w)))} aria-label={`Cierre ${WEEKDAY_LABELS[i]}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {Object.keys(fields).some((k) => k.startsWith('weekdays')) && <p className="text-xs text-red-700">Revise los horarios: la apertura debe ser anterior al cierre.</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {num('capacityPerDay', 'Capacidad de retiros por día (operaciones)')}
            {num('minAdvanceHours', 'Anticipación mínima (horas)')}
            {num('maxDaysAheadPickup', 'Máx. días por adelantado (compra con retiro)')}
            {num('maxDaysAheadPrepay', 'Máx. días por adelantado (prepago)')}
          </div>
        </>
      );
      break;
    }
    case 'reservation':
      body = (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {num('holdHours', 'Vigencia de la reserva sin pago (horas)', 'Al vencer, el inventario se libera automáticamente.')}
            {num('prepayMinPercent', 'Prepago mínimo (%)')}
            {num('pickupGraceDays', 'Tolerancia tras la fecha de retiro (días)')}
          </div>
          {bool('extendWhilePaymentPending', 'No vencer mientras haya un pago pendiente de verificación')}
          {bool('autoCancelNoShow', 'Cancelar y liberar inventario automáticamente al vencer la tolerancia (los pagos acreditados quedan para gestión de reembolso)')}
        </>
      );
      break;
    case 'cancellation':
      body = (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {num('customerCancelMinHours', 'Cancelación en línea: anticipación (h)')}
            {num('rescheduleMinHours', 'Cambio de fecha: anticipación (h)')}
            {num('maxReschedules', 'Máximo de cambios de fecha')}
          </div>
          {text('policyText', 'Política de cancelación (texto público)', undefined, true)}
        </>
      );
      break;
    case 'quote':
      body = num('validityMinutes', 'Vigencia de las cotizaciones (minutos)', 'Dentro de este plazo se respeta la tasa cotizada si los precios no cambian.');
      break;
    case 'rate':
      body = (
        <>
          {bool('autoFetch', 'Consultar automáticamente la fuente configurada')}
          {text('sourceUrl', 'URL de la fuente', 'Portal del BCV. Si no es accesible, use el registro manual.')}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{num('maxAgeHours', 'Considerar desactualizada después de (horas)')}</div>
          {bool('blockWhenStale', 'Bloquear confirmaciones cuando la tasa esté desactualizada')}
        </>
      );
      break;
    case 'uploads':
      body = num('maxProofMB', 'Tamaño máximo de comprobantes (MB)', 'Formatos aceptados: JPG, PNG y WebP.');
      break;
    case 'policies':
      body = (
        <>
          {text('termsText', 'Condiciones comerciales adicionales', undefined, true)}
          {text('returnsText', 'Política de devoluciones', undefined, true)}
          {text('privacyText', 'Aviso de privacidad adicional', undefined, true)}
        </>
      );
      break;
    case 'faq': {
      const items = (f.items as { q: string; a: string }[]) ?? [];
      body = (
        <>
          <p className="text-xs text-ink-muted">Si la lista está vacía, el sitio muestra respuestas generadas a partir de la configuración vigente.</p>
          {items.map((it, i) => (
            <div key={i} className="space-y-2 rounded-none border border-stone-200 p-3">
              <div className="flex gap-2">
                <input className="input" placeholder="Pregunta" value={it.q} onChange={(e) => set('items', items.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} aria-label={`Pregunta ${i + 1}`} />
                <button type="button" className="btn-ghost px-2 text-red-700" onClick={() => set('items', items.filter((_, j) => j !== i))} aria-label="Eliminar pregunta">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <textarea className="input" placeholder="Respuesta" value={it.a} onChange={(e) => set('items', items.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} aria-label={`Respuesta ${i + 1}`} />
            </div>
          ))}
          <button type="button" className="btn-outline btn-sm" onClick={() => set('items', [...items, { q: '', a: '' }])}>
            Agregar pregunta
          </button>
        </>
      );
      break;
    }
  }

  return (
    <form
      className="card space-y-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        const r = settingsSchemas[sectionKey].safeParse(form);
        if (!r.success) return setFields(issuesToFields(r.error.issues));
        setFields({});
        save.mutate();
      }}
      noValidate
    >
      {save.isSuccess && <Alert kind="success">Configuración guardada.</Alert>}
      {save.isError && <Alert kind="error">{errorMessage(save.error)}</Alert>}
      {body}
      <button type="submit" className="btn-primary" disabled={save.isPending}>
        {save.isPending ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  );
}

function HeroUpload({ current }: { current: string }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const m = useMutation({
    mutationFn: () => {
      const f = new FormData();
      f.append('file', file!);
      return api('/api/admin/settings/hero-image', { form: f });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-settings'] });
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
  return (
    <div className="rounded-none border border-stone-200 p-3">
      <p className="label">Fotografía principal del inicio</p>
      {current ? <img src={current} alt="Imagen principal actual" className="mb-2 max-h-40 rounded-none object-cover" /> : <p className="mb-2 text-xs text-ink-muted">Sin imagen: se muestran fotografías del catálogo.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" accept="image/jpeg,image/png,image/webp" className="text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Imagen principal" />
        <button type="button" className="btn-outline btn-sm" disabled={!file || m.isPending} onClick={() => m.mutate()}>
          Subir
        </button>
      </div>
      {m.isError && <p className="mt-1 text-xs text-red-700">{errorMessage(m.error)}</p>}
      <p className="mt-1 text-xs text-ink-muted">Use solo fotografías propias o con licencia.</p>
    </div>
  );
}

function BlockedDates() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['blocked-dates'], queryFn: () => api<{ date: string; reason: string }[]>('/api/admin/pickup/blocked-dates') });
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const add = useMutation({
    mutationFn: () => api<{ affectedOrders: number }>('/api/admin/pickup/blocked-dates', { body: { date, reason } }),
    onSuccess: () => {
      setDate('');
      setReason('');
      void qc.invalidateQueries({ queryKey: ['blocked-dates'] });
    },
  });
  const del = useMutation({ mutationFn: (d: string) => api(`/api/admin/pickup/blocked-dates/${d}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['blocked-dates'] }) });
  return (
    <div className="card space-y-4 p-6">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (date && reason.trim().length >= 2) add.mutate();
        }}
      >
        <input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Fecha" />
        <input className="input flex-1" placeholder="Motivo (feriado, inventario…)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motivo" />
        <button type="submit" className="btn-primary" disabled={add.isPending}>
          Bloquear fecha
        </button>
      </form>
      {add.data && add.data.affectedOrders > 0 && <Alert kind="warning">Hay {add.data.affectedOrders} operación(es) activas en esa fecha. Contacte a los clientes para reprogramar.</Alert>}
      {add.isError && <Alert kind="error">{errorMessage(add.error)}</Alert>}
      {q.isLoading && <Spinner />}
      <ul className="divide-y divide-stone-100">
        {q.data?.map((b) => (
          <li key={b.date} className="flex items-center justify-between py-2 text-sm">
            <span>
              {formatShortDate(b.date)} — {b.reason}
            </span>
            <button type="button" className="btn-ghost btn-sm text-red-700" onClick={() => del.mutate(b.date)}>
              Desbloquear
            </button>
          </li>
        ))}
        {q.data?.length === 0 && <li className="py-2 text-sm text-ink-muted">No hay días bloqueados.</li>}
      </ul>
    </div>
  );
}

function Categories() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-categories'], queryFn: () => api<{ id: string; name: string; slug: string; sortOrder: number; active: boolean; _count: { products: number } }[]>('/api/admin/categories') });
  const [form, setForm] = useState({ name: '', slug: '' });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-categories'] });
    void qc.invalidateQueries({ queryKey: ['facets'] });
  };
  const add = useMutation({ mutationFn: () => api('/api/admin/categories', { body: { ...form, sortOrder: (q.data?.length ?? 0) + 1, active: true } }), onSuccess: () => { setForm({ name: '', slug: '' }); refresh(); } });
  const toggle = useMutation({
    mutationFn: (c: { id: string; name: string; slug: string; sortOrder: number; active: boolean }) => api(`/api/admin/categories/${c.id}`, { method: 'PUT', body: { name: c.name, slug: c.slug, sortOrder: c.sortOrder, active: !c.active } }),
    onSuccess: refresh,
  });
  return (
    <div className="card space-y-4 p-6">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <input className="input flex-1" placeholder="Nombre (p. ej. Terraza)" value={form.name} onChange={(e) => setForm({ name: e.target.value, slug: e.target.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })} aria-label="Nombre" />
        <input className="input w-40" placeholder="slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} aria-label="Identificador" />
        <button type="submit" className="btn-primary" disabled={add.isPending || form.name.length < 2}>
          Agregar
        </button>
      </form>
      {(add.isError || toggle.isError) && <Alert kind="error">{errorMessage(add.error ?? toggle.error)}</Alert>}
      <ul className="divide-y divide-stone-100">
        {q.data?.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2 text-sm">
            <span>
              {c.name} <span className="text-xs text-ink-muted">/{c.slug} · {c._count.products} productos</span>
            </span>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={c.active} onChange={() => toggle.mutate(c)} /> Visible
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
