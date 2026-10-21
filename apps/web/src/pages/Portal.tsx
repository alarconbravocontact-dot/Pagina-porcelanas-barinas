import { useEffect } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, KeyRound, LayoutGrid, Lock, MessageSquare, ShoppingBag } from 'lucide-react';
import { whatsappLink } from '@porcelanas/shared';
import { api, ApiError, errorMessage } from '../lib/api';
import type { Order, Product, Seller } from '../lib/types';
import { useSession } from '../hooks/session';
import { useCart, useSellers, useSettings } from '../hooks/data';
import { CustomerProfileForm } from '../components/CustomerProfileForm';
import { StoreMap } from '../components/StoreMap';
import { SellerContactCard } from '../components/SellerContact';
import { ProductCard } from '../components/ProductCard';
import { OrderProgress } from '../components/OrderConfirmation';
import { OrderCard } from './account/Account';
import { Alert, Spinner } from '../components/ui';

/** Rutas que se ven sin sesión aunque el portal sea privado. */
export const PORTAL_PUBLIC_PATHS = ['/portal', '/acceso', '/activar', '/ingresar', '/politicas'];

const REQUEST_LINK = 'Hola, quiero mi enlace personal para entrar al portal de compra de porcelanatos.';

function BrandPanel({ children }: { children: React.ReactNode }) {
  const { data: settings } = useSettings();
  return (
    <div className="container-page grid grid-cols-1 gap-10 py-8 sm:py-16 lg:grid-cols-12 lg:gap-12 lg:py-24">
      <div className="lg:col-span-5">
        <p className="eyebrow">Portal de compra privado</p>
        <h1 className="mt-4 text-4xl leading-[1.02] sm:mt-6 sm:text-6xl">{settings?.store.name || 'Porcelanatos'}</h1>
        <p className="mt-6 max-w-md text-base leading-relaxed text-ink-soft">
          Tu espacio personal para elegir porcelanatos, calcular cajas, registrar tus órdenes de compra, adjuntar tus pagos y coordinar el retiro con tu vendedor.
        </p>
        <ul className="mt-8 hidden space-y-2 text-sm text-ink-soft sm:block">
          <li>— Catálogo con precios en divisas y precio BCV</li>
          <li>— Tus órdenes, pagos y fechas de retiro en un solo lugar</li>
          <li>— Atención directa de tu vendedor</li>
          {settings?.store.hoursText && <li>— Sede {settings.store.city || ''}: {settings.store.hoursText}</li>}
        </ul>
      </div>
      {/* En el teléfono, la tarjeta de acceso va primero. */}
      <div className="order-first lg:order-none lg:col-span-6 lg:col-start-7">{children}</div>
    </div>
  );
}

function RequestLinkButton({ sellers, label = 'Pedir mi enlace por WhatsApp' }: { sellers?: Seller[]; label?: string }) {
  const { data: settings } = useSettings();
  const seller = sellers?.find((s) => s.whatsapp);
  const message = seller ? `Hola, ${seller.displayName.split(' ')[0]}. Quiero mi enlace personal para entrar al portal de compra de porcelanatos.` : REQUEST_LINK;
  const href = whatsappLink(seller?.whatsapp || settings?.whatsapp.number, message);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="btn-primary" data-testid="request-link">
      {seller ? `Pedir mi enlace a ${seller.displayName.split(' ')[0]}` : label}
    </a>
  );
}

/** Lo que ve un visitante sin sesión cuando el portal es privado. */
export function PrivatePortal() {
  const sellers = useSellers();
  return (
    <BrandPanel>
      <div className="border border-stone-200 bg-white p-6 sm:p-10" data-testid="private-portal">
        <Lock className="h-6 w-6 text-ink-muted" aria-hidden />
        <h2 className="mt-4 text-3xl">Este portal es personal</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Entra con el <strong className="font-medium text-ink">enlace personal</strong> que te envió tu vendedor por WhatsApp. Al abrirlo registras tus datos una sola vez y quedas dentro de tu portal en este dispositivo.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <RequestLinkButton sellers={sellers.data} />
        </div>
        <div className="mt-8 space-y-2 border-t border-stone-200 pt-6 text-sm text-ink-soft">
          <p>
            ¿Ya tienes correo y contraseña?{' '}
            <Link to="/ingresar" className="text-ink underline underline-offset-4">
              Ingresa aquí
            </Link>
            .
          </p>
          <p className="text-ink-muted">¿Entraste antes desde otro teléfono? Pide a tu vendedor un enlace de acceso para este dispositivo.</p>
        </div>
      </div>
    </BrandPanel>
  );
}

