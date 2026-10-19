import { useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import { Alert, Spinner } from '../components/ui';

/** Abre el perfil del cliente en este dispositivo con un enlace de un solo uso enviado por su vendedor. */
export function AccessPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const started = useRef(false);
  const m = useMutation({
    mutationFn: () => api('/api/auth/access', { body: { token } }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      navigate('/cuenta', { replace: true });
    },
  });
  useEffect(() => {
    if (token && !started.current) {
      started.current = true;
      m.mutate();
    }
  }, [token, m]);
  return (
    <div className="container-page flex justify-center py-16">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-3xl">Acceso a tu cuenta</h1>
        {!token && <Alert kind="error" className="mt-4">Falta el enlace de acceso.</Alert>}
        {m.isPending && <Spinner label="Verificando enlace…" />}
        {m.isError && (
          <Alert kind="error" className="mt-4" title="Enlace no válido">
            {errorMessage(m.error)} <Link to="/contacto" className="underline">Contactar a un vendedor</Link>
          </Alert>
        )}
      </div>
    </div>
  );
}
