import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SETTINGS_DEFAULTS, storeMapLinks } from '@porcelanas/shared';
import { prisma, scenario } from './helpers';
import { autoUpdateRate, RATE_FETCH_INTERVAL_MS, resetRateTimers } from '../src/jobs';
import { fetchBcvRate } from '../src/services/rates';

const BCV_HTML = `<div id="dolar" class="col-sm-12"><div class="field-content"><div class="row recuadrotsmc">
  <div class="col-sm-6"><span> USD</span></div><div class="col-sm-6 centrado"><strong> 39,87650000 </strong></div></div></div></div>
  <div class="pull-right dinpro center">Fecha Valor: <span class="date-display-single" property="dc:date" content="2026-10-20T00:00:00-04:00">Martes</span></div>`;

let s: Awaited<ReturnType<typeof scenario>>;

describe('Tasa BCV automática', () => {
  beforeAll(async () => {
    s = await scenario({ rate: null as unknown as string });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('viene activada por defecto contra el portal oficial del BCV', () => {
    expect(SETTINGS_DEFAULTS.rate).toMatchObject({ autoFetch: true, sourceUrl: 'https://www.bcv.org.ve/' });
    expect(RATE_FETCH_INTERVAL_MS).toBe(60 * 60_000);
  });

  it('si la fuente falla y no hay tasa, avisa a la administración una sola vez cada 12 horas', async () => {
    resetRateTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('caído', { status: 503 })));
    const t0 = Date.now();
    expect(await autoUpdateRate(t0)).toMatchObject({ ok: false, error: 'La fuente respondió HTTP 503' });
    const alerts = () => prisma.notification.count({ where: { userId: s.adminUser.id, type: 'rate.auto_failed' } });
    expect(await alerts()).toBe(1);
    // Antes de una hora no vuelve a consultar; después sí, pero sin repetir el aviso.
    expect(await autoUpdateRate(t0 + 10 * 60_000)).toBeNull();
    expect(await autoUpdateRate(t0 + RATE_FETCH_INTERVAL_MS + 1)).toMatchObject({ ok: false });
    expect(await alerts()).toBe(1);
    const panel = (await s.admin.get('/api/admin/rates')).json();
    expect(panel.auto).toMatchObject({ enabled: true, intervalMinutes: 60, last: { ok: false, error: 'La fuente respondió HTTP 503' } });
  });

  it('registra la tasa leída del portal y la muestra como consulta automática', async () => {
    resetRateTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(BCV_HTML, { status: 200 })));
    expect(await autoUpdateRate()).toMatchObject({ ok: true, created: true, rate: '39.87650000', effectiveDate: '2026-10-20' });
    const row = await prisma.exchangeRate.findFirstOrThrow({ where: { source: 'BCV_AUTO' } });
    expect(row.sourceUrl).toBe('https://www.bcv.org.ve/');
    const panel = (await s.admin.get('/api/admin/rates')).json();
    expect(panel.auto.last).toMatchObject({ ok: true, rate: '39.87650000' });
  });

  it('explica un certificado no verificable sin desactivar la verificación TLS', async () => {
    const certError = (async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' } });
    }) as unknown as typeof fetch;
    const r = await fetchBcvRate(certError);
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.error).toContain('NODE_EXTRA_CA_CERTS');
  });

  it('arma los enlaces de Google Maps de la sede a partir de la dirección o de las coordenadas', () => {
    const byAddress = storeMapLinks({ address: 'Consagro, Alto Barinas, frente a Traki', city: 'Barinas' })!;
    expect(byAddress.query).toBe('Consagro, Alto Barinas, frente a Traki, Barinas, Venezuela');
    expect(byAddress.directionsUrl).toBe('https://www.google.com/maps/dir/?api=1&destination=Consagro%2C%20Alto%20Barinas%2C%20frente%20a%20Traki%2C%20Barinas%2C%20Venezuela');
    expect(byAddress.embedUrl).toMatch(/^https:\/\/www\.google\.com\/maps\?q=Consagro.+&output=embed$/);
    const byPin = storeMapLinks({ address: 'x', city: 'Barinas', mapUrl: 'https://www.google.com/maps/place/Sede/@8.6226,-70.2075,17z' })!;
    expect(byPin.query).toBe('8.6226,-70.2075');
    expect(storeMapLinks({ address: '', city: '' })).toBeNull();
  });
});
