/** Cliente HTTP de la API: cookies de sesión, token CSRF de doble envío y errores tipados. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { fields?: Record<string, string>; [k: string]: unknown },
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get fields(): Record<string, string> {
    return this.details?.fields ?? {};
  }
}

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

let csrfFallback: string | null = null;
export function setCsrfToken(token: string | null) {
  csrfFallback = token;
}

async function ensureCsrf(): Promise<string> {
  const fromCookie = readCookie('csrf_token');
  if (fromCookie) return fromCookie;
  if (csrfFallback) return csrfFallback;
  const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  csrfFallback = data.csrfToken ?? null;
  return readCookie('csrf_token') ?? csrfFallback ?? '';
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') headers['x-csrf-token'] = await ensureCsrf();
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body, credentials: 'same-origin', signal: opts.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: ApiError['details'] } } | null)?.error;
    if (e?.code === 'CSRF') csrfFallback = null;
    throw new ApiError(res.status, e?.code ?? 'HTTP_ERROR', e?.message ?? `Error ${res.status}`, e?.details);
  }
  return data as T;
}

export const newIdempotencyKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Ocurrió un error inesperado';
}

export function toQuery(params: Record<string, string | number | undefined | null | false>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}
