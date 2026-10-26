const logger = require('../common/utils/logger');
const StockLocation = require('../modules/inventory/location.model');

async function ensureMainStore() {
  const existing = await StockLocation.findOne({ code: 'LOC-MAIN' });
  if (existing) {
    if (existing.isDeleted || !existing.isActive) {
      existing.isDeleted = false;
      existing.isActive = true;
      existing.isSystem = true;
      await existing.save();
    }
    return existing;
  }

  const store = await StockLocation.create({
    code: 'LOC-MAIN',
    name: 'Main Store',
    type: 'central_store',
    isSystem: true,
    isActive: true,
  });

  logger.info('Main store created');
  return store;
}

module.exports = { ensureMainStore };
