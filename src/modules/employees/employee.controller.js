const asyncHandler = require('../../common/utils/asyncHandler');
const { ok, created } = require('../../common/utils/apiResponse');
const buildController = require('../../common/utils/buildController');
const service = require('./employee.service');
const bulkService = require('./employeeBulk.service');

const crud = buildController(service, {
  created: 'Employee created',
  listed: 'Employees fetched',
  fetched: 'Employee fetched',
  updated: 'Employee updated',
  removed: 'Employee deleted',
});

const assign = asyncHandler(async (req, res) => {
  const data = await service.assign(req.params.id, req.body);
  return created(res, data, 'Employee assigned to site');
});

const release = asyncHandler(async (req, res) => {
  const data = await service.release(req.params.id, req.params.assignmentId, req.body);
  return ok(res, data, 'Site assignment closed');
});

const listAssignments = asyncHandler(async (req, res) => {
  const data = await service.listAssignments(req.params.id, req.query);
  return ok(res, data, 'Assignments fetched');
});

const downloadBulkTemplate = asyncHandler(async (_req, res) => {
  const buffer = await bulkService.buildTemplateBuffer();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="employee-bulk-template.xlsx"'
  );
  return res.status(200).send(Buffer.from(buffer));
});

const bulkUpload = asyncHandler(async (req, res) => {
  const data = await bulkService.bulkUpload(req.file, req.query);
  const message = data.dryRun
    ? 'Employee bulk upload validated'
    : 'Employee bulk upload completed';
  return ok(res, data, message);
});

module.exports = {
  ...crud,
  assign,
  release,
  listAssignments,
  downloadBulkTemplate,
  bulkUpload,
};
