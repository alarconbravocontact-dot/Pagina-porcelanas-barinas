import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { api, ApiError, toQuery } from '../lib/api';
import { validateProofFile } from '../components/PaymentForm';
import { Alert, ErrorState } from '../components/ui';

afterEach(() => vi.restoreAllMocks());

describe('cliente de la API', () => {
  it('convierte respuestas de error en ApiError con campos', async () => {
    document.cookie = 'csrf_token=abc';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Revise los datos', details: { fields: { sellerId: 'Requerido' } } } }), { status: 400 }),
    );
    const err = (await api('/api/orders', { body: {} }).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.fields.sellerId).toBe('Requerido');
    const init = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]![1];
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('abc');
  });

  it('reporta errores de red con un mensaje recuperable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const err = (await api('/api/catalog').catch((e) => e)) as ApiError;
    expect(err.code).toBe('NETWORK');
  });

  it('construye cadenas de consulta omitiendo vacíos', () => {
    expect(toQuery({ a: 'x', b: '', c: undefined, d: 2 })).toBe('?a=x&d=2');
  });
});

describe('validación de comprobantes en el navegador', () => {
  it('acepta imágenes permitidas y rechaza otros formatos o tamaños', () => {
    expect(validateProofFile(new File(['x'], 'a.png', { type: 'image/png' }), 5)).toBeNull();
    expect(validateProofFile(new File(['x'], 'a.pdf', { type: 'application/pdf' }), 5)).toMatch(/Formato/);
    expect(validateProofFile(new File([new Uint8Array(2 * 1024 * 1024)], 'a.jpg', { type: 'image/jpeg' }), 1)).toMatch(/máximo/);
  });
});

describe('componentes de estado', () => {
  it('muestra errores con opción de reintentar', () => {
    const retry = vi.fn();
    render(<ErrorState error={new ApiError(500, 'INTERNAL', 'Fallo')} onRetry={retry} />);
    expect(screen.getByText('Fallo')).toBeInTheDocument();
    screen.getByRole('button', { name: /Reintentar/ }).click();
    expect(retry).toHaveBeenCalled();
  });
  it('las alertas de error usan role=alert', () => {
    render(<Alert kind="error">Problema</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Problema');
  });
});
