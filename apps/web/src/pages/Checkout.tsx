import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CheckCircle2, UserCheck } from 'lucide-react';
import { checkoutSchema, percentOfCents, usdCentsToVesCents, type OrderType } from '@porcelanas/shared';
import { SellerContactCard } from '../components/SellerContact';
import type { PaymentMethod } from '../lib/types';
import { api, ApiError, errorMessage, newIdempotencyKey } from '../lib/api';
import { useSession } from '../hooks/session';
import { useCart, usePaymentMethods, useSellers, useSettings } from '../hooks/data';
import type { Order, PickupAvailability, Quote } from '../lib/types';
import { formatDateLong, formatM2, formatRate, formatUSD, formatVES, ORDER_TYPE_LABELS } from '../lib/format';
import { Alert, ErrorState, Field, PageHeader, Spinner } from '../components/ui';

export function CheckoutPage() {
  const { user, loading } = useSession();
  const cart = useCart();
  if (loading || cart.isLoading) return <Spinner />;
  if (!user) {
    return (
      <div className="container-page max-w-xl py-16">
        <PageHeader title="Identifícate para continuar" subtitle="Necesitas una cuenta para confirmar compras y reservas. Tu carrito se conservará." />
        <div className="flex gap-3">
          <Link to="/ingresar?next=/checkout" className="btn-primary">
            Iniciar sesión
          </Link>
          <Link to="/registro?next=/checkout" className="btn-outline">
            Crear cuenta
          </Link>
        </div>
      </div>
    );
  }
  if (!user.customerId) {
    return (
      <div className="container-page max-w-xl py-16">
        <Alert kind="warning" title="Cuenta sin perfil de cliente">Las cuentas de personal no pueden realizar compras. Ingrese con una cuenta de cliente.</Alert>
      </div>
    );
  }
  if (cart.isError) return <ErrorState error={cart.error} onRetry={() => cart.refetch()} />;
  if (!cart.data?.items.length) return <Navigate to="/carrito" replace />;
  return <CheckoutForm defaultName={user.fullName} defaultPhone={user.phone ?? ''} />;
}

