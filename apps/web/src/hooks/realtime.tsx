import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from './session';

const Ctx = createContext<{ socket: Socket | null; connected: boolean }>({ socket: null, connected: false });

/** Conexión Socket.IO autenticada por cookie. Si no conecta, las vistas usan sondeo periódico. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) return;
    const s = io({ path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'] });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('notification:new', () => void qc.invalidateQueries({ queryKey: ['notifications'] }));
    s.on('message:new', () => void qc.invalidateQueries({ queryKey: ['conversations'] }));
    setSocket(s);
    return () => {
      s.close();
      setSocket(null);
      setConnected(false);
    };
  }, [user?.id, qc]);

  return <Ctx.Provider value={{ socket, connected }}>{children}</Ctx.Provider>;
}

export const useRealtime = () => useContext(Ctx);
