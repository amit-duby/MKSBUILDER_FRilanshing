const buildController = require('../../common/utils/buildController');
const service = require('./gallary.service');

module.exports = buildController(service, {
  created: 'Gallary item created',
  listed: 'Gallary items fetched',
  fetched: 'Gallary item fetched',
  updated: 'Gallary item updated',
  removed: 'Gallary item deleted',
});
