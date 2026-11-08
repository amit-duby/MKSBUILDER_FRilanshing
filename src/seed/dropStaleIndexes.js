const mongoose = require('mongoose');
const logger = require('../common/utils/logger');
const { COLLECTIONS } = require('../config/constants');

const STALE_INDEXES = {
  [COLLECTIONS.departments]: ['isDeleted_1'],
  [COLLECTIONS.projects]: ['isDeleted_1'],
  [COLLECTIONS.sites]: ['isDeleted_1'],
  [COLLECTIONS.employees]: ['isDeleted_1', 'site_1'],
  [COLLECTIONS.vehicles]: ['isDeleted_1'],
  [COLLECTIONS.vehicleAssignments]: ['project_1', 'project_1_releasedAt_1'],
  [COLLECTIONS.inventoryItems]: ['isDeleted_1'],
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
