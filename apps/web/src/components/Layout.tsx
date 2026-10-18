import { useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, Menu, Search, ShoppingBag, Store, User, X } from 'lucide-react';
import { useSession } from '../hooks/session';
import { useCart, useSettings } from '../hooks/data';
import { NotificationsBell } from './NotificationsBell';
import { WhatsAppButton } from './WhatsAppButton';
import { useEffect } from 'react';

function Logo({ name }: { name: string }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label={`${name} — inicio`}>
      <span className="grid h-8 w-8 grid-cols-2 gap-0.5 rounded bg-ink p-1.5" aria-hidden>
        <span className="bg-stone-200" />
        <span className="bg-brass-light" />
        <span className="bg-brass-light" />
        <span className="bg-stone-200" />
      </span>
      <span className="font-display text-lg leading-none">{name}</span>
    </Link>
  );
}

export function Layout() {
  const { user, logout } = useSession();
  const { data: settings } = useSettings();
  const { data: cart } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const storeName = settings?.store.name || 'Porcelanatos';
  const cartCount = cart?.items.length ?? 0;

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    document.title = storeName;
  }, [storeName]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/catalogo${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  };

  const navCls = ({ isActive }: { isActive: boolean }) => `text-sm font-medium transition hover:text-brass ${isActive ? 'text-brass' : 'text-ink-soft'}`;
  const staffLink = user?.role === 'ADMIN' ? { to: '/admin', label: 'Administración' } : user?.role === 'SELLER' ? { to: '/vendedor', label: 'Panel de vendedor' } : null;

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/95 backdrop-blur">
        <div className="container-page flex h-16 items-center gap-4">
          <button type="button" className="btn-ghost -ml-2 px-2 lg:hidden" onClick={() => setMenuOpen((v) => !v)} aria-label="Menú" aria-expanded={menuOpen}>
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Logo name={storeName} />
          <nav className="ml-6 hidden items-center gap-6 lg:flex" aria-label="Principal">
            <NavLink to="/catalogo" className={navCls}>
              Catálogo
            </NavLink>
            <NavLink to="/como-comprar" className={navCls}>
              Cómo comprar
            </NavLink>
            <NavLink to="/politicas" className={navCls}>
              Políticas
            </NavLink>
          </nav>
          <form onSubmit={onSearch} className="ml-auto hidden max-w-xs flex-1 md:block" role="search">
            <label htmlFor="header-search" className="sr-only">
              Buscar productos
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
              <input id="header-search" className="input pl-9" placeholder="Buscar por nombre o SKU" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </form>
          <div className="ml-auto flex items-center gap-1 md:ml-2">
            {user && <NotificationsBell />}
            <Link to="/carrito" className="btn-ghost relative px-2" aria-label={`Carrito (${cartCount} productos)`}>
              <ShoppingBag className="h-5 w-5" aria-hidden />
              {cartCount > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-bold text-white">{cartCount}</span>}
            </Link>
            {user ? (
              <div className="hidden items-center gap-1 sm:flex">
                {staffLink && (
                  <Link to={staffLink.to} className="btn-ghost px-2" title={staffLink.label}>
                    <LayoutDashboard className="h-5 w-5" aria-hidden />
                    <span className="hidden xl:inline">{staffLink.label}</span>
                  </Link>
                )}
                {user.customerId && (
                  <Link to="/cuenta" className="btn-ghost px-2" title="Mi cuenta">
                    <User className="h-5 w-5" aria-hidden />
                    <span className="hidden xl:inline">Mi cuenta</span>
                  </Link>
                )}
                <button type="button" className="btn-ghost px-2" onClick={() => logout().then(() => navigate('/'))} title="Cerrar sesión" aria-label="Cerrar sesión">
                  <LogOut className="h-5 w-5" aria-hidden />
                </button>
              </div>
            ) : (
              <Link to="/ingresar" className="btn-primary btn-sm ml-1 hidden sm:inline-flex">
                Ingresar
              </Link>
            )}
          </div>
        </div>
        {menuOpen && (
          <div className="border-t border-stone-200 bg-stone-50 lg:hidden">
            <div className="container-page flex flex-col gap-1 py-3">
              <form onSubmit={onSearch} className="mb-2 md:hidden" role="search">
                <input className="input" placeholder="Buscar por nombre o SKU" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar productos" />
              </form>
              <Link to="/catalogo" className="rounded px-2 py-2 hover:bg-stone-100">
                Catálogo
              </Link>
              <Link to="/como-comprar" className="rounded px-2 py-2 hover:bg-stone-100">
                Cómo comprar
              </Link>
              <Link to="/politicas" className="rounded px-2 py-2 hover:bg-stone-100">
                Políticas
              </Link>
              {staffLink && (
                <Link to={staffLink.to} className="rounded px-2 py-2 hover:bg-stone-100">
                  {staffLink.label}
                </Link>
              )}
              {user?.customerId && (
                <Link to="/cuenta" className="rounded px-2 py-2 hover:bg-stone-100">
                  Mi cuenta
                </Link>
              )}
              {user ? (
                <button type="button" className="rounded px-2 py-2 text-left hover:bg-stone-100" onClick={() => logout().then(() => navigate('/'))}>
                  Cerrar sesión
                </button>
              ) : (
                <Link to="/ingresar" className="rounded px-2 py-2 font-medium hover:bg-stone-100">
                  Ingresar / Crear cuenta
                </Link>
              )}
            </div>
          </div>
        )}
      </header>
      <main id="contenido" className="flex-1">
        <Outlet />
      </main>
      <Footer storeName={storeName} />
      <WhatsAppButton variant="floating" />
    </div>
  );
}

function Footer({ storeName }: { storeName: string }) {
  const { data } = useSettings();
  const store = data?.store;
  return (
    <footer className="mt-16 border-t border-stone-200 bg-ink text-stone-200">
      <div className="container-page grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-xl text-white">{storeName}</p>
          {store?.tagline && <p className="mt-2 text-sm text-stone-400">{store.tagline}</p>}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Sede</p>
          {store?.address ? (
            <address className="mt-3 space-y-1 text-sm not-italic">
              <p className="flex gap-2">
                <Store className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  {store.address}
                  {store.city && `, ${store.city}`}
                </span>
              </p>
              {store.hoursText && <p>{store.hoursText}</p>}
              {store.phone && <p>Tel. {store.phone}</p>}
              {store.email && <p>{store.email}</p>}
            </address>
          ) : (
            <p className="mt-3 text-sm text-stone-400">Información de la sede pendiente de publicación.</p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Comprar</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link to="/catalogo" className="hover:text-white">
                Catálogo
              </Link>
            </li>
            <li>
              <Link to="/como-comprar" className="hover:text-white">
                Prepago y retiro en sede
              </Link>
            </li>
            <li>
              <Link to="/cuenta" className="hover:text-white">
                Consultar mis operaciones
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Políticas</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link to="/politicas#condiciones" className="hover:text-white">
                Condiciones comerciales
              </Link>
            </li>
            <li>
              <Link to="/politicas#cancelaciones" className="hover:text-white">
                Cancelaciones y cambios de fecha
              </Link>
            </li>
            <li>
              <Link to="/politicas#privacidad" className="hover:text-white">
                Privacidad
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-stone-500">
        © {new Date().getFullYear()} {storeName}. Precios en USD; montos en bolívares referenciales según la tasa BCV registrada.
      </div>
    </footer>
  );
}
