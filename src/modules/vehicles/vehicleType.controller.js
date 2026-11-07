const buildController = require('../../common/utils/buildController');
const service = require('./vehicleType.service');

module.exports = buildController(service, {
  created: 'Vehicle type created',
  listed: 'Vehicle types fetched',
  fetched: 'Vehicle type fetched',
  updated: 'Vehicle type updated',
  removed: 'Vehicle type deleted',
});
