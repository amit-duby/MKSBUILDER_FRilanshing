const buildController = require('../../common/utils/buildController');
const service = require('./localAmount.service');

module.exports = buildController(service, {
  created: 'Local amount created',
  listed: 'Local amounts fetched',
  fetched: 'Local amount fetched',
  updated: 'Local amount updated',
  removed: 'Local amount deleted',
});
