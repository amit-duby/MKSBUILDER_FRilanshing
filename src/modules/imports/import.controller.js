const asyncHandler = require('../../common/utils/asyncHandler');
const { ok } = require('../../common/utils/apiResponse');
const service = require('./import.service');

const template = asyncHandler(async (_req, res) => {
  const buffer = await service.templateBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="mks-erp-import-template.xlsx"');
  return res.status(200).send(Buffer.from(buffer));
});

const preview = asyncHandler(async (req, res) => {
  const data = await service.preview(req.file.buffer, req.user);
  return ok(res, data, 'Excel preview ready. No records were saved.');
});

const importAll = asyncHandler(async (req, res) => {
  const data = await service.importAll(req.file.buffer, req.user);
  return ok(res, data, 'Excel import finished');
});

module.exports = { template, preview, importAll };
