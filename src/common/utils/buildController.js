const asyncHandler = require('./asyncHandler');
const { ok, created } = require('./apiResponse');

function buildController(service, messages) {
  const controller = {
    create: asyncHandler(async (req, res) => {
      const data = await service.create(req.body, req.user);
      return created(res, data, messages.created);
    }),
    list: asyncHandler(async (req, res) => {
      const result = await service.list(req.query);
      return ok(res, result.items, messages.listed, result.meta);
    }),
    getById: asyncHandler(async (req, res) => {
      const data = await service.getById(req.params.id);
      return ok(res, data, messages.fetched);
    }),
    update: asyncHandler(async (req, res) => {
      const data = await service.update(req.params.id, req.body, req.user);
      return ok(res, data, messages.updated);
    }),
    remove: asyncHandler(async (req, res) => {
      await service.remove(req.params.id);
      return ok(res, null, messages.removed);
    }),
  };

  if (typeof service.restore === 'function') {
    controller.restore = asyncHandler(async (req, res) => {
      const data = await service.restore(req.params.id);
      return ok(res, data, messages.restored || 'Record restored');
    });
  }

  return controller;
}

module.exports = buildController;
