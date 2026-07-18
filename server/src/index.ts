import { createApp } from './app';
import { env } from './config/env';
import { disconnectPrisma, prisma } from './config/prisma';

async function main() {
  // Verify DB connectivity at boot so failures are obvious, not deferred.
  await prisma.$connect();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Pharmacy API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`\n${signal} received, shutting down...`);
    server.close();
    await disconnectPrisma();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  await disconnectPrisma();
  process.exit(1);
});
