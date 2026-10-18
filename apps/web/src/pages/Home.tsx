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
      <Hero heroUrl={settings?.store.heroImageUrl} tiles={showcase.slice(0, 4)} tagline={settings?.store.tagline} />

      <section className="container-page py-14" aria-labelledby="ambientes">
        <div className="flex items-end justify-between">
          <h2 id="ambientes" className="text-2xl sm:text-3xl">
            Compra por ambiente
          </h2>
          <Link to="/catalogo" className="text-sm font-medium text-brass hover:underline">
            Ver todo el catálogo
          </Link>
        </div>
        {facets.isLoading && <Spinner />}
        {facets.isError && <ErrorState error={facets.error} onRetry={() => facets.refetch()} />}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {facets.data?.categories.map((c) => (
            <Link key={c.id} to={`/catalogo?category=${c.slug}`} className="card group flex flex-col justify-between p-4 transition hover:border-ink">
              <span className="font-display text-lg">{c.name}</span>
              <span className="mt-6 flex items-center justify-between text-xs text-ink-muted">
                {c.count} {c.count === 1 ? 'producto' : 'productos'}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-white py-14" aria-labelledby="destacados">
        <div className="container-page">
          <div className="flex items-end justify-between">
            <div>
              <h2 id="destacados" className="text-2xl sm:text-3xl">
                Productos destacados
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                Precios en USD por m² y por caja. <RateNotice compact />
              </p>
            </div>
            <Link to="/catalogo" className="hidden text-sm font-medium text-brass hover:underline sm:block">
              Filtrar catálogo
            </Link>
          </div>
          {(featured.isLoading || latest.isLoading) && <Spinner />}
          {featured.isError && <ErrorState error={featured.error} onRetry={() => featured.refetch()} />}
          {!featured.isLoading && showcase.length === 0 && !featured.isError && (
            <div className="mt-6">
              <EmptyState title="Aún no hay productos publicados">El catálogo se mostrará aquí cuando la tienda publique sus productos.</EmptyState>
            </div>
          )}
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {showcase.slice(0, 8).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      </section>

      {calcProduct && (
        <section className="container-page grid gap-8 py-14 lg:grid-cols-2" aria-labelledby="calculadora">
          <div>
            <h2 id="calculadora" className="text-2xl sm:text-3xl">
              ¿Cuántas cajas necesitas?
            </h2>
            <p className="mt-2 max-w-md text-ink-muted">
              Indica los metros cuadrados de tu espacio y calculamos las cajas completas necesarias, los m² efectivos y el total en dólares y bolívares.
            </p>
            <label htmlFor="calc-product" className="label mt-6">
              Producto
            </label>
            <select id="calc-product" className="input max-w-md" value={calcProduct.id} onChange={(e) => setCalcId(e.target.value)}>
              {showcase.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.sizeLabel}
                </option>
              ))}
            </select>
            <div className="mt-6 flex max-w-md items-center gap-4">
              <ProductImage product={calcProduct} className="h-24 w-24 rounded-md" />
              <div className="text-sm">
                <p className="font-medium">{calcProduct.name}</p>
                <p className="text-ink-muted">SKU {calcProduct.sku}</p>
                <Link to={`/producto/${calcProduct.sku}`} className="text-brass hover:underline">
                  Ver ficha completa
                </Link>
              </div>
            </div>
          </div>
          <Calculator key={calcProduct.id} product={calcProduct} />
        </section>
      )}

      <ProcessSection />
      <SellerSection />
      <FaqSection />
      <StoreSection />
    </>
  );
}

