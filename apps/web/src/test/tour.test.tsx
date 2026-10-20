import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GuidedTour, resolveSteps } from '../components/GuidedTour';
import { TOURS, tourFor, type Tour } from '../lib/tours';

vi.mock('../hooks/session', () => ({ useSession: () => ({ user: null }) }));

// jsdom no calcula diseño: cualquier elemento con contenido cuenta como visible.
beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const size = this.textContent ? 100 : 0;
    return { top: 200, left: 40, width: size, height: size, bottom: 200 + size, right: 40 + size, x: 40, y: 200, toJSON: () => ({}) } as DOMRect;
  });
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('recorridos por ventana', () => {
  it('cada ventana principal tiene su recorrido', () => {
    const paths = ['/', '/catalogo', '/producto/BRN-1', '/carrito', '/checkout', '/como-comprar', '/contacto', '/cuenta', '/cuenta/operaciones/PC-ABC', '/vendedor', '/vendedor/pagos', '/admin', '/admin/operaciones/x', '/admin/configuracion', '/admin/tasa'];
    for (const p of paths) expect(tourFor(p), p).toBeDefined();
    expect(tourFor('/catalogo/')?.id).toBe('catalogo');
    expect(tourFor('/no-existe')).toBeUndefined();
    expect(new Set(TOURS.map((t) => t.id)).size).toBe(TOURS.length);
  });

  it('omite los pasos sin contenido visible y avisa si no queda ninguno', () => {
    const tour: Tour = {
      id: 't',
      window: 'Prueba',
      match: /^\/t$/,
      steps: [
        { target: ['#a'], title: 'A', body: '' },
        { target: ['#falta'], title: 'B', body: '' },
        { target: ['h:Pagos'], title: 'C', body: '' },
      ],
      empty: 'Sin datos todavía',
    };
    document.body.innerHTML = '<main id="contenido"><div id="a">hola</div><section class="card"><h2>Pagos</h2></section></main>';
    expect(resolveSteps(tour).map((s) => s.title)).toEqual(['A', 'C']);
    document.body.innerHTML = '<main id="contenido"></main>';
    expect(resolveSteps(tour)).toEqual([{ title: 'Prueba', body: 'Sin datos todavía' }]);
  });

  it('el botón abre el recorrido, avanza con Siguiente y se cierra con Esc recordando que se vio', async () => {
    render(
      <MemoryRouter initialEntries={['/como-comprar']}>
        <main id="contenido">
          <div data-tour="howto-modes">Dos modalidades</div>
          <div data-tour="howto-hours">Horario</div>
        </main>
        <GuidedTour />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('tour-launcher'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Cómo comprar · 1 de 2');
    expect(screen.getByRole('heading', { name: 'Dos modalidades' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByRole('heading', { name: 'Días y horarios' })).toBeInTheDocument();
    expect(screen.getByText(/lunes a viernes, de 8:00 a\. m\. a 5:00 p\. m\./)).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem('porcelanas.tour.como-comprar')).toBe('1');
  });
});
