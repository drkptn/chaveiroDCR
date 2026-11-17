import { config } from './config';
import { buildApp } from './app';
import { prisma } from './lib/db';
import { kv } from './lib/kv';
import { initBus } from './services/bus';
import { initCacheInvalidation } from './services/perms';
import { initVoice } from './voice/service';
import { closeWorkers } from './voice/mediasoup';
import { closeAllConnections } from './gateway';
import { cleanupOrphanAttachments } from './routes/files';
import { tickEvents } from './routes/misc';

async function main() {
  await prisma.$connect();
  await initBus();
  await initCacheInvalidation();
  await initVoice();

  const app = await buildApp();
  await app.listen({ host: config.HOST, port: config.PORT });
  app.log.info(`🚀 Vinlancord no ar em ${config.PUBLIC_URL} (KV: ${kv.kind})`);

  const jobs = [
    setInterval(() => void cleanupOrphanAttachments().catch((e) => app.log.error(e)), 60 * 60_000),
    setInterval(() => void tickEvents().catch((e) => app.log.error(e)), 30_000),
  ];

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`Recebido ${signal}, encerrando com segurança…`);
    jobs.forEach(clearInterval);
    closeAllConnections();
    await app.close().catch(() => {});
    await closeWorkers();
    await prisma.$disconnect();
    await kv.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error('❌ Falha ao iniciar o servidor:', e);
  process.exit(1);
});
