import type { Role } from './enums';

export const PERMISSIONS = [
  'catalog:manage',
  'inventory:manage',
  'prices:manage',
  'sellers:manage',
  'users:manage',
  'orders:view_all',
  'orders:view_assigned',
  'orders:operate',
  'orders:cancel',
  'payments:review',
  'proofs:view',
  'rates:manage',
  'settings:manage',
  'pickup:manage',
  'audit:view',
  'reports:view',
  'chat:attend',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Permisos base por rol. Los vendedores pueden recibir permisos adicionales
 * (revisión de pagos, ver comprobantes) mediante banderas en su ficha.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  SELLER: ['orders:view_assigned', 'orders:operate', 'chat:attend'],
  CUSTOMER: [],
};

export interface SellerFlags {
  canReviewPayments: boolean;
  canViewProofs: boolean;
}

export function permissionsFor(role: Role, seller?: SellerFlags | null): Permission[] {
  const base = new Set<Permission>(ROLE_PERMISSIONS[role]);
  if (role === 'SELLER' && seller) {
    if (seller.canViewProofs) base.add('proofs:view');
    if (seller.canReviewPayments) {
      base.add('payments:review');
      base.add('proofs:view');
    }
  }
  return [...base];
}
