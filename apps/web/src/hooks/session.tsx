import { createContext, useContext, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setCsrfToken } from '../lib/api';
import type { SessionUser } from '../lib/types';
import type { Permission } from '@porcelanas/shared';

interface SessionCtx {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser | null>;
  logout: () => Promise<void>;
  refresh: () => Promise<unknown>;
  can: (p: Permission) => boolean;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const r = await api<{ user: SessionUser | null; csrfToken: string }>('/api/auth/session');
      setCsrfToken(r.csrfToken);
      return r.user;
    },
    staleTime: 60_000,
    retry: 1,
  });
  const loginM = useMutation({
    mutationFn: (v: { email: string; password: string }) => api('/api/auth/login', { body: v }),
  });
  const value: SessionCtx = {
    user: q.data ?? null,
    loading: q.isLoading,
    login: async (email, password) => {
      await loginM.mutateAsync({ email, password });
      await qc.invalidateQueries();
      const r = await qc.fetchQuery({ queryKey: ['session'], queryFn: async () => (await api<{ user: SessionUser | null }>('/api/auth/session')).user });
      return r;
    },
    logout: async () => {
      await api('/api/auth/logout', { method: 'POST', body: {} });
      qc.clear();
      await qc.invalidateQueries({ queryKey: ['session'] });
    },
    refresh: () => qc.invalidateQueries({ queryKey: ['session'] }),
    can: (p) => !!q.data?.permissions.includes(p),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession fuera de SessionProvider');
  return ctx;
}
