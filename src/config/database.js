const mongoose = require('mongoose');
const logger = require('../common/utils/logger');

mongoose.set('strictQuery', true);

async function connectDatabase(uri) {
  const isSrv = /^mongodb\+srv:/i.test(uri);
  await mongoose.connect(uri, {
    autoIndex: true,
    serverSelectionTimeoutMS: isSrv ? 15000 : 5000,
    // Keep a warmer pool for Atlas — cold connections add hundreds of ms per request.
    minPoolSize: isSrv ? 5 : 2,
    maxPoolSize: isSrv ? 20 : 10,
    maxIdleTimeMS: 0,
    ...(isSrv ? { maxConnecting: 5 } : { directConnection: true, family: 4 }),
  });

  logger.info(
    { host: mongoose.connection.host, database: mongoose.connection.name },
    'MongoDB connected'
  );
}

async function disconnectDatabase() {
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase };
