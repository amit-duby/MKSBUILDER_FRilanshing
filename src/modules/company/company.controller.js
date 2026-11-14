const buildController = require('../../common/utils/buildController');
const service = require('./company.service');

module.exports = buildController(service, {
  created: 'Company created',
  listed: 'Companies fetched',
  fetched: 'Company fetched',
  updated: 'Company updated',
  removed: 'Company deleted',
});
