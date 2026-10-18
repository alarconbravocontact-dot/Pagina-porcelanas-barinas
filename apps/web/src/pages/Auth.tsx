import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { registerSchema } from '@porcelanas/shared';
import { api, ApiError, errorMessage } from '../lib/api';
import { useSession } from '../hooks/session';
import { Alert, Field } from '../components/ui';

function safeNext(next: string | null, fallback: string) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}

export function LoginPage() {
  const { login, user } = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={safeNext(params.get('next'), user.role === 'ADMIN' ? '/admin' : user.role === 'SELLER' ? '/vendedor' : '/cuenta')} replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(email, password);
      navigate(safeNext(params.get('next'), u?.role === 'ADMIN' ? '/admin' : u?.role === 'SELLER' ? '/vendedor' : '/cuenta'), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="container-page flex justify-center py-16">
      <form onSubmit={submit} className="card w-full max-w-md p-8" noValidate>
        <h1 className="text-2xl">Iniciar sesión</h1>
        <p className="mt-1 text-sm text-ink-muted">Accede a tus compras, reservas y conversaciones.</p>
        {error && <Alert kind="error" className="mt-4">{error}</Alert>}
        <div className="mt-6 space-y-4">
          <Field label="Correo electrónico" htmlFor="email">
            <input id="email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Contraseña" htmlFor="password">
            <input id="password" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
        </div>
        <button type="submit" className="btn-primary mt-6 w-full py-3" disabled={busy}>
          {busy ? 'Ingresando…' : 'Ingresar'}
        </button>
        <p className="mt-4 text-center text-sm text-ink-muted">
          ¿No tienes cuenta?{' '}
          <Link to={`/registro${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="font-medium text-brass hover:underline">
            Crear cuenta
          </Link>
        </p>
      </form>
    </div>
  );
}

export function RegisterPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useSession();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={safeNext(params.get('next'), '/cuenta')} replace />;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      const f: Record<string, string> = {};
      for (const i of parsed.error.issues) f[i.path.join('.')] ??= i.message;
      setFields(f);
      return;
    }
    setFields({});
    setBusy(true);
    try {
      await api('/api/auth/register', { body: parsed.data });
      await qc.invalidateQueries();
      navigate(safeNext(params.get('next'), '/cuenta'), { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setFields(err.fields);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="container-page flex justify-center py-16">
      <form onSubmit={submit} className="card w-full max-w-md p-8" noValidate>
        <h1 className="text-2xl">Crear cuenta</h1>
        <p className="mt-1 text-sm text-ink-muted">Solo pedimos los datos necesarios para gestionar tus operaciones.</p>
        {error && <Alert kind="error" className="mt-4">{error}</Alert>}
        <div className="mt-6 space-y-4">
          <Field label="Nombre completo" htmlFor="fullName" error={fields.fullName}>
            <input id="fullName" autoComplete="name" className="input" value={form.fullName} onChange={set('fullName')} />
          </Field>
          <Field label="Correo electrónico" htmlFor="remail" error={fields.email}>
            <input id="remail" type="email" autoComplete="email" className="input" value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Teléfono" htmlFor="phone" error={fields.phone} hint="Ej.: +58 412 1234567">
            <input id="phone" type="tel" autoComplete="tel" className="input" value={form.phone} onChange={set('phone')} />
          </Field>
          <Field label="Contraseña" htmlFor="rpassword" error={fields.password} hint="Mínimo 10 caracteres, con letras y números.">
            <input id="rpassword" type="password" autoComplete="new-password" className="input" value={form.password} onChange={set('password')} />
          </Field>
        </div>
        <button type="submit" className="btn-primary mt-6 w-full py-3" disabled={busy}>
          {busy ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
        <p className="mt-4 text-center text-sm text-ink-muted">
          ¿Ya tienes cuenta?{' '}
          <Link to={`/ingresar${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="font-medium text-brass hover:underline">
            Iniciar sesión
          </Link>
        </p>
      </form>
    </div>
  );
}
