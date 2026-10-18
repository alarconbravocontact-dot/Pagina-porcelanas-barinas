import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { errorMessage } from '../../lib/api';

export function Spinner({ label = 'Cargando…', className = '' }: { label?: string; className?: string }) {
  return (
    <div role="status" className={`flex items-center justify-center gap-2 py-10 text-sm text-ink-muted ${className}`}>
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

const alertStyles = {
  info: { cls: 'border-sky-200 bg-sky-50 text-sky-900', Icon: Info },
  success: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-900', Icon: CheckCircle2 },
  warning: { cls: 'border-amber-200 bg-amber-50 text-amber-900', Icon: TriangleAlert },
  error: { cls: 'border-red-200 bg-red-50 text-red-900', Icon: AlertCircle },
};

export function Alert({ kind = 'info', title, children, className = '' }: { kind?: keyof typeof alertStyles; title?: string; children?: ReactNode; className?: string }) {
  const { cls, Icon } = alertStyles[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-md border px-4 py-3 text-sm ${cls} ${className}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'No se pudo cargar la información' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div className="card mx-auto my-6 max-w-lg p-6 text-center">
      <AlertCircle className="mx-auto h-8 w-8 text-red-700" aria-hidden />
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-ink-muted">{errorMessage(error)}</p>
      {onRetry && (
        <button type="button" className="btn-outline mt-4" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center">
      <p className="font-display text-lg">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-ink-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs font-medium text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const tone: Record<string, string> = {
  gray: 'bg-stone-100 text-ink-soft',
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  blue: 'bg-sky-100 text-sky-800',
  brass: 'bg-[#f3e6d7] text-brass-dark',
};

export function Badge({ children, color = 'gray' }: { children: ReactNode; color?: keyof typeof tone }) {
  return <span className={`chip ${tone[color]}`}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Paginación">
      <button type="button" className="btn-outline btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Anterior
      </button>
      <span className="text-sm text-ink-muted">
        Página {page} de {totalPages}
      </span>
      <button type="button" className="btn-outline btn-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Siguiente
      </button>
    </nav>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-2 font-display text-2xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
