import type { FastifyBaseLogger } from 'fastify';
import { expireReservations, processOverduePickups } from './services/orders';
import { fetchBcvRate, getCurrentRate } from './services/rates';
import { getSettings } from './services/settings';

let lastRateAttempt = 0;

export async function runJobsOnce(log?: FastifyBaseLogger) {
  const expired = await expireReservations();
  if (expired.expired > 0) log?.info(expired, 'Reservas vencidas liberadas');
  const overdue = await processOverduePickups();
  if (overdue.overdue > 0) log?.info(overdue, 'Retiros vencidos notificados');
  const s = await getSettings();
  if (s.rate.autoFetch && Date.now() - lastRateAttempt > 30 * 60_000) {
    const current = await getCurrentRate();
    if (!current || current.ageHours > 6) {
      lastRateAttempt = Date.now();
      const r = await fetchBcvRate();
      log?.info(r, 'Consulta automática de tasa');
    }
  }
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
