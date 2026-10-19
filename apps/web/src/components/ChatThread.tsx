import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Check, Send } from 'lucide-react';
import { CONVERSATION_STATUS_LABELS } from '@porcelanas/shared';
import { api, errorMessage } from '../lib/api';
import type { ChatMessage, Conversation } from '../lib/types';
import { formatDateTime, formatTime } from '../lib/format';
import { useRealtime } from '../hooks/realtime';
import { Alert, ErrorState, Spinner } from './ui';
import { Link } from 'react-router-dom';

interface MessagesResponse {
  conversation: Conversation;
  messages: ChatMessage[];
  hasMore: boolean;
}

/** Conversación en tiempo real (Socket.IO) con sondeo de respaldo si no hay conexión. */
export function ChatThread({ conversationId, orderLinkBase }: { conversationId: string; orderLinkBase?: string }) {
  const qc = useQueryClient();
  const { socket, connected } = useRealtime();
  const key = ['messages', conversationId];
  const q = useQuery({ queryKey: key, queryFn: () => api<MessagesResponse>(`/api/conversations/${conversationId}/messages`), refetchInterval: connected ? false : 8_000 });
  const [body, setBody] = useState('');
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const side = q.data?.conversation.viewerSide;

  const markRead = useMutation({
    mutationFn: () => api(`/api/conversations/${conversationId}/read`, { method: 'POST', body: {} }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  useEffect(() => {
    if (!socket) return;
    const join = () => socket.emit('conversation:join', conversationId);
    join();
    socket.on('connect', join);
    const onMessage = (m: ChatMessage) => {
      if (m.conversationId !== conversationId) return;
      qc.setQueryData<MessagesResponse>(key, (old) => (old && !old.messages.some((x) => x.id === m.id) ? { ...old, messages: [...old.messages, m] } : old));
      if (document.visibilityState === 'visible') markRead.mutate();
    };
    const onRead = (r: { conversationId: string; side: string; readAt: string }) => {
      if (r.conversationId !== conversationId) return;
      qc.setQueryData<MessagesResponse>(key, (old) =>
        old ? { ...old, conversation: { ...old.conversation, ...(r.side === 'customer' ? { customerLastReadAt: r.readAt } : { sellerLastReadAt: r.readAt }) } } : old,
      );
    };
    let t: ReturnType<typeof setTimeout>;
    const onTyping = (e: { conversationId: string }) => {
      if (e.conversationId !== conversationId) return;
      setTyping(true);
      clearTimeout(t);
      t = setTimeout(() => setTyping(false), 2500);
    };
    socket.on('message:new', onMessage);
    socket.on('conversation:read', onRead);
    socket.on('typing', onTyping);
    return () => {
      socket.emit('conversation:leave', conversationId);
      socket.off('connect', join);
      socket.off('message:new', onMessage);
      socket.off('conversation:read', onRead);
      socket.off('typing', onTyping);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, conversationId]);

  useEffect(() => {
    if (q.data && side !== 'admin') markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.messages.length, conversationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [q.data?.messages.length]);

  const send = useMutation({
    mutationFn: (text: string) => api<ChatMessage>(`/api/conversations/${conversationId}/messages`, { body: { body: text } }),
    onSuccess: (m) => {
      setBody('');
      qc.setQueryData<MessagesResponse>(key, (old) => (old && !old.messages.some((x) => x.id === m.id) ? { ...old, messages: [...old.messages, m] } : old));
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (body.trim()) send.mutate(body.trim());
  };

  if (q.isLoading) return <Spinner label="Cargando conversación…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { conversation: conv, messages } = q.data!;
  const otherReadAt = side === 'customer' ? conv.sellerLastReadAt : conv.customerLastReadAt;
  const mine = (m: ChatMessage) => (side === 'customer' ? m.senderSide === 'customer' : m.senderSide !== 'customer');

  return (
    <div className="flex h-[min(70vh,640px)] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
        <div>
          <p className="font-medium">{side === 'customer' ? conv.seller.displayName : conv.customer.fullName}</p>
          <p className="text-xs text-ink-muted">
            {CONVERSATION_STATUS_LABELS[conv.status]}
            {conv.order && (
              <>
                {' · '}
                {orderLinkBase ? (
                  <Link className="text-ink underline-offset-4 hover:underline" to={`${orderLinkBase}${side === 'customer' ? conv.order.code : conv.order.id}`}>
                    Operación {conv.order.code}
                  </Link>
                ) : (
                  `Operación ${conv.order.code}`
                )}
              </>
            )}
          </p>
        </div>
        <span className={`text-[11px] ${connected ? 'text-emerald-700' : 'text-ink-muted'}`}>{connected ? '● En línea' : 'Actualización periódica'}</span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto bg-stone-50 p-4" aria-live="polite">
        {messages.length === 0 && <p className="py-10 text-center text-sm text-ink-muted">Aún no hay mensajes.</p>}
        {messages.map((m, i) => {
          const own = mine(m);
          const isLastOwn = own && !messages.slice(i + 1).some(mine);
          const read = !!otherReadAt && new Date(otherReadAt) >= new Date(m.createdAt);
          return (
            <div key={m.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-none px-3 py-2 text-sm shadow-sm ${own ? 'bg-ink text-white' : 'bg-white text-ink'}`}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${own ? 'text-stone-300' : 'text-ink-muted'}`} title={formatDateTime(m.createdAt)}>
                  {formatTime(m.createdAt)}
                  {own && (read ? <CheckCheck className="h-3 w-3" aria-label="Leído" /> : <Check className="h-3 w-3" aria-label="Enviado" />)}
                  {own && isLastOwn && read && <span className="sr-only">Leído</span>}
                </p>
              </div>
            </div>
          );
        })}
        {typing && <p className="text-xs italic text-ink-muted">Escribiendo…</p>}
        <div ref={endRef} />
      </div>
      {side === 'admin' ? (
        <p className="border-t border-stone-200 px-4 py-3 text-center text-xs text-ink-muted">Supervisión de solo lectura.</p>
      ) : (
        <form onSubmit={submit} className="border-t border-stone-200 p-3">
          {send.isError && <Alert kind="error" className="mb-2">{errorMessage(send.error)}</Alert>}
          <div className="flex gap-2">
            <label htmlFor={`msg-${conversationId}`} className="sr-only">
              Mensaje
            </label>
            <textarea
              id={`msg-${conversationId}`}
              rows={1}
              className="input min-h-[42px] resize-none"
              placeholder="Escribe un mensaje…"
              value={body}
              maxLength={4000}
              onChange={(e) => {
                setBody(e.target.value);
                socket?.emit('typing', conversationId);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit(e);
                }
              }}
            />
            <button type="submit" className="btn-primary px-3" disabled={!body.trim() || send.isPending} aria-label="Enviar mensaje">
              <Send className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function ConversationList({ items, activeId, onSelect, perspective }: { items: Conversation[]; activeId?: string; onSelect: (id: string) => void; perspective: 'customer' | 'staff' }) {
  return (
    <ul className="divide-y divide-stone-100">
      {items.map((c) => (
        <li key={c.id}>
          <button type="button" onClick={() => onSelect(c.id)} className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-stone-50 ${activeId === c.id ? 'bg-stone-100' : ''}`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-200 text-sm font-semibold">
              {(perspective === 'customer' ? c.seller.displayName : c.customer.fullName).charAt(0)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{perspective === 'customer' ? c.seller.displayName : c.customer.fullName}</span>
                {c.unread > 0 && <span className="rounded-full bg-brass px-1.5 text-[10px] font-bold text-white">{c.unread}</span>}
              </span>
              <span className="block truncate text-xs text-ink-muted">{c.lastMessage?.body ?? 'Sin mensajes'}</span>
              <span className="block text-[11px] text-stone-400">
                {c.order ? `${c.order.code} · ` : ''}
                {CONVERSATION_STATUS_LABELS[c.status]}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
