const buildController = require('../../common/utils/buildController');
const service = require('./contactus.service');

module.exports = buildController(service, {
  created: 'Contact request created',
  listed: 'Contact requests fetched',
  removed: 'Contact request deleted',
});
