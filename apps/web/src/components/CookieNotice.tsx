import { useState } from 'react';
import { Link } from 'react-router-dom';

const KEY = 'porcelanas.cookies';

function seen() {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Aviso informativo: el portal solo usa cookies estrictamente necesarias (sesión, seguridad y
 * carrito), que no requieren consentimiento. No se muestra a las pruebas automatizadas.
 */
export function CookieNotice() {
  const [hidden, setHidden] = useState(() => seen() || (typeof navigator !== 'undefined' && navigator.webdriver));
  if (hidden) return null;
  const close = () => {
    try {
      window.localStorage.setItem(KEY, '1');
    } catch {
      // Sin almacenamiento: el aviso volverá a mostrarse en la próxima visita.
    }
    setHidden(true);
  };
  return (
    <div role="region" aria-label="Aviso de cookies" className="fixed inset-x-3 bottom-20 z-40 border border-stone-200 bg-white p-4 shadow-gallery sm:inset-x-auto sm:bottom-24 sm:left-6 sm:max-w-sm" data-testid="cookie-notice">
      <p className="text-sm leading-relaxed text-ink-soft">
        Usamos solo cookies necesarias para mantener tu sesión, proteger los formularios y guardar tu carrito. No usamos cookies de publicidad ni de analítica.
      </p>
      <div className="mt-3 flex items-center gap-4">
        <button type="button" className="btn-primary btn-sm" onClick={close}>
          Entendido
        </button>
        <Link to="/politicas#cookies" className="text-xs text-ink-muted underline underline-offset-4 hover:text-ink">
          Política de cookies
        </Link>
      </div>
    </div>
  );
}
