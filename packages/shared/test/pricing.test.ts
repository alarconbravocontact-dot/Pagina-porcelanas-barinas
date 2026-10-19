import { describe, expect, it } from 'vitest';
import {
  boxesForArea,
  computeLine,
  m2ToUnits,
  normalizeRate,
  parseMoneyToCents,
  percentOfCents,
  priceBoxFromM2,
  priceM2FromBox,
  usdCentsToVesCents,
  vesCentsToUsdCents,
  PricingError,
} from '../src/pricing';
import { addDays, isValidDateString, localDateString, weekdayOf, zonedDateTimeToInstant } from '../src/dates';
import { permissionsFor } from '../src/permissions';
import { whatsappLink } from '../src/whatsapp';

describe('conversión cajas / m²', () => {
  it('30 m² con cajas de 2,16 m² requieren 14 cajas (30,24 m²)', () => {
    const r = computeLine({ mode: 'M2', quantity: '30', boxAreaUnits: m2ToUnits('2,16'), priceBoxCents: 2700 });
    expect(r.boxes).toBe(14);
    expect(r.areaUnits).toBe(302_400);
    expect(r.requestedAreaUnits).toBe(300_000);
    expect(r.lineTotalCents).toBe(14 * 2700);
  });

  it('una superficie exacta no agrega cajas extra', () => {
    expect(boxesForArea(m2ToUnits('4.32'), m2ToUnits('2.16'))).toBe(2);
    expect(boxesForArea(m2ToUnits('4.3201'), m2ToUnits('2.16'))).toBe(3);
  });

  it('modo cajas multiplica directamente', () => {
    const r = computeLine({ mode: 'BOXES', quantity: 3, boxAreaUnits: 14_400, priceBoxCents: 1999 });
    expect(r.boxes).toBe(3);
    expect(r.areaUnits).toBe(43_200);
    expect(r.lineTotalCents).toBe(5997);
  });

  it('rechaza cantidades inválidas', () => {
    expect(() => computeLine({ mode: 'BOXES', quantity: 1.5, boxAreaUnits: 100, priceBoxCents: 1 })).toThrow(PricingError);
    expect(() => computeLine({ mode: 'BOXES', quantity: 0, boxAreaUnits: 100, priceBoxCents: 1 })).toThrow(PricingError);
    expect(() => computeLine({ mode: 'M2', quantity: '-3', boxAreaUnits: 100, priceBoxCents: 1 })).toThrow(PricingError);
    expect(() => computeLine({ mode: 'M2', quantity: 'abc', boxAreaUnits: 100, priceBoxCents: 1 })).toThrow(PricingError);
    expect(() => m2ToUnits('1.00001')).toThrow(PricingError);
  });
});

describe('precisión monetaria', () => {
  it('precio por m² y por caja son coherentes con redondeo half-up', () => {
    const area = m2ToUnits('2.16');
    expect(priceBoxFromM2(1250, area)).toBe(2700);
    expect(priceM2FromBox(2700, area)).toBe(1250);
    expect(priceBoxFromM2(1999, m2ToUnits('1.44'))).toBe(2879); // 28.7856 -> 28.79
  });

  it('evita errores de flotantes (0,1 + 0,2)', () => {
    expect(parseMoneyToCents('0.1') + parseMoneyToCents('0.2')).toBe(30);
    expect(parseMoneyToCents('19,99')).toBe(1999);
    expect(() => parseMoneyToCents('1.999')).toThrow(PricingError);
  });

  it('convierte USD a Bs con la tasa y redondea al céntimo', () => {
    const rate = normalizeRate('36,5432');
    expect(rate).toBe('36.54320000');
    expect(usdCentsToVesCents(37_800, rate)).toBe(1_381_333); // 378 * 36.5432 = 13813.3296
    expect(usdCentsToVesCents(1, '0.00000001')).toBe(0);
  });

  it('abono en USD de un pago en Bs se redondea hacia abajo', () => {
    expect(vesCentsToUsdCents(1_381_332, '36.54320000')).toBe(37_799); // 37 799,97 -> 37 799
    expect(vesCentsToUsdCents(1_381_333, '36.54320000')).toBe(37_800);
  });

  it('valida la tasa', () => {
    expect(() => normalizeRate('0')).toThrow(PricingError);
    expect(() => normalizeRate('1.123456789')).toThrow(PricingError);
  });

  it('calcula porcentaje de prepago redondeando hacia arriba', () => {
    expect(percentOfCents(10_001, 30)).toBe(3001);
    expect(percentOfCents(10_000, 100)).toBe(10_000);
  });
});

