import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUp, ExternalLink, MessageSquareText, RotateCcw, X } from 'lucide-react';
import { api, errorMessage } from '../lib/api';

interface ProductSummary {
  sku: string;
  name: string;
  size: string;
  priceM2: string;
  priceBox: string;
  availableBoxes: number;
  url: string;
  imageUrl: string | null;
}

interface Action {
  label: string;
  url: string;
}

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
  products?: ProductSummary[];
  actions?: Action[];
  suggestions?: string[];
  error?: boolean;
}

interface AssistantReply {
  reply: string;
  provider: 'claude' | 'local';
  products?: ProductSummary[];
  actions?: Action[];
  suggestions?: string[];
}

const STORAGE_KEY = 'porcelanas.assistant';
const WELCOME: AssistantMessage = {
  role: 'assistant',
  content: '¡Hola! Soy el asistente virtual de la galería. Te ayudo a encontrar porcelanatos, calcular cuántas cajas necesitas, y con el horario, los pagos o el estado de tu orden.',
  suggestions: ['Porcelanato para baño', '¿Cuántas cajas necesito para 30 m²?', '¿Cuál es el horario?', '¿Qué métodos de pago aceptan?'],
};

function loadHistory(): AssistantMessage[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as AssistantMessage[]) : null;
    return Array.isArray(parsed) && parsed.length ? parsed : [WELCOME];
  } catch {
    return [WELCOME];
  }
}

function saveHistory(messages: AssistantMessage[]) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
  } catch {
    // Sin almacenamiento: la conversación dura mientras la ventana esté abierta.
  }
}

const isExternal = (url: string) => /^https?:\/\//.test(url);

/** Producto de la ficha abierta o, si no, el último que el asistente mostró solo. */
function contextSku(pathname: string, messages: AssistantMessage[]): string | undefined {
  const m = pathname.match(/^\/producto\/([^/]+)$/);
  if (m) return decodeURIComponent(m[1]!);
  for (let i = messages.length - 1; i >= 0; i--) {
    const p = messages[i]!.products;
    if (p?.length) return p.length === 1 ? p[0]!.sku : undefined;
  }
  return undefined;
}

