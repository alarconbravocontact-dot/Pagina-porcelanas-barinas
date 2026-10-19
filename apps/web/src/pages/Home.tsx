import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarCheck, CreditCard, MapPin, Search, ShieldCheck, UserCheck } from 'lucide-react';
import { api } from '../lib/api';
import type { Paged, Product } from '../lib/types';
import { useSellers, useSettings } from '../hooks/data';
import { ProductCard, ProductImage } from '../components/ProductCard';
import { Calculator } from '../components/Calculator';
import { RateNotice } from '../components/RateNotice';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { EmptyState, ErrorState, Spinner } from '../components/ui';
import { useFaq } from './HowToBuy';

interface Facets {
  categories: { id: string; name: string; slug: string; count: number }[];
}

export function HomePage() {
  const { data: settings } = useSettings();
  const featured = useQuery({ queryKey: ['catalog', 'featured'], queryFn: () => api<Paged<Product>>('/api/catalog?featured=true&pageSize=8') });
  const latest = useQuery({ queryKey: ['catalog', 'latest'], queryFn: () => api<Paged<Product>>('/api/catalog?pageSize=8&sort=newest') });
  const facets = useQuery({ queryKey: ['facets'], queryFn: () => api<Facets>('/api/catalog/facets') });
  const showcase = (featured.data?.items.length ? featured.data.items : latest.data?.items) ?? [];
  const [calcId, setCalcId] = useState<string | null>(null);
  const calcProduct = showcase.find((p) => p.id === calcId) ?? showcase.find((p) => p.availableBoxes > 0) ?? showcase[0];

  return (
    <>
      <Hero heroUrl={settings?.store.heroImageUrl} piece={[/blanc|perla|marfil/i, /gris|crema|beige/i].map((re) => showcase.find((p) => re.test(p.color) && p.images.length && p.availableBoxes > 0)).find(Boolean) ?? showcase[0]} tagline={settings?.store.tagline} />

      <section className="container-page py-24" aria-labelledby="ambientes">
        <SectionTitle id="ambientes" eyebrow="Salas" title="Recorre por ambiente" link={{ to: '/catalogo', label: 'Ver todo el catálogo' }} />
        {facets.isLoading && <Spinner />}
        {facets.isError && <ErrorState error={facets.error} onRetry={() => facets.refetch()} />}
        <div className="mt-12 grid grid-cols-2 border-l border-t border-stone-200 sm:grid-cols-3 lg:grid-cols-6">
          {facets.data?.categories.map((c, i) => (
            <Link key={c.id} to={`/catalogo?category=${c.slug}`} className="group flex aspect-square flex-col justify-between border-b border-r border-stone-200 p-5 transition duration-500 hover:bg-stone-50">
              <span className="text-[10px] tracking-gallery text-ink-muted">{String(i + 1).padStart(2, '0')}</span>
              <span>
                <span className="block font-display text-2xl font-light">{c.name}</span>
                <span className="mt-1 flex items-center justify-between text-[11px] text-ink-muted">
                  {c.count} {c.count === 1 ? 'pieza' : 'piezas'}
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 transition duration-500 group-hover:translate-x-1 group-hover:opacity-100" aria-hidden />
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="container-page pb-24" aria-labelledby="destacados">
        <SectionTitle id="destacados" eyebrow="Colección" title="Piezas destacadas" link={{ to: '/catalogo', label: 'Filtrar catálogo' }}>
          Precios en USD por m² y por caja · <RateNotice compact />
        </SectionTitle>
        {(featured.isLoading || latest.isLoading) && <Spinner />}
        {featured.isError && <ErrorState error={featured.error} onRetry={() => featured.refetch()} />}
        {!featured.isLoading && showcase.length === 0 && !featured.isError && (
          <div className="mt-12">
            <EmptyState title="La colección aún no está expuesta">El catálogo se mostrará aquí cuando la tienda publique sus productos.</EmptyState>
          </div>
        )}
        <div className="mt-12 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-4">
          {showcase.slice(0, 8).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {calcProduct && (
        <section className="border-y border-stone-200 bg-stone-50" aria-labelledby="calculadora">
          <div className="container-page grid gap-12 py-24 lg:grid-cols-2">
            <div>
              <p className="eyebrow">Calculadora</p>
              <h2 id="calculadora" className="mt-4 text-4xl sm:text-5xl">
                ¿Cuántas cajas necesitas?
              </h2>
              <p className="mt-5 max-w-md text-ink-soft">
                Indica los metros cuadrados de tu espacio. Calculamos las cajas completas, los m² efectivos y el total en dólares y bolívares.
              </p>
              <label htmlFor="calc-product" className="label mt-10">
                Pieza
              </label>
              <select id="calc-product" className="input max-w-md" value={calcProduct.id} onChange={(e) => setCalcId(e.target.value)}>
                {showcase.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.sizeLabel}
                  </option>
                ))}
              </select>
              <div className="mt-8 flex max-w-md items-center gap-5">
                <div className="bg-white p-3 shadow-gallery">
                  <ProductImage product={calcProduct} className="h-24 w-24" />
                </div>
                <div className="text-sm">
                  <p className="font-display text-xl font-light">{calcProduct.name}</p>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">SKU {calcProduct.sku}</p>
                  <Link to={`/producto/${calcProduct.sku}`} className="mt-1 inline-block text-xs underline underline-offset-4 hover:text-ink-soft">
                    Ver ficha completa
                  </Link>
                </div>
              </div>
            </div>
            <Calculator key={calcProduct.id} product={calcProduct} />
          </div>
        </section>
      )}

      <ProcessSection />
      <SellerSection />
      <FaqSection />
      <StoreSection />
    </>
  );
}

function SectionTitle({ id, eyebrow, title, link, children }: { id: string; eyebrow: string; title: string; link?: { to: string; label: string }; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={id} className="mt-3 text-4xl sm:text-5xl">
          {title}
        </h2>
        {children && <p className="mt-3 text-sm text-ink-muted">{children}</p>}
      </div>
      {link && (
        <Link to={link.to} className="text-[11px] uppercase tracking-gallery text-ink-soft underline-offset-8 hover:underline">
          {link.label}
        </Link>
      )}
    </div>
  );
}

function Hero({ heroUrl, piece, tagline }: { heroUrl?: string; piece?: Product; tagline?: string }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/catalogo${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  };
  return (
    <section className="border-b border-stone-200">
      <div className="container-page grid items-center gap-16 py-20 lg:grid-cols-12 lg:py-28">
        <div className="lg:col-span-5">
          <p className="eyebrow">Galería de porcelanatos · retiro en sede</p>
          <h1 className="mt-6 text-5xl leading-[1.02] sm:text-6xl lg:text-7xl">Superficies en silencio.</h1>
          <p className="mt-8 max-w-md text-base leading-relaxed text-ink-soft">
            {tagline || 'Cotiza por caja o por metro cuadrado, prepaga y reserva tu fecha de retiro con el vendedor que te atenderá en la sede.'}
          </p>
          <form onSubmit={onSubmit} className="mt-10 flex max-w-md items-end gap-4" role="search">
            <label htmlFor="hero-search" className="sr-only">
              Buscar productos
            </label>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
              <input id="hero-search" className="input py-3 pl-7 text-base" placeholder="Nombre, color o SKU" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button type="submit" className="btn-primary">
              Buscar
            </button>
          </form>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/catalogo" className="btn-accent">
              Entrar a la galería <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
            <WhatsAppButton />
          </div>
        </div>
        <div className="lg:col-span-7">
          {heroUrl ? (
            <div className="bg-stone-100 p-8 sm:p-12">
              <img src={heroUrl} alt="Ambiente con porcelanato" className="aspect-[4/3] w-full object-cover shadow-gallery" />
            </div>
          ) : piece ? (
            <figure>
              <Link to={`/producto/${piece.sku}`} className="group block bg-stone-100 px-10 py-12 sm:px-20 sm:py-16">
                <div className="mx-auto aspect-[4/5] max-w-md overflow-hidden shadow-gallery">
                  <ProductImage product={piece} className="h-full w-full transition duration-1000 group-hover:scale-[1.03]" />
                </div>
              </Link>
              <figcaption className="mt-4 flex items-baseline justify-between gap-4 text-sm">
                <span className="font-display text-xl font-light italic">{piece.name}</span>
                <span className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">
                  {piece.sizeLabel} cm · {piece.color}
                </span>
              </figcaption>
            </figure>
          ) : (
            <div className="aspect-[4/3] bg-stone-100" aria-hidden />
          )}
        </div>
      </div>
    </section>
  );
}

function ProcessSection() {
  const { data } = useSettings();
  const r = data?.reservation;
  const steps = [
    { Icon: Search, title: 'Elige y calcula', text: 'Selecciona la pieza y calcula por cajas o m². Los precios se verifican en el servidor.' },
    { Icon: UserCheck, title: 'Elige tu vendedor', text: 'Indica qué vendedor te atenderá cuando llegues a la sede. Es obligatorio.' },
    { Icon: CalendarCheck, title: 'Programa el retiro', text: 'Escoge una fecha habilitada según el calendario y la capacidad de la sede.' },
    {
      Icon: CreditCard,
      title: 'Paga o prepaga',
      text: r
        ? `Pago total o reserva con un prepago mínimo del ${r.prepayMinPercent}%. Adjunta tu comprobante para verificación manual.`
        : 'Pago total o reserva con un prepago. Adjunta tu comprobante para verificación manual.',
    },
  ];
  return (
    <section className="container-page py-24" aria-labelledby="proceso">
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p className="eyebrow">Procedimiento</p>
          <h2 id="proceso" className="mt-3 text-4xl sm:text-5xl">
            Prepago y retiro programado
          </h2>
          <p className="mt-5 text-ink-soft">
            Compra con retiro programado o asegura tu mercancía con un prepago y retírala después.
            {r && ` La mercancía queda apartada ${r.holdHours} horas mientras se registra el pago requerido; al verificarse, la reserva queda confirmada hasta tu fecha de retiro.`}
          </p>
          <p className="mt-6 flex gap-3 border-l border-ink pl-4 text-sm text-ink-soft">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Subir un comprobante no confirma el pago: el equipo lo verifica manualmente y te notifica el resultado.
          </p>
        </div>
        <ol className="grid border-l border-t border-stone-200 sm:grid-cols-2 lg:col-span-8">
          {steps.map((s, i) => (
            <li key={s.title} className="border-b border-r border-stone-200 p-8">
              <div className="flex items-center justify-between">
                <span className="font-display text-4xl font-light text-stone-300">{String(i + 1).padStart(2, '0')}</span>
                <s.Icon className="h-5 w-5 text-ink-muted" aria-hidden />
              </div>
              <p className="mt-6 font-display text-2xl font-light">{s.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function SellerSection() {
  const sellers = useSellers();
  return (
    <section className="border-t border-stone-200 bg-stone-50" aria-labelledby="vendedor">
      <div className="container-page py-24">
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <p className="eyebrow">Atención personal</p>
          <h2 id="vendedor" className="mt-3 text-4xl sm:text-5xl">
            Tu vendedor te espera en la sede
          </h2>
          <p className="mt-3 text-ink-muted">
            Para confirmar cualquier compra o reserva debes seleccionar al vendedor que te representará cuando llegues a la sede. Ese vendedor recibe tu operación, te atiende por el chat y
            gestiona la entrega.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-ink-soft">
            <li>• Solo se muestran vendedores activos.</li>
            <li>• Sin vendedor seleccionado no es posible confirmar la operación.</li>
            <li>• Puedes consultar tu vendedor asignado en “Mi cuenta”.</li>
          </ul>
        </div>
        <div className="border border-stone-200 bg-white p-8">
          <p className="eyebrow">Vendedores disponibles</p>
          {sellers.isLoading && <Spinner />}
          {sellers.isError && <ErrorState error={sellers.error} onRetry={() => sellers.refetch()} />}
          {sellers.data?.length === 0 && <p className="mt-3 text-sm text-amber-800">En este momento no hay vendedores disponibles; no es posible confirmar operaciones.</p>}
          <ul className="mt-3 divide-y divide-stone-100">
            {sellers.data?.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 font-display text-lg text-ink-soft">{s.displayName.charAt(0)}</span>
                <div>
                  <p className="text-sm font-medium">{s.displayName}</p>
                  {s.bio && <p className="text-xs text-ink-muted">{s.bio}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      </div>
    </section>
  );
}

function FaqSection() {
  const faq = useFaq();
  return (
    <section className="py-24" aria-labelledby="faq">
      <div className="container-page max-w-3xl">
        <p className="eyebrow">Consultas</p>
        <h2 id="faq" className="mt-3 text-4xl sm:text-5xl">
          Preguntas frecuentes
        </h2>
        <div className="mt-10 divide-y divide-stone-200 border-y border-stone-200">
          {faq.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="cursor-pointer list-none font-display text-xl font-light marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {f.q}
                  <span className="font-sans text-lg font-light text-ink-muted transition group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function StoreSection() {
  const { data } = useSettings();
  const s = data?.store;
  if (!s?.address) return null;
  return (
    <section className="container-page pb-8" aria-labelledby="sede">
      <div className="grid gap-10 border border-stone-200 p-10 md:grid-cols-2">
        <div>
          <h2 id="sede" className="text-4xl">
            Visítanos en la sede
          </h2>
          <p className="mt-3 flex gap-2 text-ink-soft">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" aria-hidden />
            {s.address}
            {s.city && `, ${s.city}`}
          </p>
          {s.hoursText && <p className="mt-2 text-sm text-ink-muted">{s.hoursText}</p>}
          {s.phone && <p className="mt-1 text-sm text-ink-muted">Teléfono: {s.phone}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {s.mapUrl && (
              <a href={s.mapUrl} target="_blank" rel="noopener noreferrer" className="btn-outline">
                Cómo llegar
              </a>
            )}
            <WhatsAppButton label="Escribir a la sede" />
          </div>
        </div>
        <div className="min-h-[200px] bg-[repeating-linear-gradient(90deg,#e8e8e6_0_1px,transparent_1px_56px),repeating-linear-gradient(0deg,#e8e8e6_0_1px,transparent_1px_56px)] bg-stone-50" aria-hidden />
      </div>
    </section>
  );
}
