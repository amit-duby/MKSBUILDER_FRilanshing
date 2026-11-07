const buildController = require('../../common/utils/buildController');
const service = require('./impressAmount.service');

module.exports = buildController(service, {
  created: 'Impress amount created',
  listed: 'Impress amounts fetched',
  fetched: 'Impress amount fetched',
  updated: 'Impress amount updated',
  removed: 'Impress amount deleted',
});
