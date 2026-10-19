import { z } from 'zod';
import { DEFAULT_TIMEZONE } from './dates';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:MM)');

const weekdaySchema = z
  .object({ enabled: z.boolean(), open: time, close: time })
  .refine((d) => !d.enabled || d.open < d.close, 'La hora de apertura debe ser anterior al cierre');

export const settingsSchemas = {
  store: z.object({
    name: z.string().trim().max(120),
    tagline: z.string().trim().max(200),
    address: z.string().trim().max(300),
    city: z.string().trim().max(120),
    phone: z.string().trim().max(40),
    email: z.union([z.literal(''), z.string().trim().email().max(160)]),
    hoursText: z.string().trim().max(300),
    mapUrl: z.union([z.literal(''), z.string().trim().url().max(500)]),
    timezone: z.string().trim().min(1).max(64),
    heroImageUrl: z.string().trim().max(500),
  }),
  whatsapp: z.object({
    /** Número internacional sin '+' ni espacios, p. ej. 58412XXXXXXX. Vacío = desactivado. */
    number: z.union([z.literal(''), z.string().regex(/^\d{8,15}$/, 'Número internacional sin + ni espacios')]),
    greeting: z.string().trim().max(300),
  }),
  pickup: z.object({
    weekdays: z.array(weekdaySchema).length(7),
    capacityPerDay: z.number().int().min(1).max(10_000),
    minAdvanceHours: z.number().int().min(0).max(24 * 60),
    maxDaysAheadPickup: z.number().int().min(1).max(365),
    maxDaysAheadPrepay: z.number().int().min(1).max(730),
  }),
  reservation: z.object({
    /** Horas que se mantiene apartado el inventario de una operación sin el pago requerido. */
    holdHours: z.number().int().min(1).max(24 * 30),
    /** No vencer mientras exista un pago pendiente de verificación. */
    extendWhilePaymentPending: z.boolean(),
    /** Porcentaje mínimo de prepago para confirmar una reserva (modalidad prepago). */
    prepayMinPercent: z.number().int().min(1).max(100),
    /** Días de tolerancia tras la fecha de retiro antes de considerar la operación como no retirada. */
    pickupGraceDays: z.number().int().min(0).max(365),
    /** Cancelar automáticamente y liberar inventario cuando vence la tolerancia (sin pagos acreditados). */
    autoCancelNoShow: z.boolean(),
  }),
  cancellation: z.object({
    customerCancelMinHours: z.number().int().min(0).max(24 * 60),
    rescheduleMinHours: z.number().int().min(0).max(24 * 60),
    maxReschedules: z.number().int().min(0).max(20),
    policyText: z.string().trim().max(5000),
  }),
  quote: z.object({ validityMinutes: z.number().int().min(1).max(60 * 24 * 7) }),
  rate: z.object({
    autoFetch: z.boolean(),
    sourceUrl: z.string().trim().url().max(500),
    maxAgeHours: z.number().int().min(1).max(24 * 30),
    blockWhenStale: z.boolean(),
  }),
  uploads: z.object({ maxProofMB: z.number().min(0.5).max(20) }),
  policies: z.object({
    termsText: z.string().trim().max(20_000),
    privacyText: z.string().trim().max(20_000),
    returnsText: z.string().trim().max(20_000),
  }),
  faq: z.object({
    items: z
      .array(z.object({ q: z.string().trim().min(3).max(300), a: z.string().trim().min(3).max(3000) }))
      .max(50),
  }),
} as const;

export type SettingsKey = keyof typeof settingsSchemas;
export const SETTINGS_KEYS = Object.keys(settingsSchemas) as SettingsKey[];
export type BusinessSettings = { [K in SettingsKey]: z.infer<(typeof settingsSchemas)[K]> };

const closedDay = { enabled: false, open: '08:00', close: '17:00' };
const openDay = { enabled: true, open: '08:00', close: '17:00' };

/**
 * Valores iniciales. Los datos comerciales (nombre, dirección, teléfono, WhatsApp,
 * textos legales) quedan vacíos a propósito: deben configurarse desde el panel.
 */
export const SETTINGS_DEFAULTS: BusinessSettings = {
  store: {
    name: '',
    tagline: '',
    address: '',
    city: '',
    phone: '',
    email: '',
    hoursText: '',
    mapUrl: '',
    timezone: DEFAULT_TIMEZONE,
    heroImageUrl: '',
  },
  whatsapp: { number: '', greeting: 'Hola, quisiera información sobre sus porcelanatos.' },
  pickup: {
    // Horario de la sede: lunes a viernes de 8:00 a 17:00; sábado y domingo sin atención.
    weekdays: [closedDay, openDay, openDay, openDay, openDay, openDay, closedDay],
    capacityPerDay: 20,
    minAdvanceHours: 24,
    maxDaysAheadPickup: 15,
    maxDaysAheadPrepay: 90,
  },
  reservation: {
    holdHours: 48,
    extendWhilePaymentPending: true,
    prepayMinPercent: 30,
    pickupGraceDays: 3,
    autoCancelNoShow: false,
  },
  cancellation: { customerCancelMinHours: 24, rescheduleMinHours: 24, maxReschedules: 2, policyText: '' },
  quote: { validityMinutes: 30 },
  rate: { autoFetch: false, sourceUrl: 'https://www.bcv.org.ve/', maxAgeHours: 72, blockWhenStale: true },
  uploads: { maxProofMB: 5 },
  policies: { termsText: '', privacyText: '', returnsText: '' },
  faq: { items: [] },
};

/** Claves visibles públicamente (sin datos internos). */
/** Horario de atención de la sede de Barinas (texto visible). */
export const STORE_HOURS_TEXT = 'Lunes a viernes, de 8:00 a. m. a 5:00 p. m.';

export const PUBLIC_SETTINGS_KEYS: SettingsKey[] = [
  'store',
  'whatsapp',
  'pickup',
  'reservation',
  'cancellation',
  'quote',
  'uploads',
  'policies',
  'faq',
];
