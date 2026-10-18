import { buildApp } from './app';
import { config } from './config';
import { prisma } from './db';
import { startJobs } from './jobs';
import { attachSocket } from './socket';

async function main() {
  const app = await buildApp();
  attachSocket(app.server);
  await app.listen({ port: config.PORT, host: config.HOST });
  const stopJobs = config.JOBS_ENABLED ? startJobs(config.JOBS_INTERVAL_SECONDS, app.log) : () => undefined;
  const shutdown = async (signal: string) => {
    app.log.info(`Recibida señal ${signal}, cerrando...`);
    stopJobs();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
