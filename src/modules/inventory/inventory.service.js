const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const requireDoc = require('../../common/utils/requireDoc');
const { nextCode } = require('../../common/utils/sequence');
const { roundMoney } = require('../../common/utils/money');
const {
  assignDefined,
  containsRegex,
  escapeRegex,
  parseSort,
  startOfUtcDay,
  endOfUtcDay,
} = require('../../common/utils/helpers');
const { planStockMovement, planQuantity } = require('./stockPlan');
const Item = require('./item.model');
const Movement = require('./movement.model');
const Project = require('../projects/project.model');
const Site = require('../sites/site.model');
const Employee = require('../employees/employee.model');

const itemRepo = new BaseRepository(Item);
const ITEM_SORT = ['name', 'code', 'createdAt'];
const MOVEMENT_SORT = ['movementDate', 'code', 'createdAt', 'type'];
const MOVEMENT_POPULATE = [
  { path: 'item', select: 'name code' },
  { path: 'project', select: 'name code' },
  { path: 'site', select: 'name code' },
  { path: 'employee', select: 'fullName code designation' },
];

async function getItem(id) {
  const doc = await itemRepo.findById(id);
  if (!doc) throw new AppError('Item not found', 404, 'NOT_FOUND');
  return doc;
}

function publicItem(item) {
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    code: item.code,
  };
}

function publicNamed(doc) {
  if (!doc) return null;
  return {
    id: doc.id,
    name: doc.name,
    code: doc.code,
  };
}

function presentEmployee(employee) {
  if (!employee) return null;
  return {
    id: employee.id,
    fullName: employee.fullName,
    code: employee.code,
    designation: employee.designation,
  };
}

function withVehicleTypeId(doc) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  json.vehicleTypeId = json.vehicleType ? String(json.vehicleType.id || json.vehicleType) : null;
  delete json.vehicleType;
  return json;
}

function presentMovement(doc, refs = {}) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  json.item = publicItem(refs.item);
  json.project = publicNamed(refs.project);
  json.site = publicNamed(refs.site);
  json.employee = presentEmployee(refs.employee);
  json.vehicleTypeId = json.vehicleType ? String(json.vehicleType) : null;
  delete json.vehicleType;
  return json;
}

async function relatedItemIds(itemOrId) {
  const item = itemOrId && itemOrId.name
    ? itemOrId
    : await Item.findById(itemOrId);
  if (!item) {
    const fallback = itemOrId && itemOrId._id ? itemOrId._id : itemOrId;
    return fallback ? [fallback] : [];
  }
  const ids = await Item.find({
    name: new RegExp(`^${escapeRegex(String(item.name).trim())}$`, 'i'),
  }).distinct('_id');
  return ids.length ? ids : [item._id];
}

function emptyStock() {
  return { received: 0, issued: 0, onHand: 0 };
}

function applyMovementToStock(current, type, direction, quantity) {
  const qty = Number(quantity) || 0;
  if (type === 'receipt' || type === 'return') {
    current.received += qty;
    current.onHand += qty;
    return;
  }
  if (type === 'issue') {
    current.issued += qty;
    current.onHand -= qty;
    return;
  }
  if (type === 'adjustment' && direction === 'increase') {
    current.onHand += qty;
    return;
  }
  if (type === 'adjustment' && direction === 'decrease') {
    current.onHand -= qty;
  }
}

async function stockByItems(ids) {
  const byItem = new Map();
  if (!ids.length) return byItem;
  const rows = await Movement.aggregate([
    { $match: { item: { $in: ids } } },
    {
      $group: {
        _id: { item: '$item', type: '$type', direction: '$direction' },
        quantity: { $sum: '$quantity' },
      },
    },
  ]);
  for (const row of rows) {
    const id = String(row._id.item);
    const current = byItem.get(id) || emptyStock();
    applyMovementToStock(current, row._id.type, row._id.direction, row.quantity);
    byItem.set(id, current);
  }
  return byItem;
}

async function onHand(itemOrId) {
  const ids = await relatedItemIds(itemOrId);
  if (!ids.length) return 0;
  const byItem = await stockByItems(ids);
  let total = 0;
  for (const id of ids) {
    const row = byItem.get(String(id));
    if (row) total += row.onHand;
  }
  return total;
}