interface InviteInfo {
  guestName: string;
  seller: { name: string; branch: string; city: string };
  expiresAt: string;
}

/** Página del enlace personal: bienvenida y registro de los cuatro datos. */
export function PortalInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('invitacion') ?? '';
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const sellers = useSellers();
  const info = useQuery({ queryKey: ['invite', token], queryFn: () => api<InviteInfo>(`/api/portal/invites/${encodeURIComponent(token)}`), enabled: !!token && !user, retry: false });

  useEffect(() => {
    if (user?.customerId) navigate('/', { replace: true });
  }, [user, navigate]);

  if (loading) return <Spinner />;
  if (user && !user.customerId) return <Navigate to="/" replace />;
  if (!token) return <PrivatePortal />;

  return (
    <BrandPanel>
      <div className="border border-stone-200 bg-white p-6 sm:p-10">
        {info.isLoading && <Spinner label="Verificando tu enlace…" />}
        {info.isError && (
          <div data-testid="invite-invalid">
            <KeyRound className="h-6 w-6 text-ink-muted" aria-hidden />
            <h2 className="mt-4 text-3xl">Enlace no disponible</h2>
            <p className="mt-3 text-sm text-ink-soft">{info.error instanceof ApiError ? info.error.message : errorMessage(info.error)}</p>
            <div className="mt-6">
              <RequestLinkButton sellers={sellers.data} label="Pedir un enlace nuevo" />
            </div>
          </div>
        )}
        {info.data && (
          <>
            <p className="eyebrow">Invitación de {info.data.seller.name}</p>
            <h2 className="mt-3 text-3xl">{info.data.guestName ? `¡Bienvenido, ${info.data.guestName}!` : '¡Bienvenido a tu portal!'}</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              Completa tus datos una sola vez para abrir tu portal de compra. No necesitas correo ni contraseña: quedarás con tu sesión abierta en este dispositivo.
            </p>
            <div className="mt-6">
              <CustomerProfileForm submitTo={`/api/portal/invites/${encodeURIComponent(token)}/accept`} submitLabel="Entrar a mi portal" onSaved={() => navigate('/', { replace: true })} />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-muted" data-testid="invite-consent">
              Al entrar aceptas los{' '}
              <a href="/politicas#terminos" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink">
                términos y condiciones
              </a>{' '}
              y la{' '}
              <a href="/politicas#privacidad" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink">
                política de privacidad
              </a>
              . Solo usamos cookies necesarias.
            </p>
          </>
        )}
      </div>
    </BrandPanel>
  );
}

interface PortalHomeData {
  seller: Seller | null;
  reorder: Product[];
}

