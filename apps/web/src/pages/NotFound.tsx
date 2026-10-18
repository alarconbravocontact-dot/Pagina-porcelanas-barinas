import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="container-page flex flex-col items-center py-24 text-center">
      <p className="font-display text-7xl text-stone-300">404</p>
      <h1 className="mt-4 text-2xl">Página no encontrada</h1>
      <p className="mt-2 text-ink-muted">La dirección no existe o ya no está disponible.</p>
      <div className="mt-6 flex gap-3">
        <Link to="/" className="btn-primary">
          Ir al inicio
        </Link>
        <Link to="/catalogo" className="btn-outline">
          Ver catálogo
        </Link>
      </div>
    </div>
  );
}