function CheckoutForm({ defaultName, defaultPhone }: { defaultName: string; defaultPhone: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sellers = useSellers();
  const methods = usePaymentMethods();
  const { data: settings } = useSettings();
  const [type, setType] = useState<OrderType>('PICKUP');
  const [sellerId, setSellerId] = useState('');
  const [sellerConfirmed, setSellerConfirmed] = useState(false);
  const [pickupDate, setPickupDate] = useState('');
  const [methodId, setMethodId] = useState('');
  const [fullName, setFullName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [notes, setNotes] = useState('');
  const [accept, setAccept] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const idemKey = useRef(newIdempotencyKey());

  const availability = useQuery({ queryKey: ['availability', type], queryFn: () => api<PickupAvailability>(`/api/pickup/availability?type=${type}`) });
  const cart = useCart();

  const quoteM = useMutation({
    mutationFn: () => api<Quote>('/api/quotes', { body: { items: cart.data!.items.map((i) => ({ productId: i.productId, mode: i.mode, quantity: i.quantity })) } }),
    onSuccess: setQuote,
  });
  useEffect(() => {
    if (cart.data?.items.length) quoteM.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.dataUpdatedAt]);
  useEffect(() => setPickupDate(''), [type]);
  // Con un único vendedor activo se preselecciona, pero el comprador debe confirmarlo.
  useEffect(() => {
    if (sellers.data?.length === 1 && !sellerId) setSellerId(sellers.data[0]!.id);
  }, [sellers.data, sellerId]);
  useEffect(() => setSellerConfirmed(false), [sellerId]);

  const order = useMutation({
    mutationFn: (body: unknown) => api<{ order: Order; replayed: boolean }>('/api/orders', { body, idempotencyKey: idemKey.current }),
    onSuccess: (r) => {
      idemKey.current = newIdempotencyKey();
      // Navegar antes de refrescar el carrito (vacío) para no disparar la redirección a /carrito.
      navigate(`/cuenta/operaciones/${r.order.code}?nueva=1`, { replace: true });
      setTimeout(() => void qc.invalidateQueries({ queryKey: ['cart'] }), 0);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setFields(err.fields);
        if ((err.code === 'QUOTE_CHANGED' || err.code === 'QUOTE_EXPIRED') && err.details?.quote) {
          setQuote(err.details.quote as Quote);
          setNotice(err.message);
          idemKey.current = newIdempotencyKey();
        }
        if (['INSUFFICIENT_STOCK', 'PRODUCT_UNAVAILABLE', 'PICKUP_FULL', 'SELLER_INVALID'].includes(err.code)) {
          idemKey.current = newIdempotencyKey();
          void qc.invalidateQueries({ queryKey: ['cart'] });
          void qc.invalidateQueries({ queryKey: ['availability'] });
          void qc.invalidateQueries({ queryKey: ['sellers'] });
        }
      }
    },
  });

  const noSellers = sellers.data?.length === 0;
  const noMethods = !methods.isLoading && !methods.data?.some((m) => m.available);
  const selectedMethod = methods.data?.find((m) => m.id === methodId);
  const selectedSeller = sellers.data?.find((x) => x.id === sellerId);
  const rateMissing = quote && !quote.rate;
  // La moneda del método define la lista de precios: USD → divisas, Bs → precio BCV.
  const priceList = selectedMethod?.currency === 'VES' ? 'BCV' : 'DIVISA';
  const listTotal = quote ? (priceList === 'BCV' ? quote.subtotalBcvCents : quote.subtotalCents) : 0;
  const required = quote ? (type === 'PICKUP' ? listTotal : percentOfCents(listTotal, settings?.reservation.prepayMinPercent ?? 100)) : 0;
  const pickupDay = availability.data?.days.find((x) => x.date === pickupDate);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const body = { quoteId: quote?.quoteId, sellerId, sellerConfirmed, type, pickupDate, paymentMethodId: methodId, fullName, phone, customerNotes: notes || undefined, acceptPolicies: accept };
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      const f: Record<string, string> = {};
      for (const i of parsed.error.issues) f[i.path.join('.')] ??= i.message;
      if (f.sellerId) f.sellerId = 'Seleccione el vendedor que lo atenderá en la sede';
      else if (f.sellerConfirmed) f.sellerId = 'Confirme el vendedor que lo atenderá en la sede';
      if (f.pickupDate) f.pickupDate = 'Seleccione una fecha de retiro';
      if (f.paymentMethodId) f.paymentMethodId = 'Seleccione un método de pago';
      setFields(f);
      document.querySelector('[role="alert"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setFields({});
    order.mutate(parsed.data);
  };

  return (
    <form onSubmit={submit} className="container-page py-8" noValidate>
      <PageHeader title="Confirmar compra" subtitle="Completa los pasos. El servidor valida inventario, precios, tasa y fecha antes de generar tu operación." />
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Step n={1} title="Vendedor que te atenderá en la sede" icon={<UserCheck className="h-5 w-5" />}>
            {sellers.isLoading && <Spinner />}
            {sellers.isError && <ErrorState error={sellers.error} onRetry={() => sellers.refetch()} />}
            {noSellers && <Alert kind="error" title="No hay vendedores disponibles">No es posible confirmar operaciones sin un vendedor activo. Intente más tarde o contacte a la tienda.</Alert>}
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Vendedor">
              {sellers.data?.map((s) => (
                <label key={s.id} className={`flex cursor-pointer items-start gap-3 rounded-none border p-4 ${sellerId === s.id ? 'border-ink bg-stone-50' : 'border-stone-200 hover:border-stone-400'}`}>
                  <input type="radio" name="seller" value={s.id} checked={sellerId === s.id} onChange={() => setSellerId(s.id)} className="mt-1 h-4 w-4" aria-label={s.displayName} />
                  <span className="min-w-0 flex-1">
                    <SellerContactCard seller={s} compact />
                  </span>
                </label>
              ))}
            </div>
            {selectedSeller && (
              <label className="mt-4 flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={sellerConfirmed} onChange={(e) => setSellerConfirmed(e.target.checked)} />
                <span>
                  Confirmo que <strong>{selectedSeller.displayName}</strong> me atenderá cuando llegue a la sede{selectedSeller.city ? ` de ${selectedSeller.city}` : ''}.
                </span>
              </label>
            )}
            {fields.sellerId && <p className="mt-2 text-sm font-medium text-red-700" role="alert">{fields.sellerId}</p>}
          </Step>

          <Step n={2} title="Modalidad y fecha de retiro" icon={<CalendarDays className="h-5 w-5" />}>
            <div className="grid gap-2 sm:grid-cols-2">
              {(['PICKUP', 'PREPAY'] as const).map((t) => (
                <label key={t} className={`cursor-pointer rounded-none border p-3 ${type === t ? 'border-ink bg-stone-50' : 'border-stone-200 hover:border-stone-400'}`}>
                  <span className="flex items-center gap-2">
                    <input type="radio" name="type" checked={type === t} onChange={() => setType(t)} className="h-4 w-4" />
                    <span className="text-sm font-medium">{ORDER_TYPE_LABELS[t]}</span>
                  </span>
                  <span className="mt-1 block pl-6 text-xs text-ink-muted">
                    {t === 'PICKUP' ? 'Pago total para confirmar.' : `Prepago mínimo del ${settings?.reservation.prepayMinPercent ?? '—'}% y retiro en una fecha futura.`}
                  </span>
                </label>
              ))}
            </div>
            <p className="mb-2 mt-5 text-sm font-medium text-ink-soft">Fecha de retiro</p>
            {availability.isLoading && <Spinner label="Consultando calendario…" />}
            {availability.isError && <ErrorState error={availability.error} onRetry={() => availability.refetch()} />}
            {availability.data && (
              <>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7" role="radiogroup" aria-label="Fecha de retiro">
                  {availability.data.days.slice(0, type === 'PICKUP' ? 21 : 63).map((d) => (
                    <button
                      key={d.date}
                      type="button"
                      role="radio"
                      aria-checked={pickupDate === d.date}
                      disabled={!d.available}
                      title={d.available ? `${d.remaining} cupos · ${d.open}–${d.close}` : (d.reason ?? '')}
                      onClick={() => setPickupDate(d.date)}
                      className={`rounded-none border px-2 py-2 text-center text-xs transition ${pickupDate === d.date ? 'border-ink bg-ink text-white' : d.available ? 'border-stone-200 bg-white hover:border-ink' : 'cursor-not-allowed border-stone-100 bg-stone-100 text-stone-400 line-through'}`}
                    >
                      <span className="block font-medium capitalize">{new Intl.DateTimeFormat('es-VE', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${d.date}T12:00:00Z`))}</span>
                      <span className="block text-sm">{d.date.slice(8)}/{d.date.slice(5, 7)}</span>
                    </button>
                  ))}
                </div>
                {availability.data.days.every((d) => !d.available) && <Alert kind="warning" className="mt-3">No hay fechas disponibles en este período.</Alert>}
                {pickupDate && (
                  <p className="mt-3 text-sm text-ink-soft">
                    Retiro: <strong className="capitalize">{formatDateLong(pickupDate)}</strong>
                    {(() => {
                      const d = availability.data.days.find((x) => x.date === pickupDate);
                      return d?.open ? ` · horario ${d.open} – ${d.close}` : '';
                    })()}
                  </p>
                )}
              </>
            )}
            {fields.pickupDate && <p className="mt-2 text-sm font-medium text-red-700" role="alert">{fields.pickupDate}</p>}
          </Step>

          <Step n={3} title="Método de pago">
            {methods.isLoading && <Spinner />}
            {noMethods && <Alert kind="error">Ningún método de pago está configurado todavía. La tienda debe completar los datos de recepción antes de recibir pagos.</Alert>}
            <p className="mb-3 text-xs text-ink-muted">Elegir un método no registra ningún pago: después de confirmar realizarás el pago y adjuntarás el comprobante para su verificación.</p>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Método de pago">
              {methods.data?.map((m) => (
                <label
                  key={m.id}
                  className={`flex items-center gap-3 rounded-none border p-3 ${!m.available ? 'cursor-not-allowed border-dashed border-stone-200 bg-stone-50 text-ink-muted' : methodId === m.id ? 'cursor-pointer border-ink bg-stone-50' : 'cursor-pointer border-stone-200 hover:border-stone-400'}`}
                >
                  <input type="radio" name="method" checked={methodId === m.id} disabled={!m.available} onChange={() => setMethodId(m.id)} className="h-4 w-4" aria-label={m.name} />
                  <span>
                    <span className="block text-sm font-medium">{m.name}</span>
                    <span className="block text-[11px] text-ink-muted">
                      {m.available ? (m.currency === 'VES' ? 'En bolívares · precio BCV' : 'En dólares · precio en divisas') : 'Pendiente de configuración por la tienda'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {selectedMethod && <MethodInstructions method={selectedMethod} />}
            {fields.paymentMethodId && <p className="mt-2 text-sm font-medium text-red-700" role="alert">{fields.paymentMethodId}</p>}
          </Step>

          <Step n={4} title="Datos de contacto">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre completo" htmlFor="co-name" error={fields.fullName}>
                <input id="co-name" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
              </Field>
              <Field label="Teléfono" htmlFor="co-phone" error={fields.phone}>
                <input id="co-phone" className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Observaciones (opcional)" htmlFor="co-notes">
                <textarea id="co-notes" className="input min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
              </Field>
            </div>
          </Step>
        </div>

        <aside className="card h-fit p-5 lg:sticky lg:top-24">
          <h2 className="text-lg">Revisión</h2>
          {quoteM.isPending && !quote && <Spinner label="Calculando…" />}
          {quoteM.isError && <ErrorState error={quoteM.error} onRetry={() => quoteM.mutate()} />}
          {quote && (
            <>
              <ul className="mt-3 divide-y divide-stone-100 text-sm">
                {quote.lines.map((l) => (
                  <li key={l.productId} className="flex justify-between gap-3 py-2">
                    <span>
                      {l.name}
                      <span className="block text-xs text-ink-muted">
                        {l.boxes} cajas · {formatM2(l.areaUnits)} · {formatUSD(priceList === 'BCV' ? l.priceBcvBoxCents : l.priceBoxCents)}/caja
                      </span>
                    </span>
                    <span className="font-medium">{formatUSD(priceList === 'BCV' ? l.lineTotalBcvCents : l.lineTotalCents)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-3 space-y-1.5 border-t border-stone-200 pt-3 text-sm">
                <div className="flex justify-between text-base">
                  <dt className="font-medium">Total {priceList === 'BCV' ? '(precio BCV)' : '(divisas)'}</dt>
                  <dd className="font-semibold">{formatUSD(listTotal)}</dd>
                </div>
                {priceList === 'DIVISA' && quote.subtotalBcvCents !== quote.subtotalCents && (
                  <div className="flex justify-between text-xs text-ink-muted">
                    <dt>Si pagas en bolívares (precio BCV)</dt>
                    <dd>{formatUSD(quote.subtotalBcvCents)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Tasa BCV aplicada</dt>
                  <dd>{quote.rate ? `Bs. ${formatRate(quote.rate.rate)}` : '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Equivalente en bolívares</dt>
                  <dd>{quote.totalVesCents != null ? formatVES(quote.totalVesCents) : '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Cajas · m² efectivos</dt>
                  <dd>
                    {quote.totalBoxes} · {formatM2(quote.totalAreaUnits)}
                  </dd>
                </div>
                <div className="flex justify-between border-y border-stone-200 py-2">
                  <dt>{type === 'PICKUP' ? 'Pago requerido' : 'Prepago mínimo'}</dt>
                  <dd className="font-semibold">{formatUSD(required)}</dd>
                </div>
              </dl>
              <dl className="mt-4 space-y-1.5 border-t border-stone-200 pt-3 text-sm" aria-label="Datos de la operación">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Método de pago</dt>
                  <dd className="text-right">{selectedMethod?.name ?? <span className="text-[#7a3030]">Sin seleccionar</span>}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Vendedor responsable</dt>
                  <dd className="text-right">{selectedSeller ? `${selectedSeller.displayName}${sellerConfirmed ? '' : ' (por confirmar)'}` : <span className="text-[#7a3030]">Sin seleccionar</span>}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Fecha de retiro</dt>
                  <dd className="text-right capitalize">{pickupDate ? formatDateLong(pickupDate) : <span className="normal-case text-[#7a3030]">Sin seleccionar</span>}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Estado de la reserva</dt>
                  <dd className="text-right">Se apartará al confirmar · pendiente de pago</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Estado del pago</dt>
                  <dd className="text-right">Pago pendiente</dd>
                </div>
              </dl>
              {selectedMethod?.available && (
                <p className="mt-3 text-xs text-ink-muted">
                  Pagarás por {selectedMethod.name} {formatUSD(required)}{priceList === 'BCV' && quote.rate ? ` (≈ ${formatVES(usdCentsToVesCents(required, quote.rate.rate))})` : ''}; las instrucciones se muestran en el paso 3 y en tu operación.
                </p>
              )}
              {quote.validUntil && <p className="mt-2 text-xs text-ink-muted">Cotización válida hasta {new Date(quote.validUntil).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}.</p>}
            </>
          )}
          {notice && <Alert kind="warning" className="mt-3">{notice}</Alert>}
          {rateMissing && <Alert kind="error" className="mt-3">La tienda no ha registrado la tasa BCV; no es posible confirmar en este momento.</Alert>}
          {order.isError && !notice && <Alert kind="error" className="mt-3">{errorMessage(order.error)}</Alert>}
          {settings && (
            <p className="mt-4 text-xs text-ink-muted">
              La mercancía quedará apartada {settings.reservation.holdHours} horas mientras se verifica el pago requerido.
            </p>
          )}
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
            <span>
              Acepto las{' '}
              <Link to="/politicas" target="_blank" className="text-ink underline">
                políticas comerciales
              </Link>{' '}
              vigentes.
            </span>
          </label>
          {fields.acceptPolicies && <p className="mt-1 text-xs font-medium text-red-700" role="alert">{fields.acceptPolicies}</p>}
          <button type="submit" className="btn-primary mt-4 w-full py-3" disabled={order.isPending || noSellers || noMethods || !quote || !!rateMissing || (!!selectedMethod && !selectedMethod.available)}>
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {order.isPending ? 'Confirmando…' : notice ? 'Confirmar con los nuevos importes' : 'Confirmar operación'}
          </button>
        </aside>
      </div>
    </form>
  );
}

function Step({ n, title, icon, children }: { n: number; title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-5" aria-labelledby={`step-${n}`}>
      <h2 id={`step-${n}`} className="flex items-center gap-3 text-lg">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">{n}</span>
        {title}
        {icon && <span className="ml-auto text-ink-soft">{icon}</span>}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Instrucciones y datos de recepción del método elegido (configurados por la tienda). */
export function MethodInstructions({ method }: { method: PaymentMethod }) {
  if (!method.configured) {
    return <Alert kind="warning" className="mt-3">{method.name} aún no tiene datos de pago configurados por la tienda. No realices pagos por este medio.</Alert>;
  }
  return (
    <div className="mt-3 space-y-2 border border-stone-200 bg-stone-50 p-4 text-sm">
      <p className="eyebrow">Cómo pagar con {method.name}</p>
      <p className="whitespace-pre-line text-ink-soft">{method.instructions}</p>
      {method.receivingDetails && (
        <div>
          <p className="label mb-0.5">Datos de recepción</p>
          <p className="whitespace-pre-line font-normal text-ink">{method.receivingDetails}</p>
        </div>
      )}
      {method.buyerNote && <p className="text-xs text-ink-soft">{method.buyerNote}</p>}
      {method.requiresProof && <p className="text-xs text-ink-muted">{method.proofInstructions || 'Después de confirmar podrás adjuntar el comprobante (JPG, PNG o WebP).'}</p>}
    </div>
  );
}
