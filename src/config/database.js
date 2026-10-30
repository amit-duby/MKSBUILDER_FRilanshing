const mongoose = require('mongoose');
const logger = require('../common/utils/logger');

mongoose.set('strictQuery', true);

function isSrvUri(uri) {
  return /^mongodb\+srv:\/\//i.test(String(uri || ''));
}

function mongoOptions(uri) {
  return {
    autoIndex: true,
    serverSelectionTimeoutMS: isSrvUri(uri) ? 20000 : 5000,
    minPoolSize: 2,
    maxPoolSize: 10,
    maxIdleTimeMS: 0,
  };
}

async function connectDatabase(uri) {
  await mongoose.connect(uri, mongoOptions(uri));

  logger.info(
    { host: mongoose.connection.host, database: mongoose.connection.name },
    'MongoDB connected'
  );
}

async function disconnectDatabase() {
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase, mongoOptions };
