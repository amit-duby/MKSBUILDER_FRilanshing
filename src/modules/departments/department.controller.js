const buildController = require('../../common/utils/buildController');
const service = require('./department.service');

module.exports = buildController(service, {
  created: 'Department created',
  listed: 'Departments fetched',
  fetched: 'Department fetched',
  updated: 'Department updated',
  removed: 'Department archived',
  restored: 'Department restored',
});
