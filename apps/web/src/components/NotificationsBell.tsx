import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { NotificationItem } from '../lib/types';
import { formatDateTime } from '../lib/format';
import { useRealtime } from '../hooks/realtime';

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { connected } = useRealtime();
  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ items: NotificationItem[]; unread: number }>('/api/notifications'),
    refetchInterval: connected ? false : 30_000,
  });
  const markAll = useMutation({
    mutationFn: () => api('/api/notifications/read-all', { method: 'POST', body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markOne = useMutation({
    mutationFn: (id: string) => api(`/api/notifications/${id}/read`, { method: 'POST', body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  const unread = q.data?.unread ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn-ghost relative px-2" onClick={() => setOpen((v) => !v)} aria-label={`Notificaciones${unread ? ` (${unread} sin leer)` : ''}`} aria-expanded={open}>
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] border border-stone-200 bg-white shadow-gallery">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5">
            <p className="text-sm font-semibold">Notificaciones</p>
            {unread > 0 && (
              <button type="button" className="text-xs font-medium text-ink underline-offset-4 hover:underline" onClick={() => markAll.mutate()}>
                Marcar todas como leídas
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {q.isLoading && <li className="px-4 py-6 text-center text-sm text-ink-muted">Cargando…</li>}
            {q.isError && <li className="px-4 py-6 text-center text-sm text-red-700">No se pudieron cargar</li>}
            {q.data?.items.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-muted">Sin notificaciones</li>}
            {q.data?.items.map((n) => (
              <li key={n.id} className={`border-b border-stone-50 ${n.readAt ? '' : 'bg-stone-50'}`}>
                <Link
                  to={n.link ?? '#'}
                  className="block px-4 py-3 hover:bg-stone-50"
                  onClick={() => {
                    if (!n.readAt) markOne.mutate(n.id);
                    setOpen(false);
                  }}
                >
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{n.body}</p>
                  <p className="mt-1 text-[11px] text-stone-400">{formatDateTime(n.createdAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
