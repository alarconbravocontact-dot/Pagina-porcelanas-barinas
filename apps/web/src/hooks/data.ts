import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { CartView, PaymentMethod, PublicSettings, RateStatus, Seller } from '../lib/types';
import type { QuantityMode } from '@porcelanas/shared';

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api<PublicSettings>('/api/settings/public'), staleTime: 5 * 60_000 });
}

export function useRate() {
  return useQuery({
    queryKey: ['rate'],
    queryFn: () => api<{ rate: RateStatus | null; maxAgeHours: number; blockWhenStale: boolean }>('/api/rates/current'),
    staleTime: 5 * 60_000,
  });
}

export function useSellers() {
  return useQuery({ queryKey: ['sellers'], queryFn: () => api<Seller[]>('/api/sellers'), staleTime: 60_000 });
}

export function usePaymentMethods() {
  return useQuery({ queryKey: ['payment-methods'], queryFn: () => api<PaymentMethod[]>('/api/payment-methods'), staleTime: 60_000 });
}

export function useCart() {
  return useQuery({ queryKey: ['cart'], queryFn: () => api<CartView>('/api/cart'), staleTime: 10_000 });
}

export function useCartMutations() {
  const qc = useQueryClient();
  const onSuccess = (data: CartView) => qc.setQueryData(['cart'], data);
  return {
    add: useMutation({
      mutationFn: (v: { productId: string; mode: QuantityMode; quantity: string | number }) => api<CartView>('/api/cart/items', { body: v }),
      onSuccess,
    }),
    update: useMutation({
      mutationFn: (v: { id: string; mode: QuantityMode; quantity: string | number }) =>
        api<CartView>(`/api/cart/items/${v.id}`, { method: 'PATCH', body: { mode: v.mode, quantity: v.quantity } }),
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<CartView>(`/api/cart/items/${id}`, { method: 'DELETE' }),
      onSuccess,
    }),
  };
}

export function useCustomerProfile(enabled: boolean) {
  return useQuery({
    queryKey: ['customer-profile'],
    queryFn: () => api<import('../lib/types').CustomerProfile>('/api/customers/me'),
    enabled,
    staleTime: 60_000,
  });
}