async function attachStockFlow(docs) {
  if (!docs.length) return [];
  const nameFilters = [...new Map(
    docs
      .map((doc) => String(doc.name || '').trim())
      .filter(Boolean)
      .map((name) => [name.toLowerCase(), { name: new RegExp(`^${escapeRegex(name)}$`, 'i') }])
  ).values()];
  if (!nameFilters.length) {
    return docs.map((doc) => {
      const json = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
      json.onHand = 0;
      json.received = 0;
      json.issued = 0;
      return json;
    });
  }
  const related = await Item.find({ $or: nameFilters }).select('_id name');
  const byItem = related.length ? await stockByItems(related.map((row) => row._id)) : new Map();
  const byName = new Map();
  for (const row of related) {
    const key = String(row.name || '').trim().toLowerCase();
    const stock = byItem.get(String(row._id)) || emptyStock();
    const current = byName.get(key) || emptyStock();
    current.received += stock.received;
    current.issued += stock.issued;
    current.onHand += stock.onHand;
    byName.set(key, current);
  }
  return docs.map((doc) => {
    const json = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
    const stock = byName.get(String(json.name || '').trim().toLowerCase()) || emptyStock();
    json.onHand = stock.onHand;
    json.received = stock.received;
    json.issued = stock.issued;
    return json;
  });
}

async function attachOnHand(docs) {
  return attachStockFlow(docs);
}

const items = {
  async create(body) {
    const code = await nextCode('inventory_item', 'ITM');
    return itemRepo.create({
      code,
      name: body.name,
      units: body.units,
      description: body.description || '',
      isActive: body.isActive !== false,
    });
  },

  async list(query) {
    const filter = {};
    if (query.isActive !== undefined) filter.isActive = query.isActive;
    if (query.search) {
      const pattern = containsRegex(query.search);
      filter.$or = [{ name: pattern }, { code: pattern }];
    }

    const result = await itemRepo.paginate({
      filter,
      page: query.page,
      limit: query.limit,
      sort: parseSort(query.sort, ITEM_SORT),
    });
    result.items = await attachOnHand(result.items);
    return result;
  },

  async getById(id) {
    const [doc, onHandQty] = await Promise.all([getItem(id), onHand(id)]);
    const json = doc.toJSON();
    json.onHand = onHandQty;
    return json;
  },

  async update(id, body) {
    const doc = await getItem(id);
    assignDefined(doc, body, ['name', 'units', 'description', 'isActive']);
    await doc.save();
    const json = doc.toJSON();
    json.onHand = await onHand(doc._id);
    return json;
  },

  async remove(id) {
    const doc = await Item.findById(id);
    if (!doc) throw new AppError('Item not found', 404, 'NOT_FOUND');
    if (await onHand(doc._id) > 0) {
      throw new AppError('Issue remaining stock before deleting this item', 409, 'CONFLICT');
    }
    await doc.deleteOne();
  },
};

function presentStockItem(item, quantity, extra = {}) {
  const onHand = Number(quantity) || 0;
  const received = Number(extra.received) || 0;
  const issued = Number(extra.issued) || 0;
  const rest = { ...extra };
  delete rest.received;
  delete rest.issued;
  return {
    id: item.id || String(item._id),
    received,
    issued,
    quantity: onHand,
    onHand,
    item: {
      id: item.id || String(item._id),
      name: item.name,
      code: item.code,
      units: item.units,
    },
    ...rest,
  };
}

function packStock(rows, query) {
  let items = rows;
  if (query.search) {
    const pattern = containsRegex(query.search);
    items = items.filter((row) => (
      pattern.test(row.item.name || '')
      || pattern.test(row.item.code || '')
    ));
  }
  const threshold = query.below === undefined ? 0 : Number(query.below);
  const lowItems = items.filter((row) => (Number(row.quantity) || 0) <= threshold);
  if (query.below !== undefined) items = lowItems;

  const total = items.length;
  const unique = new Map();
  for (const row of items) {
    const key = String(row.item && row.item.name ? row.item.name : row.id).trim().toLowerCase();
    if (!unique.has(key)) unique.set(key, row);
  }
  const uniqueRows = [...unique.values()];
  return {
    items,
    counts: {
      items: total,
      low: lowItems.length,
      received: uniqueRows.reduce((sum, row) => sum + (Number(row.received) || 0), 0),
      issued: uniqueRows.reduce((sum, row) => sum + (Number(row.issued) || 0), 0),
    },
    meta: {
      page: 1,
      limit: total || 1,
      total,
      totalPages: 1,
    },
  };
}

