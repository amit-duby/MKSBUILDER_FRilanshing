const buildController = require('../../common/utils/buildController');
const service = require('./projectDetail.service');

module.exports = buildController(service, {
  created: 'Project detail created',
  listed: 'Project details fetched',
  fetched: 'Project detail fetched',
  updated: 'Project detail updated',
  removed: 'Project detail deleted',
});
