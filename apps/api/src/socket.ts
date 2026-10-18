import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from './config';
import { loadAuthFromToken, SESSION_COOKIE } from './lib/auth';
import { setIo } from './lib/realtime';
import { canJoinConversation } from './services/chat';

function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** Tiempo real autenticado con la misma cookie de sesión de la API. */
export function attachSocket(server: HttpServer) {
  const io = new Server(server, {
    path: '/socket.io',
    cors: config.isProd ? undefined : { origin: config.PUBLIC_ORIGIN, credentials: true },
    serveClient: false,
  });
  io.use(async (socket, next) => {
    const auth = await loadAuthFromToken(readCookie(socket.handshake.headers.cookie, SESSION_COOKIE)).catch(() => null);
    if (!auth) return next(new Error('UNAUTHENTICATED'));
    socket.data.auth = auth;
    next();
  });
  io.on('connection', (socket) => {
    const auth = socket.data.auth;
    void socket.join(`user:${auth.userId}`);
    socket.on('conversation:join', async (conversationId: unknown, ack?: (r: { ok: boolean }) => void) => {
      const ok = typeof conversationId === 'string' && (await canJoinConversation(auth, conversationId).catch(() => false));
      if (ok) await socket.join(`conv:${conversationId}`);
      ack?.({ ok });
    });
    socket.on('conversation:leave', (conversationId: unknown) => {
      if (typeof conversationId === 'string') void socket.leave(`conv:${conversationId}`);
    });
    socket.on('typing', (conversationId: unknown) => {
      if (typeof conversationId === 'string' && socket.rooms.has(`conv:${conversationId}`)) {
        socket.to(`conv:${conversationId}`).emit('typing', { conversationId, userId: auth.userId });
      }
    });
  });
  setIo(io);
  return io;
}