const stock = {
  async list(query) {
    const itemFilter = { isActive: true };
    if (query.itemId) {
      const item = await getItem(query.itemId);
      itemFilter._id = { $in: await relatedItemIds(item) };
      delete itemFilter.isActive;
    }

    const docs = await Item.find(itemFilter).sort({ name: 1, code: 1 });
    const withQty = await attachStockFlow(docs);
    const rows = withQty.map((item) => presentStockItem(item, item.onHand, {
      received: item.received,
      issued: item.issued,
    }));
    return packStock(rows, query);
  },
};

function idOf(value) {
  if (value == null || value === '') return undefined;
  if (typeof value === 'string') return value;
  if (typeof value.id === 'string') return value.id;
  if (value._id) return String(value._id);
  return String(value);
}

function pickId(next, current) {
  if (next === undefined) return idOf(current);
  if (next === null || next === '') return undefined;
  return String(next);
}

function mergeMovementInput(doc, body) {
  return {
    type: doc.type,
    itemId: pickId(body.itemId, doc.item),
    quantity: body.quantity !== undefined ? body.quantity : doc.quantity,
    direction: body.direction !== undefined ? body.direction : doc.direction,
    projectId: pickId(body.projectId, doc.project),
    siteId: pickId(body.siteId, doc.site),
    employeeId: pickId(body.employeeId, doc.employee),
    vehicleTypeId: pickId(body.vehicleTypeId, doc.vehicleType),
    unitCost: body.unitCost !== undefined ? body.unitCost : doc.unitCost,
    vendorName: body.vendorName !== undefined ? body.vendorName : doc.vendorName,
    condition: body.condition !== undefined ? body.condition : doc.condition,
    billNo: body.billNo !== undefined ? body.billNo : doc.billNo,
    challanNo: body.challanNo !== undefined ? body.challanNo : doc.challanNo,
    materialReceiptPhoto: body.materialReceiptPhoto !== undefined
      ? body.materialReceiptPhoto
      : doc.materialReceiptPhoto,
    paymentMode: body.paymentMode !== undefined ? body.paymentMode : doc.paymentMode,
    address: body.address !== undefined ? body.address : doc.address,
    movementDate: body.movementDate !== undefined ? body.movementDate : doc.movementDate,
    reference: body.reference !== undefined ? body.reference : doc.reference,
    remarks: body.remarks !== undefined ? body.remarks : doc.remarks,
    status: body.status !== undefined ? body.status : doc.status || 'active',
  };
}

function assertReceiptShape(body) {
  if (body.type !== 'receipt') return;
  if (!(body.vendorName && String(body.vendorName).trim())) {
    throw new AppError('Vendor name is required for an inward receipt', 400, 'BAD_REQUEST');
  }
  if (!body.condition) {
    throw new AppError('Material condition is required for an inward receipt', 400, 'BAD_REQUEST');
  }
  if (!(body.billNo || body.challanNo)) {
    throw new AppError('Bill number or challan number is required for an inward receipt', 400, 'BAD_REQUEST');
  }
  if (!body.paymentMode) {
    throw new AppError('Mode of payment is required for an inward receipt', 400, 'BAD_REQUEST');
  }
}

function sameStockPool(left, right) {
  return String(left.name || '').trim().toLowerCase() === String(right.name || '').trim().toLowerCase();
}

async function resolveMovementWrite(body) {
  const plan = planStockMovement(body);
  const [item, site, project, employee] = await Promise.all([
    getItem(body.itemId),
    body.siteId ? requireDoc(Site, body.siteId, 'Site') : null,
    body.projectId ? requireDoc(Project, body.projectId, 'Project') : null,
    body.employeeId ? requireDoc(Employee, body.employeeId, 'Employee') : null,
  ]);

  if (!item.isActive) throw new AppError('Item is inactive', 400, 'BAD_REQUEST');
  if (site && project && String(site.project) !== String(project._id)) {
    throw new AppError('Site does not belong to the selected project', 400, 'BAD_REQUEST');
  }

  return {
    movement: body,
    plan,
    item,
    site,
    project,
    employee,
  };
}

