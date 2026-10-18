import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { BarChart3, CalendarDays, ClipboardList, CreditCard, FileClock, Landmark, MessageSquare, Package, Settings, ShieldCheck, Users, Wallet } from 'lucide-react';
import { useSession } from '../../hooks/session';
import { Spinner } from '../../components/ui';

export function StaffLayout({ area }: { area: 'seller' | 'admin' }) {
  const { user, loading, can } = useSession();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to={`/ingresar?next=${area === 'admin' ? '/admin' : '/vendedor'}`} replace />;
  if (area === 'admin' && user.role !== 'ADMIN') return <Navigate to="/" replace />;
  if (area === 'seller' && user.role !== 'SELLER' && user.role !== 'ADMIN') return <Navigate to="/" replace />;
  const base = area === 'admin' ? '/admin' : '/vendedor';
  const links =
    area === 'admin'
      ? [
          { to: '/admin', label: 'Indicadores', Icon: BarChart3, end: true },
          { to: '/admin/operaciones', label: 'Ventas y reservas', Icon: ClipboardList },
          { to: '/admin/pagos', label: 'Comprobantes', Icon: CreditCard },
          { to: '/admin/retiros', label: 'Retiros', Icon: CalendarDays },
          { to: '/admin/productos', label: 'Productos e inventario', Icon: Package },
          { to: '/admin/vendedores', label: 'Vendedores', Icon: Users },
          { to: '/admin/usuarios', label: 'Usuarios y roles', Icon: ShieldCheck },
          { to: '/admin/tasa', label: 'Tasa BCV', Icon: Landmark },
          { to: '/admin/metodos-pago', label: 'Métodos de pago', Icon: Wallet },
          { to: '/admin/configuracion', label: 'Configuración', Icon: Settings },
          { to: '/admin/chat', label: 'Conversaciones', Icon: MessageSquare },
          { to: '/admin/auditoria', label: 'Auditoría', Icon: FileClock },
        ]
      : [
          { to: '/vendedor', label: 'Mis operaciones', Icon: ClipboardList, end: true },
          ...(can('payments:review') ? [{ to: '/vendedor/pagos', label: 'Comprobantes', Icon: CreditCard }] : []),
          { to: '/vendedor/retiros', label: 'Retiros', Icon: CalendarDays },
          { to: '/vendedor/chat', label: 'Atención (chat)', Icon: MessageSquare },
        ];
  return (
    <div className="container-page py-6">
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">{area === 'admin' ? 'Administración' : 'Panel de vendedor'}</p>
          <nav className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible" aria-label={area === 'admin' ? 'Administración' : 'Vendedor'}>
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => `flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm ${isActive ? 'bg-ink text-white' : 'text-ink-soft hover:bg-stone-100'}`}
              >
                <l.Icon className="h-4 w-4" aria-hidden />
                {l.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <section className="min-w-0" data-base={base}>
          <Outlet />
        </section>
      </div>
    </div>
  );
}
