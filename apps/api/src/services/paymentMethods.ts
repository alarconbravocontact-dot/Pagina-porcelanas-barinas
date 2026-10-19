import type { PaymentMethod } from '@prisma/client';

/**
 * Un método solo es seleccionable si está activo y configurado: los métodos electrónicos
 * requieren datos de recepción; el efectivo solo requiere instrucciones.
 */
export function isMethodConfigured(m: Pick<PaymentMethod, 'kind' | 'receivingDetails' | 'instructions'>) {
  return m.kind === 'CASH' ? m.instructions.trim().length >= 5 : m.receivingDetails.trim().length > 0;
}

export function publicMethod(m: PaymentMethod) {
  const configured = isMethodConfigured(m);
  return {
    id: m.id,
    kind: m.kind,
    name: m.name,
    currency: m.currency,
    priceList: m.currency === 'VES' ? ('BCV' as const) : ('DIVISA' as const),
    // Mientras no esté configurado no se exponen instrucciones que puedan inducir a pagar.
    instructions: configured ? m.instructions : '',
    receivingDetails: configured ? m.receivingDetails : '',
    buyerNote: configured ? m.buyerNote : '',
    proofInstructions: m.proofInstructions,
    requiresProof: m.requiresProof,
    configured,
    available: m.active && configured,
    sortOrder: m.sortOrder,
  };
}
