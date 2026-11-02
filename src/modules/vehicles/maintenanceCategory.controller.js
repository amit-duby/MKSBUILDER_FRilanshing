const buildController = require('../../common/utils/buildController');
const service = require('./maintenanceCategory.service');

module.exports = buildController(service, {
  created: 'Maintenance category created',
  listed: 'Maintenance categories fetched',
  fetched: 'Maintenance category fetched',
  updated: 'Maintenance category updated',
  removed: 'Maintenance category deleted',
});
