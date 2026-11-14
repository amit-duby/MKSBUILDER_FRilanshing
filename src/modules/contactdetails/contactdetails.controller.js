const buildController = require('../../common/utils/buildController');
const service = require('./contactdetails.service');

module.exports = buildController(service, {
  created: 'Contact details created',
  listed: 'Contact details fetched',
  updated: 'Contact details updated',
  removed: 'Contact details deleted',
});