describe('fechas en zona horaria comercial', () => {
  it('calcula la fecha local de Caracas', () => {
    expect(localDateString(new Date('2026-03-02T03:30:00Z'), 'America/Caracas')).toBe('2026-03-01');
    expect(localDateString(new Date('2026-03-02T04:30:00Z'), 'America/Caracas')).toBe('2026-03-02');
  });
  it('convierte hora local a instante', () => {
    expect(zonedDateTimeToInstant('2026-03-02', '08:00', 'America/Caracas').toISOString()).toBe('2026-03-02T12:00:00.000Z');
  });
  it('valida fechas y días de semana', () => {
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('2026-02-28')).toBe(true);
    expect(weekdayOf('2026-10-18')).toBe(0);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('permisos', () => {
  it('vendedor sin banderas no revisa pagos', () => {
    expect(permissionsFor('SELLER', { canReviewPayments: false, canViewProofs: false })).not.toContain('payments:review');
    expect(permissionsFor('SELLER', { canReviewPayments: true, canViewProofs: false })).toContain('proofs:view');
    expect(permissionsFor('CUSTOMER')).toEqual([]);
    expect(permissionsFor('ADMIN')).toContain('rates:manage');
  });
});

describe('whatsapp', () => {
  it('no genera enlace sin número configurado', () => {
    expect(whatsappLink('', 'hola')).toBeNull();
    expect(whatsappLink('584120000000', 'hola mundo')).toBe('https://wa.me/584120000000?text=hola%20mundo');
  });
});

describe('formato de WhatsApp venezolano', () => {
  it('convierte el número nacional al formato internacional sin el cero inicial', async () => {
    const { toWhatsappNumber, formatInternationalPhone } = await import('../src/whatsapp');
    expect(toWhatsappNumber('04125552594')).toBe('584125552594');
    expect(toWhatsappNumber('0412-555 2594')).toBe('584125552594');
    expect(toWhatsappNumber('+58 412 5552594')).toBe('584125552594');
    expect(toWhatsappNumber('abc')).toBeNull();
    expect(formatInternationalPhone('584125552594')).toBe('+58 412-5552594');
  });
});

describe('datos del cliente', () => {
  it('normaliza y enmascara la cédula y el teléfono', async () => {
    const { normalizeDocumentId, maskDocumentId, normalizePhone, customerProfileSchema } = await import('../src/customer');
    expect(normalizeDocumentId('12.345.678')).toBe('V-12345678');
    expect(normalizeDocumentId('e-8123456')).toBe('E-8123456');
    expect(normalizeDocumentId('J-123')).toBeNull();
    expect(maskDocumentId('V-12345678')).toBe('V-****5678');
    expect(normalizePhone('0412-555 2594')).toBe('+584125552594');
    const ok = customerProfileSchema.safeParse({ fullName: 'María Pérez', city: 'Barinas', addressRef: 'Av. Principal', phone: '04125550000', documentId: 'V12345678' });
    expect(ok.success).toBe(true);
    const bad = customerProfileSchema.safeParse({ fullName: 'Ana', city: '', addressRef: '', phone: 'abc', documentId: '12' });
    expect(bad.success).toBe(false);
    expect(Object.keys(bad.error!.flatten().fieldErrors).sort()).toEqual(['addressRef', 'city', 'documentId', 'fullName', 'phone']);
  });
});

describe('horario de la sede', () => {
  it('atiende de lunes a viernes de 8:00 a 17:00; sábado y domingo cerrado', async () => {
    const { SETTINGS_DEFAULTS, STORE_HOURS_TEXT } = await import('../src/settings');
    const w = SETTINGS_DEFAULTS.pickup.weekdays;
    expect(w.map((d) => d.enabled)).toEqual([false, true, true, true, true, true, false]);
    expect(w.slice(1, 6).every((d) => d.open === '08:00' && d.close === '17:00')).toBe(true);
    expect(STORE_HOURS_TEXT).toBe('Lunes a viernes, de 8:00 a. m. a 5:00 p. m.');
  });
});
