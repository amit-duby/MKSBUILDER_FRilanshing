const mongoose = require('mongoose');
const logger = require('../common/utils/logger');
const { COLLECTIONS } = require('../config/constants');

const STALE_INDEXES = {
  [COLLECTIONS.inventoryItems]: ['sku_1', 'category_1', 'isDeleted_1'],
  [COLLECTIONS.employees]: ['site_1'],
  [COLLECTIONS.employeeAssignments]: ['assign_1', 'reassign_1'],
};

async function dropStaleIndexes() {
  for (const [collectionName, names] of Object.entries(STALE_INDEXES)) {
    const collection = mongoose.connection.collection(collectionName);
    for (const name of names) {
      try {
        await collection.dropIndex(name);
        logger.info({ collection: collectionName, index: name }, 'Dropped leftover index');
      } catch (error) {
        if (error.code !== 27 && error.codeName !== 'IndexNotFound') throw error;
      }
    }
  }
}

module.exports = { dropStaleIndexes };
