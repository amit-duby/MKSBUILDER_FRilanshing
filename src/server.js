const { getConfig } = require('./config/env');
const logger = require('./common/utils/logger');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const app = require('./app');
const { ensureMainStore } = require('./seed/ensureMainStore');

const config = getConfig();

async function start() {
  if (config.NODE_ENV === 'production' && config.CORS_ORIGIN === '*') {
    logger.warn('CORS_ORIGIN is *. Set an explicit origin before exposing this API.');
  }

  await connectDatabase(config.MONGODB_URI);
  await ensureMainStore();

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'Construction ERP API listening');
  });

  async function shutdown(signal) {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (error) => {
    logger.error({ err: error }, 'Unhandled rejection');
    shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (error) => {
    logger.error({ err: error }, 'Uncaught exception');
    shutdown('uncaughtException');
  });
}

if (require.main === module) {
  start().catch((error) => {
    logger.error({ err: error }, 'Failed to start');
    process.exit(1);
  });
}

module.exports = { start };