function movementRecord(body, movement, plan, refs) {
  const payload = {
    type: body.type,
    item: refs.item._id,
    quantity: plan.quantity,
    direction: body.type === 'adjustment' ? body.direction : undefined,
    project: body.projectId || undefined,
    site: body.siteId || undefined,
    employee: refs.employee ? refs.employee._id : undefined,
    vehicleType: body.vehicleTypeId || undefined,
    unitCost: body.unitCost === undefined ? undefined : roundMoney(body.unitCost),
    totalAmount: body.unitCost === undefined
      ? 0
      : roundMoney(Number(plan.quantity) * Number(body.unitCost)),
    vendorName: body.vendorName || '',
    condition: body.condition,
    billNo: body.billNo || '',
    challanNo: body.challanNo || '',
    materialReceiptPhoto: body.materialReceiptPhoto || null,
    paymentMode: body.paymentMode,
    address: body.address || '',
    movementDate: body.movementDate || new Date(),
    reference: body.reference || '',
    remarks: body.remarks || '',
    status: body.status || 'active',
  };

  return payload;
}

function stockFingerprint(payload) {
  return [
    String(payload.item),
    String(payload.quantity),
    String(payload.type || ''),
    String(payload.direction || ''),
  ].join('|');
}

async function assertReplaceFits(oldItem, oldPlan, newItem, newPlan) {
  const oldIncrease = planQuantity(oldPlan.increase);
  const oldDecrease = planQuantity(oldPlan.decrease);
  const newDecrease = planQuantity(newPlan.decrease);

  if (sameStockPool(oldItem, newItem)) {
    const available = await onHand(newItem);
    const afterReverse = available - oldIncrease + oldDecrease;
    if (afterReverse < newDecrease) {
      throw new AppError(
        `Insufficient stock for ${newItem.name} (${newItem.code}). Remaining ${Math.max(afterReverse, 0)}, requested ${newDecrease}`,
        409,
        'STOCK_INSUFFICIENT'
      );
    }
    return;
  }

  const oldAvailable = await onHand(oldItem);
  if (oldAvailable - oldIncrease + oldDecrease < 0) {
    throw new AppError(
      `Insufficient stock for ${oldItem.name} (${oldItem.code}). Remaining ${oldAvailable}, requested ${oldIncrease}`,
      409,
      'STOCK_INSUFFICIENT'
    );
  }
  const newAvailable = await onHand(newItem);
  if (newAvailable < newDecrease) {
    throw new AppError(
      `Insufficient stock for ${newItem.name} (${newItem.code}). Remaining ${newAvailable}, requested ${newDecrease}`,
      409,
      'STOCK_INSUFFICIENT'
    );
  }
}

function presentSavedMovement(saved, ctx) {
  return presentMovement(saved, {
    item: ctx.item,
    project: ctx.project,
    site: ctx.site,
    employee: ctx.employee,
  });
}

