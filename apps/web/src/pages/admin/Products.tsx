import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import {
  ANTISLIP,
  ANTISLIP_LABELS,
  FINISHES,
  INVENTORY_MOVEMENT_LABELS,
  MANUAL_MOVEMENT_TYPES,
  PRODUCT_STATUS,
  PRODUCT_STATUS_LABELS,
  m2ToUnits,
  parseMoneyToCents,
  priceBoxFromM2,
  priceM2FromBox,
  productInputSchema,
  type InventoryMovementType,
} from '@porcelanas/shared';
import { api, ApiError, errorMessage, toQuery } from '../../lib/api';
import type { Paged, Product } from '../../lib/types';
import { centsToInput, FINISH_LABELS, formatDateTime, formatUSD } from '../../lib/format';
import { Alert, Badge, EmptyState, ErrorState, Field, PageHeader, Pagination, Spinner } from '../../components/ui';
import { StockBadge } from '../../components/StatusBadges';
import { ProductImage } from '../../components/ProductCard';

export function AdminProducts() {
  const [f, setF] = useState({ q: '', status: '', page: 1 });
  const q = useQuery({ queryKey: ['admin-products', f], queryFn: () => api<Paged<Product>>(`/api/admin/products${toQuery({ ...f, pageSize: 20, sort: 'name' })}`), placeholderData: keepPreviousData });
  return (
    <div>
      <PageHeader title="Productos e inventario" actions={<Link to="/admin/productos/nuevo" className="btn-primary"><Plus className="h-4 w-4" /> Nuevo producto</Link>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Buscar nombre o SKU" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} aria-label="Buscar" />
        <select className="input w-auto" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })} aria-label="Estado">
          <option value="">Todos los estados</option>
          {PRODUCT_STATUS.map((s) => (
            <option key={s} value={s}>
              {PRODUCT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      {q.isLoading && <Spinner />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data?.items.length === 0 && <EmptyState title="Sin productos" action={<Link to="/admin/productos/nuevo" className="btn-primary">Crear el primero</Link>} />}
      {q.data && q.data.items.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Estado</th>
                <th className="text-right">Precio m²</th>
                <th className="text-right">Precio caja</th>
                <th className="text-right">Existencia</th>
                <th className="text-right">Reservado</th>
                <th className="text-right">Disponible</th>
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((p) => (
                <tr key={p.id} className="hover:bg-stone-50">
                  <td>
                    <Link to={`/admin/productos/${p.id}`} className="flex items-center gap-3">
                      <ProductImage product={p} className="h-10 w-10 shrink-0 rounded-none" />
                      <span>
                        <span className="font-medium hover:underline">{p.name}</span>
                        <span className="block text-xs text-ink-muted">
                          {p.sku} · {p.sizeLabel} {p.isDemo && '· DEMO'}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <Badge color={p.status === 'ACTIVE' ? 'green' : p.status === 'DRAFT' ? 'gray' : 'red'}>{PRODUCT_STATUS_LABELS[p.status]}</Badge>
                  </td>
                  <td className="text-right">{formatUSD(p.priceM2Cents)}</td>
                  <td className="text-right">{formatUSD(p.priceBoxCents)}</td>
                  <td className="text-right">{p.onHandBoxes}</td>
                  <td className="text-right">{p.reservedBoxes}</td>
                  <td className="text-right">
                    <StockBadge status={p.stockStatus} available={p.availableBoxes} /> <span className="ml-1">{p.availableBoxes}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.data && <Pagination page={q.data.page} totalPages={q.data.totalPages} onPage={(p) => setF({ ...f, page: p })} />}
    </div>
  );
}

interface FormState {
  sku: string;
  name: string;
  description: string;
  color: string;
  widthCm: string;
  lengthCm: string;
  thicknessMm: string;
  piecesPerBox: string;
  boxAreaM2: string;
  pricingBasis: 'M2' | 'BOX';
  price: string;
  finish: (typeof FINISHES)[number];
  antiSlip: (typeof ANTISLIP)[number];
  status: (typeof PRODUCT_STATUS)[number];
  featured: boolean;
  categoryIds: string[];
  lowStockThreshold: string;
  initialStockBoxes: string;
}

const EMPTY: FormState = {
  sku: '',
  name: '',
  description: '',
  color: '',
  widthCm: '',
  lengthCm: '',
  thicknessMm: '',
  piecesPerBox: '',
  boxAreaM2: '',
  pricingBasis: 'M2',
  price: '',
  finish: 'MATE',
  antiSlip: 'UNVERIFIED',
  status: 'DRAFT',
  featured: false,
  categoryIds: [],
  lowStockThreshold: '10',
  initialStockBoxes: '0',
};

function fromProduct(p: Product): FormState {
  return {
    sku: p.sku,
    name: p.name,
    description: p.description,
    color: p.color,
    widthCm: String(p.widthCm),
    lengthCm: String(p.lengthCm),
    thicknessMm: p.thicknessMm ? String(p.thicknessMm) : '',
    piecesPerBox: String(p.piecesPerBox),
    boxAreaM2: p.boxAreaM2,
    pricingBasis: p.pricingBasis,
    price: centsToInput(p.pricingBasis === 'M2' ? p.priceM2Cents : p.priceBoxCents),
    finish: p.finish,
    antiSlip: p.antiSlip,
    status: p.status,
    featured: p.featured,
    categoryIds: p.categories.map((c) => c.id),
    lowStockThreshold: String(p.lowStockThreshold ?? 10),
    initialStockBoxes: '0',
  };
}

function derivedPrice(f: FormState) {
  try {
    const area = m2ToUnits(f.boxAreaM2);
    const cents = parseMoneyToCents(f.price);
    return f.pricingBasis === 'M2' ? `${formatUSD(priceBoxFromM2(cents, area))} por caja` : `${formatUSD(priceM2FromBox(cents, area))} por m²`;
  } catch {
    return null;
  }
}

export function AdminProductEdit() {
  const { id } = useParams();
  const isNew = !id || id === 'nuevo';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const product = useQuery({ queryKey: ['admin-product', id], queryFn: () => api<Product>(`/api/admin/products/${id}`), enabled: !isNew });
  const categories = useQuery({ queryKey: ['admin-categories'], queryFn: () => api<{ id: string; name: string; active: boolean }[]>('/api/admin/categories') });
  const [form, setForm] = useState<FormState>(EMPTY);
  const [fields, setFields] = useState<Record<string, string>>({});
  useEffect(() => {
    if (product.data) setForm(fromProduct(product.data));
  }, [product.data]);
  const save = useMutation({
    mutationFn: (body: unknown) => (isNew ? api<Product>('/api/admin/products', { body }) : api<Product>(`/api/admin/products/${id}`, { method: 'PUT', body })),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['admin-products'] });
      qc.setQueryData(['admin-product', p.id], p);
      if (isNew) navigate(`/admin/productos/${p.id}`, { replace: true });
    },
    onError: (e) => e instanceof ApiError && setFields(e.fields),
  });
  if (!isNew && product.isLoading) return <Spinner />;
  if (!isNew && product.isError) return <ErrorState error={product.error} onRetry={() => product.refetch()} />;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((s) => ({ ...s, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = {
      ...form,
      price: form.price.replace(',', '.'),
      boxAreaM2: form.boxAreaM2.replace(',', '.'),
      thicknessMm: form.thicknessMm ? form.thicknessMm.replace(',', '.') : null,
      widthCm: form.widthCm.replace(',', '.'),
      lengthCm: form.lengthCm.replace(',', '.'),
    };
    const r = productInputSchema.safeParse(body);
    if (!r.success) {
      const f: Record<string, string> = {};
      for (const i of r.error.issues) f[i.path.join('.')] ??= i.message;
      setFields(f);
      return;
    }
    setFields({});
    save.mutate(isNew ? { ...r.data, initialStockBoxes: Number(form.initialStockBoxes || 0) } : r.data);
  };

  return (
    <div>
      <Link to="/admin/productos" className="text-sm text-ink-muted hover:text-ink">
        ← Productos
      </Link>
      <PageHeader title={isNew ? 'Nuevo producto' : form.name || 'Producto'} subtitle={!isNew && product.data ? `Última modificación: ${formatDateTime(product.data.updatedAt)} · creado ${formatDateTime(product.data.createdAt)}` : undefined} />
      <div className="grid gap-6 xl:grid-cols-3">
        <form onSubmit={submit} className="card space-y-5 p-6 xl:col-span-2" noValidate>
          {save.isSuccess && <Alert kind="success">Producto guardado.</Alert>}
          {save.isError && <Alert kind="error">{errorMessage(save.error)}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SKU" htmlFor="p-sku" error={fields.sku}>
              <input id="p-sku" className="input uppercase" value={form.sku} onChange={(e) => set('sku', e.target.value)} />
            </Field>
            <Field label="Nombre comercial" htmlFor="p-name" error={fields.name}>
              <input id="p-name" className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
          </div>
          <Field label="Descripción" htmlFor="p-desc" error={fields.description}>
            <textarea id="p-desc" className="input min-h-[90px]" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Color" htmlFor="p-color" error={fields.color}>
              <input id="p-color" className="input" value={form.color} onChange={(e) => set('color', e.target.value)} />
            </Field>
            <Field label="Ancho (cm)" htmlFor="p-w" error={fields.widthCm}>
              <input id="p-w" className="input" inputMode="decimal" value={form.widthCm} onChange={(e) => set('widthCm', e.target.value)} />
            </Field>
            <Field label="Largo (cm)" htmlFor="p-l" error={fields.lengthCm}>
              <input id="p-l" className="input" inputMode="decimal" value={form.lengthCm} onChange={(e) => set('lengthCm', e.target.value)} />
            </Field>
            <Field label="Espesor (mm)" htmlFor="p-t" error={fields.thicknessMm}>
              <input id="p-t" className="input" inputMode="decimal" value={form.thicknessMm} onChange={(e) => set('thicknessMm', e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Piezas por caja" htmlFor="p-pcs" error={fields.piecesPerBox}>
              <input id="p-pcs" className="input" inputMode="numeric" value={form.piecesPerBox} onChange={(e) => set('piecesPerBox', e.target.value)} />
            </Field>
            <Field label="m² por caja" htmlFor="p-area" error={fields.boxAreaM2}>
              <input id="p-area" className="input" inputMode="decimal" value={form.boxAreaM2} onChange={(e) => set('boxAreaM2', e.target.value)} />
            </Field>
            <Field label="Base de precio" htmlFor="p-basis">
              <select id="p-basis" className="input" value={form.pricingBasis} onChange={(e) => set('pricingBasis', e.target.value as 'M2' | 'BOX')}>
                <option value="M2">Por m²</option>
                <option value="BOX">Por caja</option>
              </select>
            </Field>
            <Field label={`Precio USD ${form.pricingBasis === 'M2' ? 'por m²' : 'por caja'}`} htmlFor="p-price" error={fields.price} hint={derivedPrice(form) ?? undefined}>
              <input id="p-price" className="input" inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Acabado" htmlFor="p-fin">
              <select id="p-fin" className="input" value={form.finish} onChange={(e) => set('finish', e.target.value as FormState['finish'])}>
                {FINISHES.map((x) => (
                  <option key={x} value={x}>
                    {FINISH_LABELS[x]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Antideslizante" htmlFor="p-as">
              <select id="p-as" className="input" value={form.antiSlip} onChange={(e) => set('antiSlip', e.target.value as FormState['antiSlip'])}>
                {ANTISLIP.map((x) => (
                  <option key={x} value={x}>
                    {ANTISLIP_LABELS[x]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Estado" htmlFor="p-st">
              <select id="p-st" className="input" value={form.status} onChange={(e) => set('status', e.target.value as FormState['status'])}>
                {PRODUCT_STATUS.map((x) => (
                  <option key={x} value={x}>
                    {PRODUCT_STATUS_LABELS[x]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <fieldset>
            <legend className="label">Ambientes</legend>
            <div className="flex flex-wrap gap-2">
              {categories.data?.map((c) => (
                <label key={c.id} className={`chip cursor-pointer border px-3 py-1.5 ${form.categoryIds.includes(c.id) ? 'border-ink bg-ink text-white' : 'border-stone-300 bg-white'}`}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={form.categoryIds.includes(c.id)}
                    onChange={(e) => set('categoryIds', e.target.checked ? [...form.categoryIds, c.id] : form.categoryIds.filter((x) => x !== c.id))}
                  />
                  {c.name}
                </label>
              ))}
            </div>
            {fields.categoryIds && <p className="mt-1 text-xs font-medium text-red-700">{fields.categoryIds}</p>}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Alerta de stock bajo (cajas)" htmlFor="p-low" error={fields.lowStockThreshold}>
              <input id="p-low" className="input" inputMode="numeric" value={form.lowStockThreshold} onChange={(e) => set('lowStockThreshold', e.target.value)} />
            </Field>
            {isNew && (
              <Field label="Existencia inicial (cajas)" htmlFor="p-init">
                <input id="p-init" className="input" inputMode="numeric" value={form.initialStockBoxes} onChange={(e) => set('initialStockBoxes', e.target.value)} />
              </Field>
            )}
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} /> Destacado en el inicio
            </label>
          </div>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : isNew ? 'Crear producto' : 'Guardar cambios'}
          </button>
        </form>
        {!isNew && product.data && (
          <div className="space-y-6">
            <ImagesPanel product={product.data} />
            <InventoryPanel product={product.data} />
            <PriceHistoryPanel productId={product.data.id} />
          </div>
        )}
      </div>
    </div>
  );
}

function ImagesPanel({ product }: { product: Product }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-product', product.id] });
  const [files, setFiles] = useState<FileList | null>(null);
  const upload = useMutation({
    mutationFn: () => {
      const f = new FormData();
      Array.from(files ?? []).forEach((file) => f.append('file', file));
      return api(`/api/admin/products/${product.id}/images`, { form: f });
    },
    onSuccess: () => {
      setFiles(null);
      void refresh();
    },
  });
  const remove = useMutation({ mutationFn: (imageId: string) => api(`/api/admin/products/${product.id}/images/${imageId}`, { method: 'DELETE' }), onSuccess: refresh });
  return (
    <section className="card p-5">
      <h2 className="text-lg">Fotografías</h2>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {product.images.map((img) => (
          <div key={img.id} className="group relative">
            <img src={img.url} alt={img.alt} className="aspect-square w-full rounded-none object-cover" />
            <button type="button" className="absolute right-1 top-1 rounded-none bg-white/90 p-1 text-red-700 opacity-0 transition group-hover:opacity-100 focus:opacity-100" onClick={() => remove.mutate(img.id)} aria-label="Eliminar imagen">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {product.images.length === 0 && <p className="text-sm text-ink-muted">Sin fotografías.</p>}
      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (files?.length) upload.mutate();
        }}
      >
        <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="block w-full text-xs" onChange={(e) => setFiles(e.target.files)} aria-label="Subir fotografías" />
        <button type="submit" className="btn-outline btn-sm" disabled={!files?.length || upload.isPending}>
          {upload.isPending ? 'Subiendo…' : 'Subir fotografías'}
        </button>
        {upload.isError && <p className="text-xs text-red-700">{errorMessage(upload.error)}</p>}
      </form>
    </section>
  );
}

interface Movement {
  id: string;
  type: InventoryMovementType;
  deltaOnHand: number;
  deltaReserved: number;
  onHandAfter: number;
  reservedAfter: number;
  reason: string;
  createdAt: string;
  user: { email: string } | null;
  order: { code: string } | null;
}

function InventoryPanel({ product }: { product: Product }) {
  const qc = useQueryClient();
  const movements = useQuery({ queryKey: ['movements', product.id], queryFn: () => api<Movement[]>(`/api/admin/products/${product.id}/movements`) });
  const [mv, setMv] = useState({ type: 'RECEIPT', boxes: '', reason: '' });
  const add = useMutation({
    mutationFn: () => api(`/api/admin/products/${product.id}/movements`, { body: { ...mv, boxes: Number(mv.boxes) } }),
    onSuccess: () => {
      setMv({ type: 'RECEIPT', boxes: '', reason: '' });
      void qc.invalidateQueries({ queryKey: ['movements', product.id] });
      void qc.invalidateQueries({ queryKey: ['admin-product', product.id] });
    },
  });
  return (
    <section className="card p-5">
      <h2 className="text-lg">Inventario</h2>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-none bg-stone-50 p-2">
          <dt className="text-xs text-ink-muted">Existencia</dt>
          <dd className="font-semibold">{product.onHandBoxes}</dd>
        </div>
        <div className="rounded-none bg-stone-50 p-2">
          <dt className="text-xs text-ink-muted">Reservado</dt>
          <dd className="font-semibold">{product.reservedBoxes}</dd>
        </div>
        <div className="rounded-none bg-stone-50 p-2">
          <dt className="text-xs text-ink-muted">Disponible</dt>
          <dd className="font-semibold">{product.availableBoxes}</dd>
        </div>
      </dl>
      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <div className="flex gap-2">
          <select className="input" value={mv.type} onChange={(e) => setMv({ ...mv, type: e.target.value })} aria-label="Tipo de movimiento">
            {MANUAL_MOVEMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {INVENTORY_MOVEMENT_LABELS[t]}
              </option>
            ))}
          </select>
          <input className="input w-24" inputMode="numeric" placeholder="Cajas" value={mv.boxes} onChange={(e) => setMv({ ...mv, boxes: e.target.value })} aria-label="Cajas" />
        </div>
        <input className="input" placeholder="Motivo / documento" value={mv.reason} onChange={(e) => setMv({ ...mv, reason: e.target.value })} aria-label="Motivo" />
        <button type="submit" className="btn-outline btn-sm" disabled={add.isPending || !mv.boxes || mv.reason.length < 3}>
          Registrar movimiento
        </button>
        {add.isError && <p className="text-xs text-red-700">{errorMessage(add.error)}</p>}
      </form>
      <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto text-xs">
        {movements.data?.map((m) => (
          <li key={m.id} className="rounded-none bg-stone-50 p-2">
            <p className="font-medium">
              {INVENTORY_MOVEMENT_LABELS[m.type]} · existencia {m.deltaOnHand >= 0 ? '+' : ''}
              {m.deltaOnHand} · reservado {m.deltaReserved >= 0 ? '+' : ''}
              {m.deltaReserved}
            </p>
            <p className="text-ink-muted">
              {m.reason} {m.order && `· ${m.order.code}`} · {m.user?.email ?? 'sistema'} · {formatDateTime(m.createdAt)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PriceHistoryPanel({ productId }: { productId: string }) {
  const q = useQuery({ queryKey: ['price-history', productId], queryFn: () => api<{ id: string; priceBoxCents: number; priceM2Cents: number; createdAt: string; changedBy: { email: string } | null }[]>(`/api/admin/products/${productId}/price-history`) });
  return (
    <section className="card p-5">
      <h2 className="text-lg">Historial de precios</h2>
      <ul className="mt-2 space-y-1 text-xs">
        {q.data?.map((h) => (
          <li key={h.id} className="flex justify-between border-b border-stone-100 py-1">
            <span>
              {formatUSD(h.priceM2Cents)}/m² · {formatUSD(h.priceBoxCents)}/caja
            </span>
            <span className="text-ink-muted">
              {formatDateTime(h.createdAt)} · {h.changedBy?.email ?? 'semilla'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