export function AssistantChat() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>(loadHistory);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => saveHistory(messages), [messages]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, open]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // El asistente es para clientes y visitantes; el personal tiene su propio panel.
  if (pathname.startsWith('/admin') || pathname.startsWith('/vendedor')) return null;

  const send = async (raw: string) => {
    const content = raw.trim().slice(0, 1500);
    if (!content || busy) return;
    const next = [...messages.filter((m) => !m.error), { role: 'user' as const, content }];
    setMessages(next);
    setText('');
    setBusy(true);
    try {
      const history = next.filter((m, i) => !(i === 0 && m === WELCOME)).slice(-20);
      const res = await api<AssistantReply>('/api/assistant/messages', {
        body: { messages: history.map(({ role, content: c }) => ({ role, content: c })), context: { sku: contextSku(pathname, next) } },
      });
      setMessages((m) => [...m, { role: 'assistant', content: res.reply, products: res.products, actions: res.actions, suggestions: res.suggestions }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: `No pude responder: ${errorMessage(err)}`, error: true }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(text);
  };

  const lastSuggestions = !busy ? messages[messages.length - 1]?.suggestions : undefined;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-6 z-40 flex h-12 items-center gap-2 rounded-full bg-ink px-4 text-xs uppercase tracking-[0.16em] text-white shadow-gallery transition hover:bg-ink-soft"
          aria-label="Abrir el asistente virtual"
          data-tour="assistant"
          data-testid="assistant-launcher"
        >
          <MessageSquareText className="h-5 w-5" aria-hidden />
          <span className="hidden sm:inline">Asistente</span>
        </button>
      )}
      {open && (
        <section
          role="dialog"
          aria-label="Asistente virtual"
          className="fixed inset-x-3 bottom-3 z-50 flex h-[min(620px,calc(100dvh-24px))] flex-col border border-stone-200 bg-white shadow-gallery sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[min(620px,calc(100dvh-48px))] sm:w-[400px] animate-tour-in motion-reduce:animate-none"
          data-testid="assistant"
        >
          <header className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-4">
            <div>
              <p className="eyebrow">Asistente virtual</p>
              <p className="mt-1 font-display text-2xl font-light leading-none">¿En qué te ayudo?</p>
            </div>
            <div className="-mr-2 flex items-center">
              <button
                type="button"
                className="p-2 text-ink-muted hover:text-ink"
                onClick={() => setMessages([WELCOME])}
                aria-label="Nueva conversación"
                title="Nueva conversación"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" className="p-2 text-ink-muted hover:text-ink" onClick={() => setOpen(false)} aria-label="Cerrar el asistente">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </header>

          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
                <div
                  className={`max-w-[88%] whitespace-pre-line px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user' ? 'bg-ink text-white' : m.error ? 'border-l-2 border-red-800 bg-[#f8f2f2] text-[#6e2a2a]' : 'bg-stone-100 text-ink'
                  }`}
                  data-role={m.role}
                >
                  {m.content}
                </div>
                {m.products && m.products.length > 0 && (
                  <ul className="mt-2 grid grid-cols-1 gap-2">
                    {m.products.map((p) => (
                      <li key={p.sku}>
                        <Link to={p.url} className="flex items-center gap-3 border border-stone-200 p-2 transition hover:border-ink" onClick={() => setOpen(window.innerWidth >= 640)}>
                          {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-14 w-14 shrink-0 object-cover" /> : <span className="h-14 w-14 shrink-0 bg-stone-100" aria-hidden />}
                          <span className="min-w-0">
                            <span className="block truncate text-sm">{p.name}</span>
                            <span className="block text-xs text-ink-muted">
                              {p.size} · {p.priceM2}/m² · {p.priceBox}/caja
                            </span>
                            <span className="block text-[10px] uppercase tracking-[0.14em] text-ink-muted">{p.availableBoxes > 0 ? `${p.availableBoxes} cajas disponibles` : 'Consultar disponibilidad'}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.actions.map((a) =>
                      isExternal(a.url) ? (
                        <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm">
                          {a.label} <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      ) : (
                        <Link key={a.url} to={a.url} className="btn-outline btn-sm" onClick={() => setOpen(window.innerWidth >= 640)}>
                          {a.label}
                        </Link>
                      ),
                    )}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="inline-flex items-center gap-1 bg-stone-100 px-4 py-3" role="status" aria-label="El asistente está escribiendo">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted" style={{ animationDelay: `${d * 150}ms` }} />
                ))}
              </div>
            )}
          </div>

          {lastSuggestions && lastSuggestions.length > 0 && (
            <div className="flex gap-2 overflow-x-auto border-t border-stone-100 px-5 py-2">
              {lastSuggestions.map((s) => (
                <button key={s} type="button" className="shrink-0 border border-stone-300 px-3 py-1.5 text-xs text-ink-soft transition hover:border-ink hover:text-ink" onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={onSubmit} className="border-t border-stone-200 px-4 py-3">
            <div className="flex items-end gap-2">
              <label htmlFor="assistant-input" className="sr-only">
                Escribe tu pregunta
              </label>
              <textarea
                id="assistant-input"
                ref={inputRef}
                rows={1}
                maxLength={1500}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(text);
                  }
                }}
                placeholder="Escribe tu pregunta…"
                className="max-h-28 min-h-[40px] flex-1 resize-none border-0 border-b border-stone-300 bg-transparent px-1 py-2 text-sm focus:border-ink focus:outline-none focus:ring-0"
              />
              <button type="submit" className="btn-primary h-10 w-10 shrink-0 px-0" disabled={busy || !text.trim()} aria-label="Enviar">
                <ArrowUp className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-ink-muted">
              Asistente automático: puede equivocarse. Lo que vale es tu orden de compra y la confirmación de tu vendedor. No escribas tu cédula ni claves.{' '}
              <Link to="/politicas#asistente" className="underline underline-offset-2 hover:text-ink">
                Uso del asistente de IA
              </Link>
            </p>
          </form>
        </section>
      )}
    </>
  );
}