function Hero({ heroUrl, tiles, tagline }: { heroUrl?: string; tiles: Product[]; tagline?: string }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/catalogo${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  };
  return (
    <section className="relative overflow-hidden border-b border-stone-200 bg-stone-100">
      <div className="container-page grid items-center gap-10 py-14 lg:grid-cols-2 lg:py-20">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">Porcelanatos · retiro en sede</p>
          <h1 className="mt-4 text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">Superficies que transforman cada espacio</h1>
          <p className="mt-5 max-w-lg text-lg text-ink-soft">
            {tagline || 'Cotiza por caja o por metro cuadrado, prepaga y reserva la fecha de retiro con el vendedor que te atenderá en la sede.'}
          </p>
          <form onSubmit={onSubmit} className="mt-8 flex max-w-lg gap-2" role="search">
            <label htmlFor="hero-search" className="sr-only">
              Buscar productos
            </label>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
              <input id="hero-search" className="input py-3 pl-9 text-base" placeholder="Nombre, color o SKU" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button type="submit" className="btn-primary px-6">
              Buscar
            </button>
          </form>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/catalogo" className="btn-accent">
              Explorar catálogo <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <WhatsAppButton />
          </div>
        </div>
        <div className="relative">
          {heroUrl ? (
            <img src={heroUrl} alt="Ambiente con porcelanato" className="aspect-[4/3] w-full rounded-xl object-cover shadow-xl" />
          ) : tiles.length > 0 ? (
            <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-2 overflow-hidden rounded-xl shadow-xl" aria-label="Muestras del catálogo">
              {tiles.map((p) => (
                <Link key={p.id} to={`/producto/${p.sku}`} className="relative overflow-hidden">
                  <ProductImage product={p} className="h-full w-full transition duration-700 hover:scale-110" />
                  <span className="absolute bottom-2 left-2 rounded bg-white/90 px-2 py-0.5 text-[11px] font-medium">{p.name}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="aspect-[4/3] rounded-xl bg-[repeating-linear-gradient(45deg,#e7e0d6_0_40px,#f3efe9_40px_80px)]" aria-hidden />
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
    { Icon: Search, title: 'Elige y calcula', text: 'Selecciona el porcelanato y calcula por cajas o m². Los precios se verifican en el servidor.' },
    { Icon: UserCheck, title: 'Elige tu vendedor', text: 'Indica qué vendedor te atenderá cuando llegues a la sede. Es obligatorio.' },
    { Icon: CalendarCheck, title: 'Programa el retiro', text: 'Escoge una fecha habilitada según el calendario y la capacidad de la sede.' },
    {
      Icon: CreditCard,
      title: 'Paga o prepaga',
      text: r
        ? `Compra con pago total o reserva con un prepago mínimo del ${r.prepayMinPercent}%. Adjunta tu comprobante para verificación manual.`
        : 'Compra con pago total o reserva con un prepago. Adjunta tu comprobante para verificación manual.',
    },
  ];
  return (
    <section className="bg-ink py-16 text-stone-100" aria-labelledby="proceso">
      <div className="container-page">
        <h2 id="proceso" className="text-2xl text-white sm:text-3xl">
          Prepago y retiro programado
        </h2>
        <p className="mt-2 max-w-2xl text-stone-300">
          Puedes comprar con retiro programado o asegurar tu mercancía con un prepago y retirarla después.
          {r && ` La mercancía queda apartada ${r.holdHours} horas mientras se registra el pago requerido; al verificarse, la reserva queda confirmada hasta tu fecha de retiro.`}
        </p>
        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-lg border border-white/10 bg-white/5 p-5">
              <span className="text-xs font-semibold text-brass-light">Paso {i + 1}</span>
              <s.Icon className="mt-3 h-6 w-6 text-brass-light" aria-hidden />
              <p className="mt-3 font-display text-lg text-white">{s.title}</p>
              <p className="mt-1 text-sm text-stone-300">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex items-start gap-3 rounded-lg bg-white/5 p-4 text-sm text-stone-300">
          <ShieldCheck className="h-5 w-5 shrink-0 text-brass-light" aria-hidden />
          <p>Subir un comprobante no confirma el pago: el equipo de la tienda lo verifica manualmente y te notifica el resultado.</p>
        </div>
      </div>
    </section>
  );
}

function SellerSection() {
  const sellers = useSellers();
  return (
    <section className="container-page py-16" aria-labelledby="vendedor">
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <h2 id="vendedor" className="text-2xl sm:text-3xl">
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
        <div className="card p-5">
          <p className="text-sm font-semibold">Vendedores disponibles</p>
          {sellers.isLoading && <Spinner />}
          {sellers.isError && <ErrorState error={sellers.error} onRetry={() => sellers.refetch()} />}
          {sellers.data?.length === 0 && <p className="mt-3 text-sm text-amber-800">En este momento no hay vendedores disponibles; no es posible confirmar operaciones.</p>}
          <ul className="mt-3 divide-y divide-stone-100">
            {sellers.data?.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-200 font-semibold text-ink-soft">{s.displayName.charAt(0)}</span>
                <div>
                  <p className="text-sm font-medium">{s.displayName}</p>
                  {s.bio && <p className="text-xs text-ink-muted">{s.bio}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  const faq = useFaq();
  return (
    <section className="bg-white py-16" aria-labelledby="faq">
      <div className="container-page max-w-3xl">
        <h2 id="faq" className="text-2xl sm:text-3xl">
          Preguntas frecuentes
        </h2>
        <div className="mt-6 divide-y divide-stone-200 border-y border-stone-200">
          {faq.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="cursor-pointer list-none font-medium marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {f.q}
                  <span className="text-brass transition group-open:rotate-45" aria-hidden>
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
    <section className="container-page py-16" aria-labelledby="sede">
      <div className="card grid gap-6 p-6 md:grid-cols-2">
        <div>
          <h2 id="sede" className="text-2xl">
            Visítanos en la sede
          </h2>
          <p className="mt-3 flex gap-2 text-ink-soft">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brass" aria-hidden />
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
        <div className="rounded-md bg-[repeating-linear-gradient(90deg,#e7e0d6_0_1px,transparent_1px_48px),repeating-linear-gradient(0deg,#e7e0d6_0_1px,transparent_1px_48px)] bg-stone-50" aria-hidden />
      </div>
    </section>
  );
}
