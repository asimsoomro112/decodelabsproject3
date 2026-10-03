import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { closePool } from './db.js';

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.nodeEnv, sqlInspector: config.sqlInspectorEnabled },
    'CourseVault API listening',
  );
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    // Drain the pool so in-flight queries finish, then exit cleanly.
    closePool()
      .catch((err: unknown) => {
        logger.error({ err: err instanceof Error ? err.message : String(err) }, 'pool shutdown failed');
      })
      .finally(() => process.exit(0));
  });
  // Never hang forever on a stuck connection.
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
