import { z } from 'zod';
import { toWhatsappNumber } from './whatsapp';

/** Normaliza la cédula venezolana: "12.345.678" → "V-12345678"; "e 8123456" → "E-8123456". */
export function normalizeDocumentId(value: string): string | null {
  const t = value.toUpperCase().replace(/[\s.]/g, '');
  const m = t.match(/^([VE])?-?(\d{6,9})$/);
  if (!m) return null;
  return `${m[1] ?? 'V'}-${String(Number(m[2]))}`;
}

/** Oculta la cédula para vistas no autorizadas: "V-12345678" → "V-****5678". */
export function maskDocumentId(doc: string | null | undefined): string {
  if (!doc) return '';
  const m = doc.match(/^([VE])-(\d+)$/);
  if (!m) return '****';
  return `${m[1]}-${'*'.repeat(Math.max(0, m[2]!.length - 4))}${m[2]!.slice(-4)}`;
}

/** Teléfono a formato internacional: "0412-555 2594" → "+584125552594". */
export function normalizePhone(value: string): string | null {
  const n = toWhatsappNumber(value);
  return n ? `+${n}` : null;
}

const text = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max);

/** Los cuatro datos obligatorios del cliente para comprar. */
export const customerProfileSchema = z.object({
  fullName: text(5, 120, 'Escriba su nombre y apellido')
    .refine((v) => /^[\p{L}][\p{L}' .-]+$/u.test(v), 'El nombre solo puede contener letras')
    .refine((v) => v.split(/\s+/).filter(Boolean).length >= 2, 'Escriba nombre y apellido'),
  city: text(2, 80, 'Indique su ciudad'),
  addressRef: text(3, 200, 'Indique una zona o dirección de referencia'),
  phone: z
    .string()
    .trim()
    .min(7, 'Indique su teléfono')
    .max(25)
    .refine((v) => /^\+?[\d\s()-]+$/.test(v) && normalizePhone(v) !== null, 'Teléfono inválido. Ej.: 0412 1234567 o +58 412 1234567'),
  documentId: z
    .string()
    .trim()
    .min(6, 'Indique su cédula')
    .max(14)
    .refine((v) => normalizeDocumentId(v) !== null, 'Cédula inválida. Ej.: V-12345678'),
});
export type CustomerProfileInput = z.infer<typeof customerProfileSchema>;
