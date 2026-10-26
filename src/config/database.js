const mongoose = require('mongoose');
const logger = require('../common/utils/logger');

mongoose.set('strictQuery', true);

async function connectDatabase(uri) {
  await mongoose.connect(uri, {
    autoIndex: true,
    serverSelectionTimeoutMS: 5000,
    directConnection: true,
    family: 4,
    minPoolSize: 2,
    maxPoolSize: 10,
    maxIdleTimeMS: 0,
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
