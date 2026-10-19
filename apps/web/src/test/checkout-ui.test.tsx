import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomerProfileForm } from '../components/CustomerProfileForm';
import { OrderRegisteredBanner, visitMessage } from '../components/OrderConfirmation';
import type { Order } from '../lib/types';

afterEach(() => vi.restoreAllMocks());

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

describe('formulario de los cuatro datos', () => {
  it('valida en el navegador y no envía datos inválidos', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    wrap(<CustomerProfileForm />);
    // 4 datos: nombre, ubicación (ciudad + zona), teléfono y cédula.
    expect(screen.getAllByRole('textbox')).toHaveLength(5);
    expect(screen.getByLabelText('Teléfono')).toBeInTheDocument();
    expect(screen.queryByLabelText(/correo/i)).toBeNull();
    expect(screen.queryByLabelText(/contraseña/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y continuar' }));
    expect(await screen.findByText('Escriba su nombre y apellido')).toBeInTheDocument();
    expect(screen.getByText('Indique su ciudad')).toBeInTheDocument();
    expect(screen.getByText('Indique una zona o dirección de referencia')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('envía los datos válidos al servidor', async () => {
    document.cookie = 'csrf_token=t';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ created: true, profile: { fullName: 'Ana Rojas', complete: true } }), { status: 201 }),
    );
    const onSaved = vi.fn();
    wrap(<CustomerProfileForm onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Ana Rojas' } });
    fireEvent.change(screen.getByLabelText('Ciudad'), { target: { value: 'Barinas' } });
    fireEvent.change(screen.getByLabelText('Zona o dirección de referencia'), { target: { value: 'Centro' } });
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '04125550000' } });
    fireEvent.change(screen.getByLabelText('Cédula de identidad'), { target: { value: 'V-12345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y continuar' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/customers/profile');
    expect(init.method).toBe('PUT');
  });
});

const order = {
  code: 'PC-AB23CD45',
  pickupDate: '2026-10-25',
  paymentReviewState: 'PROOF_RECEIVED',
  seller: { id: 's', displayName: 'Juan Alarcon', city: 'Barinas', publicPhone: '04125552594', whatsapp: '584125552594', publicEmail: 'alarconbravocontact@gmail.com' },
} as unknown as Order;

describe('cartel de orden registrada', () => {
  it('muestra el mensaje exacto, los datos del vendedor y no da el pago por confirmado', () => {
    const view = vi.fn();
    wrap(<OrderRegisteredBanner order={order} onViewOrder={view} />);
    expect(screen.getByRole('heading', { name: '¡Tu orden de compra ha sido registrada!' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Para garantizar una atención adecuada, antes de dirigirte a nuestra sede en Barinas, debes contactar a tu vendedor asignado para que esté preparado para recibirte y atender tu pedido.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Juan Alarcon')).toBeInTheDocument();
    expect(screen.getByText('04125552594')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'alarconbravocontact@gmail.com' })).toHaveAttribute('href', 'mailto:alarconbravocontact@gmail.com');
    expect(screen.getByText('Ten a mano tu número de orden cuando te comuniques con el vendedor.')).toBeInTheDocument();
    expect(screen.getByTestId('banner-order-code')).toHaveTextContent('PC-AB23CD45');
    expect(screen.getByText('Comprobante recibido')).toBeInTheDocument();
    expect(screen.queryByText(/pago confirmado/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver mi orden de compra' }));
    expect(view).toHaveBeenCalled();
  });

  it('el botón de WhatsApp abre el número internacional con el número de orden real', () => {
    wrap(<OrderRegisteredBanner order={order} onViewOrder={() => undefined} />);
    const href = screen.getByTestId('banner-whatsapp').getAttribute('href')!;
    expect(href.startsWith('https://wa.me/584125552594?text=')).toBe(true);
    const text = decodeURIComponent(href.split('text=')[1]!);
    expect(text).toBe(
      'Hola, Juan. Acabo de realizar una orden de compra de porcelanas en la plataforma. Mi número de orden es PC-AB23CD45. Quiero coordinar mi visita a la sede de Barinas para que puedas recibirme y atender mi pedido.',
    );
    expect(visitMessage(order)).toBe(text);
  });
});
