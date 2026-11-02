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

function withDefaultDatabase(uri) {
  const text = String(uri || '').trim();
  const match = text.match(/^(mongodb(?:\+srv)?:\/\/[^/?]+)(\/[^?]*)?(\?.*)?$/i);
  if (!match) return text;
  const origin = match[1];
  const pathname = match[2] || '';
  const query = match[3] || '';
  const database = pathname.replace(/^\//, '');
  if (database) return text;
  return `${origin}/mks_construction_erp${query}`;
}

async function connectDatabase(uri) {
  await mongoose.connect(withDefaultDatabase(uri), mongoOptions(uri));

  logger.info(
    { host: mongoose.connection.host, database: mongoose.connection.name },
    'MongoDB connected'
  );
}

async function disconnectDatabase() {
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase, mongoOptions };
