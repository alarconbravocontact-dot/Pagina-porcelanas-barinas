import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { passwordSchema } from '@porcelanas/shared';
import { api, errorMessage } from '../lib/api';
import { Alert, Field, Spinner } from '../components/ui';

/** Activación de cuenta con enlace de un solo uso: el propio usuario define su contraseña. */
export function ActivationPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const check = useQuery({
    queryKey: ['activation', token],
    queryFn: () => api<{ email: string; name: string | null; role: string }>('/api/auth/activation/check', { body: { token } }),
    enabled: token.length >= 20,
    retry: false,
  });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const activate = useMutation({
    mutationFn: () => api<{ role: string }>('/api/auth/activate', { body: { token, password } }),
    onSuccess: async (r) => {
      await qc.invalidateQueries();
      navigate(r.role === 'ADMIN' ? '/admin' : r.role === 'SELLER' ? '/vendedor' : '/cuenta', { replace: true });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = passwordSchema.safeParse(password);
    if (!r.success) return setErr(r.error.issues[0]!.message);
    if (password !== confirm) return setErr('Las contraseñas no coinciden');
    setErr(null);
    activate.mutate();
  };
  return (
    <div className="container-page flex justify-center py-16">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-3xl">Activar cuenta</h1>
        {!token && <Alert kind="error" className="mt-4">Falta el enlace de activación.</Alert>}
        {check.isLoading && <Spinner label="Verificando enlace…" />}
        {check.isError && (
          <Alert kind="error" className="mt-4" title="Enlace no válido">
            {errorMessage(check.error)} <Link to="/contacto" className="underline">Contacto</Link>
          </Alert>
        )}
        {check.data && (
          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <p className="text-sm text-ink-soft">
              {check.data.name ? `${check.data.name}, ` : ''}define la contraseña de <strong>{check.data.email}</strong>. El enlace solo puede usarse una vez.
            </p>
            {(err || activate.isError) && <Alert kind="error">{err ?? errorMessage(activate.error)}</Alert>}
            <Field label="Nueva contraseña" htmlFor="ac-pw" hint="Mínimo 10 caracteres, con letras y números.">
              <input id="ac-pw" type="password" autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Repite la contraseña" htmlFor="ac-pw2">
              <input id="ac-pw2" type="password" autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            <button type="submit" className="btn-primary w-full py-3" disabled={activate.isPending}>
              {activate.isPending ? 'Activando…' : 'Activar y entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
