import type { FastifyRequest } from 'fastify';
import { AppError } from './errors';
import { validateImage, type ValidatedImage } from './storage';

export interface MultipartResult {
  fields: Record<string, string>;
  files: ValidatedImage[];
}

/** Lee un formulario multipart validando cada archivo (tipo real, extensión y tamaño). */
export async function readMultipart(request: FastifyRequest, maxBytes: number, maxFiles = 1): Promise<MultipartResult> {
  if (!request.isMultipart()) throw new AppError(415, 'INVALID_CONTENT_TYPE', 'Se esperaba un formulario multipart');
  const fields: Record<string, string> = {};
  const files: ValidatedImage[] = [];
  for await (const part of request.parts({ limits: { fileSize: maxBytes, files: maxFiles, fields: 30, fieldSize: 10_000 } })) {
    if (part.type === 'file') {
      const buffer = await part.toBuffer();
      if (part.file.truncated) throw new AppError(413, 'FILE_TOO_LARGE', 'El archivo supera el tamaño permitido');
      if (buffer.length === 0 && !part.filename) continue;
      files.push(validateImage(buffer, part.filename, part.mimetype, maxBytes));
    } else {
      fields[part.fieldname] = String(part.value ?? '');
    }
  }
  return { fields, files };
}
