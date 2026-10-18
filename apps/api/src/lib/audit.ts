import type { FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from '../db';

export async function audit(
  request: FastifyRequest | null,
  action: string,
  entityType: string,
  entityId: string | null,
  data?: Prisma.InputJsonValue,
  tx: Tx = prisma,
) {
  await tx.auditLog.create({
    data: {
      actorId: request?.auth?.userId ?? null,
      action,
      entityType,
      entityId,
      data,
      ip: request?.ip ?? null,
    },
  });
}
