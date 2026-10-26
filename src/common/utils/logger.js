const pino = require('pino');

function buildLogger() {
  const level = process.env.LOG_LEVEL || 'info';
  const options = {
    level,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'passwordHash'],
      remove: true,
    },
  };

  if (process.env.NODE_ENV === 'development') {
    try {
      require.resolve('pino-pretty');
      options.transport = {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      };
    } catch {
      // Keep JSON logs when the pretty printer is not installed.
    }
  }

  return pino(options);
}

module.exports = buildLogger();