/** Inicio del cliente: su espacio personal de compra. */
export function PortalHome() {
  const { user } = useSession();
  const { data: settings } = useSettings();
  const { data: cart } = useCart();
  const home = useQuery({ queryKey: ['portal-home'], queryFn: () => api<PortalHomeData>('/api/portal/home') });
  const orders = useQuery({ queryKey: ['orders'], queryFn: () => api<Order[]>('/api/orders') });
  const featured = useQuery({ queryKey: ['catalog', 'featured-portal'], queryFn: () => api<{ items: Product[] }>('/api/catalog?featured=true&pageSize=3') });
  const active = (orders.data ?? []).filter((o) => ['PENDING_PAYMENT', 'CONFIRMED', 'READY_FOR_PICKUP'].includes(o.status));
  const firstName = user?.fullName.split(' ')[0] ?? '';
  const cartCount = cart?.items.length ?? 0;
  const tiles = [
    { to: '/catalogo', label: 'Catálogo', hint: 'Elige y calcula cajas', Icon: LayoutGrid },
    { to: '/carrito', label: 'Mi carrito', hint: cartCount ? `${cartCount} ${cartCount === 1 ? 'producto' : 'productos'}` : 'Vacío', Icon: ShoppingBag },
    { to: '/cuenta/operaciones', label: 'Mis compras', hint: active.length ? `${active.length} en curso` : 'Historial', Icon: ClipboardList },
    { to: '/cuenta/chat', label: 'Mensajes', hint: 'Habla con tu vendedor', Icon: MessageSquare },
  ];

  return (
    <div className="container-page py-10">
      <header className="flex flex-col gap-2 border-b border-stone-200 pb-8" data-tour="portal-greeting">
        <p className="eyebrow">Tu portal de compra</p>
        <h1 className="text-5xl sm:text-6xl">Hola, {firstName}.</h1>
        <p className="text-sm text-ink-muted">
          {settings?.store.hoursText ? `Sede ${settings.store.city || ''} · ${settings.store.hoursText}` : 'Bienvenido a tu espacio personal.'}
        </p>
      </header>

      <nav className="mt-8 grid grid-cols-2 gap-px border border-stone-200 bg-stone-200 lg:grid-cols-4" aria-label="Accesos rápidos" data-tour="portal-tiles">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="group flex flex-col gap-3 bg-white p-5 transition hover:bg-stone-50 sm:p-6">
            <t.Icon className="h-5 w-5 text-ink-muted transition group-hover:text-ink" aria-hidden />
            <span>
              <span className="block font-display text-2xl font-light">{t.label}</span>
              <span className="block text-xs text-ink-muted">{t.hint}</span>
            </span>
          </Link>
        ))}
      </nav>

      <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-3">
        <section className="min-w-0 lg:col-span-2" aria-labelledby="mis-ordenes" data-tour="portal-orders">
          <div className="flex items-end justify-between gap-4">
            <h2 id="mis-ordenes" className="text-3xl">
              Órdenes en curso
            </h2>
            <Link to="/cuenta/operaciones" className="text-xs uppercase tracking-[0.16em] text-ink-muted hover:text-ink">
              Ver todas
            </Link>
          </div>
          {orders.isLoading && <Spinner />}
          {orders.data && active.length === 0 && (
            <div className="mt-4 border border-stone-200 bg-stone-50 px-6 py-10 text-center">
              <p className="font-display text-2xl font-light">No tienes órdenes en curso</p>
              <p className="mt-1 text-sm text-ink-muted">Elige tus piezas en el catálogo y registra tu primera orden de compra.</p>
              <Link to="/catalogo" className="btn-primary mt-5">
                Ir al catálogo
              </Link>
            </div>
          )}
          <div className="mt-4 space-y-4">
            {active.slice(0, 3).map((o) => (
              <div key={o.id} className="space-y-3">
                <OrderCard order={o} />
                <OrderProgress order={o} />
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-6" data-tour="portal-seller">
          {home.data?.seller ? (
            <SellerContactCard seller={home.data.seller} title="Tu vendedor" message={`Hola, ${home.data.seller.displayName.split(' ')[0]}. Te escribo desde mi portal de compra.`} />
          ) : (
            home.data && (
              <Alert kind="info" title="Tu vendedor">
                Elegirás a tu vendedor al registrar tu primera orden de compra.
              </Alert>
            )
          )}
          <StoreMap compact />
        </aside>
      </div>

      {home.data && home.data.reorder.length > 0 && (
        <section className="mt-16" aria-labelledby="recompra" data-tour="portal-reorder">
          <h2 id="recompra" className="text-3xl">
            Volver a comprar
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Piezas de tus órdenes anteriores, con el precio y la disponibilidad de hoy.</p>
          <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {home.data.reorder.slice(0, 3).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {featured.data && featured.data.items.length > 0 && (
        <section className="mt-16" aria-labelledby="destacadas-portal">
          <h2 id="destacadas-portal" className="text-3xl">
            Piezas destacadas
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {featured.data.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
