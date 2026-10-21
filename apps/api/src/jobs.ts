import type { FastifyBaseLogger } from 'fastify';
import { expireReservations, processOverduePickups } from './services/orders';
import { adminUserIds, notify } from './services/notifications';
import { autoRateStatus, fetchBcvRate, getCurrentRate, recordAutoRateResult } from './services/rates';
import { getSettings } from './services/settings';

/** Cada cuánto se consulta la fuente oficial; repetir la misma tasa no crea registros duplicados. */
export const RATE_FETCH_INTERVAL_MS = 60 * 60_000;
const RATE_ALERT_INTERVAL_MS = 12 * 60 * 60_000;
let lastRateAttempt = 0;
let lastRateAlert = 0;

/** Consulta automática de la tasa; avisa a la administración si falla y la tasa vigente falta o venció. */
export async function autoUpdateRate(now = Date.now()) {
  const s = await getSettings();
  if (!s.rate.autoFetch || now - lastRateAttempt < RATE_FETCH_INTERVAL_MS) return null;
  lastRateAttempt = now;
  const result = await fetchBcvRate();
  recordAutoRateResult(result, new Date(now));
  if (!result.ok) {
    const current = await getCurrentRate();
    if ((!current || current.stale) && now - lastRateAlert > RATE_ALERT_INTERVAL_MS) {
      lastRateAlert = now;
      await notify(await adminUserIds(), {
        type: 'rate.auto_failed',
        title: 'No se pudo actualizar la tasa BCV',
        body: `${result.error}. ${current ? 'La tasa registrada está desactualizada' : 'No hay tasa registrada'}: regístrela manualmente para que los clientes puedan confirmar compras.`,
        link: '/admin/tasa',
      });
    }
  }
  return result;
}

/** Solo para pruebas: reinicia los temporizadores de la consulta automática. */
export function resetRateTimers() {
  lastRateAttempt = 0;
  lastRateAlert = 0;
  autoRateStatus.last = null;
}

export async function runJobsOnce(log?: FastifyBaseLogger) {
  const expired = await expireReservations();
  if (expired.expired > 0) log?.info(expired, 'Reservas vencidas liberadas');
  const overdue = await processOverduePickups();
  if (overdue.overdue > 0) log?.info(overdue, 'Retiros vencidos notificados');
  const r = await autoUpdateRate();
  if (r) log?.info(r, 'Consulta automática de tasa');
}

export function startJobs(intervalSeconds: number, log: FastifyBaseLogger) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runJobsOnce(log);
    } catch (err) {
      log.error({ err }, 'Error en tareas programadas');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalSeconds * 1000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