const movements = {
  async create(body, user) {
    const [ctx, code] = await Promise.all([
      resolveMovementWrite(body),
      nextCode('stock_movement', 'MOV'),
    ]);
    const { movement, plan, item } = ctx;

    if (plan.decrease.length) {
      const requested = planQuantity(plan.decrease);
      const available = await onHand(item);
      if (available < requested) {
        throw new AppError(
          `Insufficient stock for ${item.name} (${item.code}). Remaining ${available}, requested ${requested}`,
          409,
          'STOCK_INSUFFICIENT'
        );
      }
    }

    const payload = {
      ...movementRecord(body, movement, plan, ctx),
      code,
      createdBy: user && user.id,
    };

    const saved = await Movement.create(payload);
    return presentSavedMovement(saved, ctx);
  },

  async update(id, body, _user, options = {}) {
    if (!body || !Object.keys(body).length) {
      throw new AppError('Send at least one field to update', 400, 'BAD_REQUEST');
    }

    const doc = await Movement.findById(id);
    if (!doc) throw new AppError('Stock movement not found', 404, 'NOT_FOUND');
    if (options.expectType && doc.type !== options.expectType) {
      throw new AppError(`This record is a ${doc.type}, not an ${options.expectType}`, 400, 'BAD_REQUEST');
    }

    const merged = mergeMovementInput(doc, body);
    assertReceiptShape(merged);
    const ctx = await resolveMovementWrite(merged);
    const payload = movementRecord(merged, ctx.movement, ctx.plan, ctx);

    const oldPlan = planStockMovement({
      type: doc.type,
      quantity: doc.quantity,
      direction: doc.direction,
    });
    const oldItem = await getItem(doc.item);

    const stockTouched = stockFingerprint({
      item: doc.item,
      quantity: doc.quantity,
      type: doc.type,
      direction: doc.direction,
    }) !== stockFingerprint(payload);

    if (stockTouched) {
      await assertReplaceFits(oldItem, oldPlan, ctx.item, ctx.plan);
    }

    Object.assign(doc, payload);
    const saved = await doc.save();
    return presentSavedMovement(saved, ctx);
  },

  async updateIssue(id, body, user) {
    return movements.update(id, body, user, { expectType: 'issue' });
  },

  async list(query, options = {}) {
    const filter = {};
    if (options.types) filter.type = { $in: options.types };
    else if (query.type) filter.type = query.type;
    if (query.itemId) filter.item = query.itemId;
    if (query.projectId) filter.project = query.projectId;
    if (query.siteId) filter.site = query.siteId;
    if (query.employeeId) filter.employee = query.employeeId;
    if (query.vehicleTypeId) filter.vehicleType = query.vehicleTypeId;
    if (query.status) filter.status = query.status;
    if (query.search) {
      const pattern = containsRegex(query.search);
      filter.$and = [{ $or: [{ code: pattern }, { reference: pattern }, { remarks: pattern }, { vendorName: pattern }, { billNo: pattern }, { challanNo: pattern }, { address: pattern }] }];
    }
    if (query.from || query.to) {
      const from = query.from ? startOfUtcDay(new Date(query.from)) : new Date(0);
      const to = query.to ? endOfUtcDay(new Date(query.to)) : new Date();
      if (from > to) throw new AppError('from must be earlier than or equal to to', 400, 'BAD_REQUEST');
      filter.movementDate = { $gte: from, $lte: to };
    }

    const result = await new BaseRepository(Movement).paginate({
      filter,
      page: query.page,
      limit: query.limit,
      sort: parseSort(query.sort, MOVEMENT_SORT, { movementDate: -1 }),
      populate: MOVEMENT_POPULATE,
    });
    result.items = result.items.map((doc) => withVehicleTypeId(doc));
    return result;
  },

  async listMovements(query) {
    return movements.list(query, { types: ['receipt', 'return', 'transfer', 'adjustment'] });
  },

  async listIssues(query) {
    return movements.list(query, { types: ['issue'] });
  },

  async getById(id, options = {}) {
    const doc = await Movement.findById(id).populate(MOVEMENT_POPULATE);
    if (!doc) throw new AppError('Stock movement not found', 404, 'NOT_FOUND');
    if (options.expectType && doc.type !== options.expectType) {
      throw new AppError('Stock issue not found', 404, 'NOT_FOUND');
    }
    return withVehicleTypeId(doc);
  },

  async getIssue(id) {
    return movements.getById(id, { expectType: 'issue' });
  },

  async remove(id, options = {}) {
    const doc = await Movement.findById(id);
    if (!doc) throw new AppError('Stock movement not found', 404, 'NOT_FOUND');
    if (options.expectType && doc.type !== options.expectType) {
      throw new AppError(`This record is a ${doc.type}, not an ${options.expectType}`, 400, 'BAD_REQUEST');
    }

    const oldPlan = planStockMovement({
      type: doc.type,
      quantity: doc.quantity,
      direction: doc.direction,
    });
    const oldItem = await Item.findById(doc.item);
    if (!oldItem) throw new AppError('Item not found', 404, 'NOT_FOUND');
    await assertReplaceFits(oldItem, oldPlan, oldItem, { increase: [], decrease: [] });
    await doc.deleteOne();
  },

  async removeIssue(id) {
    return movements.remove(id, { expectType: 'issue' });
  },
};

module.exports = { items, stock, movements };
