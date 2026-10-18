import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { PricingError } from '@porcelanas/shared';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Debe iniciar sesión') => new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'No tiene permisos para esta acción') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Recurso no encontrado') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (code: string, message: string, details?: unknown) => new AppError(409, code, message, details);

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw result.error;
  return result.data;
}

export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message, details: error.details } });
  }
  if (error instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    return reply
      .status(400)
      .send({ error: { code: 'VALIDATION_ERROR', message: 'Revise los datos enviados', details: { fields } } });
  }
  if (error instanceof PricingError) {
    return reply.status(400).send({ error: { code: 'INVALID_QUANTITY', message: error.message } });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return reply
        .status(409)
        .send({ error: { code: 'DUPLICATE', message: 'Ya existe un registro con esos datos', details: { target: error.meta?.target } } });
    }
    if (error.code === 'P2025') {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
    }
    if (error.code === 'P2003') {
      return reply.status(409).send({ error: { code: 'IN_USE', message: 'El registro está relacionado con otros datos' } });
    }
  }
  const fe = error as FastifyError;
  if (fe.statusCode === 429) {
    return reply.status(429).send({ error: { code: 'RATE_LIMITED', message: 'Demasiadas solicitudes. Intente de nuevo en unos minutos.' } });
  }
  if (fe.code === 'FST_REQ_FILE_TOO_LARGE' || fe.code === 'FST_FILES_LIMIT' || fe.code === 'FST_PARTS_LIMIT') {
    return reply.status(413).send({ error: { code: 'FILE_TOO_LARGE', message: 'El archivo supera el tamaño permitido' } });
  }
  if (fe.code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') {
    return reply.status(415).send({ error: { code: 'INVALID_CONTENT_TYPE', message: 'Se esperaba un formulario multipart' } });
  }
  if (fe.statusCode && fe.statusCode >= 400 && fe.statusCode < 500) {
    return reply.status(fe.statusCode).send({ error: { code: fe.code ?? 'BAD_REQUEST', message: fe.message } });
  }
  request.log.error({ err: error }, 'Error no controlado');
  return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Ocurrió un error interno. Intente nuevamente.' } });
}
