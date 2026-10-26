const buildController = require('../../common/utils/buildController');
const service = require('./site.service');

module.exports = buildController(service, {
  created: 'Site created',
  listed: 'Sites fetched',
  fetched: 'Site fetched',
  updated: 'Site updated',
  removed: 'Site archived',
  restored: 'Site restored',
});
