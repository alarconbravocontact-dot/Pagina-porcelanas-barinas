import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AssistantChat } from '../components/AssistantChat';

beforeEach(() => {
  sessionStorage.clear();
  document.cookie = 'csrf_token=abc';
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
});
afterEach(() => vi.restoreAllMocks());

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AssistantChat />
    </MemoryRouter>,
  );

describe('asistente virtual', () => {
  it('envía la pregunta con el producto de la ficha y muestra respuesta, piezas y acciones', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          reply: 'Para 30 m² necesitas 14 cajas.',
          provider: 'local',
          products: [{ sku: 'POR-1', name: 'Porcelanato Blanco', size: '60×60', priceM2: '$ 12,50', priceBox: '$ 27,00', availableBoxes: 5, url: '/producto/POR-1', imageUrl: null }],
          actions: [{ label: 'Escribir a Juan Alarcon por WhatsApp', url: 'https://wa.me/584125552594?text=' }],
        }),
        { status: 200 },
      ),
    );
    renderAt('/producto/POR-1');
    fireEvent.click(screen.getByTestId('assistant-launcher'));
    fireEvent.change(screen.getByLabelText('Escribe tu pregunta'), { target: { value: '¿Cuántas cajas para 30 m²?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Para 30 m² necesitas 14 cajas.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Porcelanato Blanco/ })).toHaveAttribute('href', '/producto/POR-1');
    expect(screen.getByRole('link', { name: /Escribir a Juan Alarcon/ })).toHaveAttribute('target', '_blank');
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ messages: [{ role: 'user', content: '¿Cuántas cajas para 30 m²?' }], context: { sku: 'POR-1' } });
  });

  it('muestra un error recuperable y no aparece en los paneles del personal', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { unmount } = renderAt('/');
    fireEvent.click(screen.getByTestId('assistant-launcher'));
    fireEvent.click(screen.getByRole('button', { name: '¿Cuál es el horario?' }));
    await waitFor(() => expect(screen.getByText(/No pude responder/)).toBeInTheDocument());
    unmount();
    renderAt('/admin');
    expect(screen.queryByTestId('assistant-launcher')).toBeNull();
  });
});
