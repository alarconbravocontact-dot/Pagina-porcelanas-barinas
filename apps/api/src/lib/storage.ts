import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';
import { badRequest, AppError } from './errors';

export const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
export type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;

const EXTENSIONS: Record<string, AllowedImageType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Detecta el tipo real del archivo por su firma (magic bytes). */
export function sniffImageType(buf: Buffer): AllowedImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  return null;
}

export interface ValidatedImage {
  buffer: Buffer;
  mimeType: AllowedImageType;
  ext: string;
  sha256: string;
  originalName: string;
}

/** Valida extensión, tipo declarado, contenido real y tamaño. */
export function validateImage(
  buffer: Buffer,
  filename: string,
  declaredMime: string,
  maxBytes: number,
): ValidatedImage {
  if (buffer.length === 0) throw badRequest('EMPTY_FILE', 'El archivo está vacío');
  if (buffer.length > maxBytes) {
    throw new AppError(413, 'FILE_TOO_LARGE', `El archivo supera el máximo de ${(maxBytes / 1024 / 1024).toFixed(1)} MB`);
  }
  const ext = path.extname(filename).slice(1).toLowerCase();
  const byExt = EXTENSIONS[ext];
  if (!byExt) throw new AppError(415, 'UNSUPPORTED_TYPE', 'Formato no permitido. Use JPG, PNG o WebP');
  const real = sniffImageType(buffer);
  if (!real) throw new AppError(415, 'UNSUPPORTED_TYPE', 'El contenido del archivo no es una imagen JPG, PNG o WebP válida');
  if (real !== byExt || (declaredMime && declaredMime !== real && !(declaredMime === 'image/jpg' && real === 'image/jpeg'))) {
    throw new AppError(415, 'TYPE_MISMATCH', 'La extensión o el tipo del archivo no coinciden con su contenido');
  }
  const safeName = path.basename(filename).replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  return {
    buffer,
    mimeType: real,
    ext: ALLOWED_IMAGE_TYPES[real],
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    originalName: safeName,
  };
}

function resolveInside(base: string, key: string): string {
  const full = path.resolve(base, key);
  if (!full.startsWith(base + path.sep)) throw new AppError(400, 'INVALID_KEY', 'Ruta inválida');
  return full;
}

async function write(base: string, key: string, data: Buffer) {
  const full = resolveInside(base, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data, { flag: 'wx', mode: 0o640 });
}

export const storage = {
  async ensureDirs() {
    await fs.mkdir(config.storage.publicDir, { recursive: true });
    await fs.mkdir(config.storage.privateDir, { recursive: true });
  },
  /** Archivos privados (comprobantes). Nunca se sirven estáticamente. */
  async savePrivate(prefix: string, img: ValidatedImage): Promise<string> {
    const now = new Date();
    const key = `${prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${img.ext}`;
    await write(config.storage.privateDir, key, img.buffer);
    return key;
  },
  async readPrivate(key: string): Promise<Buffer> {
    return fs.readFile(resolveInside(config.storage.privateDir, key));
  },
  /** Archivos públicos (fotos de productos) servidos bajo /media. */
  async savePublic(prefix: string, img: ValidatedImage): Promise<string> {
    const key = `${prefix}/${crypto.randomUUID()}.${img.ext}`;
    await write(config.storage.publicDir, key, img.buffer);
    return key;
  },
  async savePublicRaw(key: string, data: Buffer) {
    const full = resolveInside(config.storage.publicDir, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  },
  async removePublic(key: string) {
    await fs.rm(resolveInside(config.storage.publicDir, key), { force: true });
  },
  publicUrl(key: string) {
    return `/media/${key}`;
  },
};
