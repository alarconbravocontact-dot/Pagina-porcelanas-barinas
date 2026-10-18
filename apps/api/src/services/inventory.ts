import type { InventoryMovementType } from '@prisma/client';
import type { Tx } from '../db';
import { conflict } from '../lib/errors';

export interface AdjustInput {
  productId: string;
  type: InventoryMovementType;
  deltaOnHand: number;
  deltaReserved: number;
  reason: string;
  orderId?: string | null;
  userId?: string | null;
}

/**
 * Ajusta existencias de forma atómica. La actualización condicional garantiza que
 * nunca queden existencias negativas ni reservas mayores al inventario físico, aun
 * con solicitudes concurrentes (PostgreSQL reevalúa la condición tras el bloqueo de fila).
 */
export async function adjustInventory(tx: Tx, input: AdjustInput) {
  const rows = await tx.$queryRaw<{ onHandBoxes: number; reservedBoxes: number }[]>`
    UPDATE "Inventory"
       SET "onHandBoxes" = "onHandBoxes" + ${input.deltaOnHand}::int,
           "reservedBoxes" = "reservedBoxes" + ${input.deltaReserved}::int,
           "updatedAt" = now()
     WHERE "productId" = ${input.productId}::uuid
       AND "onHandBoxes" + ${input.deltaOnHand}::int >= 0
       AND "reservedBoxes" + ${input.deltaReserved}::int >= 0
       AND "reservedBoxes" + ${input.deltaReserved}::int <= "onHandBoxes" + ${input.deltaOnHand}::int
     RETURNING "onHandBoxes", "reservedBoxes"`;
  const row = rows[0];
  if (!row) {
    throw conflict('INSUFFICIENT_STOCK', 'No hay existencias suficientes para completar la operación', {
      productId: input.productId,
    });
  }
  await tx.inventoryMovement.create({
    data: {
      productId: input.productId,
      type: input.type,
      deltaOnHand: input.deltaOnHand,
      deltaReserved: input.deltaReserved,
      onHandAfter: row.onHandBoxes,
      reservedAfter: row.reservedBoxes,
      reason: input.reason,
      orderId: input.orderId ?? null,
      userId: input.userId ?? null,
    },
  });
  return row;
}

export function stockStatus(available: number, threshold: number): 'IN_STOCK' | 'LOW' | 'OUT' {
  if (available <= 0) return 'OUT';
  if (available <= threshold) return 'LOW';
  return 'IN_STOCK';
}
