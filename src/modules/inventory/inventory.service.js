const mongoose = require('mongoose');
const { COLLECTIONS } = require('../../config/constants');
const logger = require('../../common/utils/logger');
const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const requireDoc = require('../../common/utils/requireDoc');
const { nextCode } = require('../../common/utils/sequence');
const { roundMoney } = require('../../common/utils/money');
const { roundQuantity } = require('../../common/utils/quantity');
const {
  assignDefined,
  containsRegex,
  escapeRegex,
  parseSort,
  startOfUtcDay,
  endOfUtcDay,
} = require('../../common/utils/helpers');
const { planStockMovement, reversePlan, planQuantity } = require('./stockPlan');
const { removeStoredReceipt } = require('../../common/middleware/movementUpload');
const Item = require('./item.model');
const Balance = require('./balance.model');
const Movement = require('./movement.model');
const Site = require('../sites/site.model');
const Employee = require('../employees/employee.model');

const itemRepo = new BaseRepository(Item);
const DEFAULT_LOCATION = 'Main Store';
const ITEM_SORT = ['name', 'sku', 'code', 'category', 'createdAt'];
const MOVEMENT_SORT = ['movementDate', 'code', 'createdAt', 'type'];
const MOVEMENT_LIST_SELECT = [
  'type',
  'item',
  'quantity',
  'fromLocation',
  'toLocation',
  'locationType',
  'vendorName',
  'condition',
  'billNo',
  'challanNo',
  'paymentMode',
  'unitCost',
  'totalAmount',
  'movementDate',
  'site',
  'materialReceiptPhoto',
  'address',
  'remarks',
  'note',
].join(' ');

const ISSUE_LIST_SELECT = [
  'type',
  'item',
  'quantity',
  'fromLocation',
  'toLocation',
  'locationType',
  'site',
  'employee',
  'vehicleType',
  'movementDate',
  'remarks',
  'note',
].join(' ');

const MOVEMENT_POPULATE = [
  { path: 'item', select: 'name sku unit code category' },
  { path: 'site', select: 'name code' },
];

const ISSUE_POPULATE = [
  { path: 'item', select: 'name sku unit code category' },
  { path: 'site', select: 'name code' },
  { path: 'employee', select: 'fullName code designation' },
  { path: 'vehicleType', select: 'name description status' },
];

function normalizeLocation(value) {
  if (value == null) return '';
  return String(value).trim().replace(/\s+/g, ' ').slice(0, 120);
}

function sessionOptions(session, extra = {}) {
  return session ? { ...extra, session } : extra;
}

async function getItem(id) {
  const doc = await itemRepo.findById(id);
  if (!doc) throw new AppError('Item not found', 404, 'NOT_FOUND');
  return doc;
}

function asId(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    if (typeof value.toHexString === 'function') return value.toHexString();
    if (value._id && value._id !== value) return asId(value._id);
    if (typeof value.toString === 'function') {
      const text = value.toString();
      if (text && text !== '[object Object]') return text;
    }
    return null;
  }
  return String(value);
}

function presentMoneyFields(json) {
  const unitCost = json.unitCost == null ? null : Number(json.unitCost);
  const quantity = Number(json.quantity) || 0;
  const totalAmount = json.totalAmount != null
    ? Number(json.totalAmount)
    : (unitCost == null ? 0 : roundMoney(quantity * unitCost));
  return { quantity, unitCost, totalAmount };
}

function presentItemDetails(value) {
  const id = asId(value);
  if (!id) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || !value.name) {
    return { id };
  }
  return {
    id,
    name: value.name || '',
    sku: value.sku || '',
    unit: value.unit || null,
    code: value.code || '',
    category: value.category || '',
  };
}

function presentSiteName(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && value.name != null) {
    return value.name || '';
  }
  return null;
}

function presentSiteDetails(value) {
  const id = asId(value);
  if (!id) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.name == null) {
    return { id };
  }
  return {
    id,
    name: value.name || '',
    code: value.code || '',
  };
}

function presentEmployeeDetails(value) {
  const id = asId(value);
  if (!id) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || !(value.fullName || value.name)) {
    return { id };
  }
  return {
    id,
    fullName: value.fullName || value.name || '',
    code: value.code || '',
    designation: value.designation || '',
  };
}

function presentVehicleTypeDetails(value) {
  const id = asId(value);
  if (!id) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.name == null) {
    return { id };
  }
  return {
    id,
    name: value.name || '',
    description: value.description || '',
    status: value.status || null,
  };
}

function presentMovementListItem(doc) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  const { quantity, unitCost, totalAmount } = presentMoneyFields(json);
  const item = presentItemDetails(json.item);

  return {
    id: asId(json.id || json._id),
    type: json.type,
    itemId: item ? item.id : null,
    item,
    quantity,
    fromLocation: json.fromLocation || '',
    toLocation: json.toLocation || '',
    locationType: json.locationType || null,
    vendorName: json.vendorName || '',
    condition: json.condition || null,
    billNo: json.billNo || '',
    challanNo: json.challanNo || '',
    paymentMode: json.paymentMode || null,
    unitCost,
    totalAmount,
    movementDate: json.movementDate || null,
    siteId: asId(json.site),
    siteName: presentSiteName(json.site),
    materialReceiptPhoto: json.materialReceiptPhoto || null,
    address: json.address || '',
    remarks: json.remarks || '',
    note: json.note || '',
  };
}

function presentIssueListItem(doc) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  const quantity = Number(json.quantity) || 0;

  return {
    id: asId(json.id || json._id),
    type: json.type || 'issue',
    item: presentItemDetails(json.item),
    quantity,
    fromLocation: json.fromLocation || '',
    toLocation: json.toLocation || '',
    locationType: json.locationType || null,
    site: presentSiteDetails(json.site),
    employee: presentEmployeeDetails(json.employee),
    vehicleType: presentVehicleTypeDetails(json.vehicleType),
    movementDate: json.movementDate || null,
    remarks: json.remarks || '',
    note: json.note || '',
  };
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

function itemBalanceFilter(step) {
  const ids = step.itemIds && step.itemIds.length ? step.itemIds : [step.itemId];
  return { item: { $in: ids } };
}

async function onHand(itemOrId) {
  const ids = await relatedItemIds(itemOrId);
  if (!ids.length) return 0;
  const [row] = await Balance.aggregate([
    { $match: { item: { $in: ids } } },
    { $group: { _id: null, quantity: { $sum: '$quantity' } } },
  ]);
  return row ? row.quantity : 0;
}

async function attachOnHand(docs) {
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
      return json;
    });
  }
  const related = await Item.find({ $or: nameFilters }).select('_id name');
  const qtyByItem = new Map();
  if (related.length) {
    const grouped = await Balance.aggregate([
      { $match: { item: { $in: related.map((row) => row._id) } } },
      { $group: { _id: '$item', quantity: { $sum: '$quantity' } } },
    ]);
    for (const row of grouped) qtyByItem.set(String(row._id), row.quantity);
  }
  const qtyByName = new Map();
  for (const row of related) {
    const key = String(row.name || '').trim().toLowerCase();
    qtyByName.set(key, (qtyByName.get(key) || 0) + (qtyByItem.get(String(row._id)) || 0));
  }
  return docs.map((doc) => {
    const json = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
    json.onHand = qtyByName.get(String(json.name || '').trim().toLowerCase()) || 0;
    return json;
  });
}

async function movementTotals(match) {
  const rows = await Movement.aggregate([
    { $match: match },
    {
      $group: {
        _id: { item: '$item', type: '$type' },
        quantity: { $sum: '$quantity' },
      },
    },
  ]);
  const byItem = new Map();
  for (const row of rows) {
    const id = String(row._id.item);
    const current = byItem.get(id) || { received: 0, issued: 0 };
    if (row._id.type === 'receipt' || row._id.type === 'return') {
      current.received += row.quantity;
    } else if (row._id.type === 'issue') {
      current.issued += row.quantity;
    }
    byItem.set(id, current);
  }
  return byItem;
}

function addByName(related, valueByItem, pick) {
  const byName = new Map();
  for (const row of related) {
    const key = String(row.name || '').trim().toLowerCase();
    byName.set(key, (byName.get(key) || 0) + pick(valueByItem.get(String(row._id))));
  }
  return byName;
}

async function attachStockFlow(docs) {
  const withQty = await attachOnHand(docs);
  if (!withQty.length) return withQty;
  const nameFilters = [...new Map(
    withQty
      .map((doc) => String(doc.name || '').trim())
      .filter(Boolean)
      .map((name) => [name.toLowerCase(), { name: new RegExp(`^${escapeRegex(name)}$`, 'i') }])
  ).values()];
  if (!nameFilters.length) {
    return withQty.map((json) => {
      json.received = 0;
      json.issued = 0;
      return json;
    });
  }
  const related = await Item.find({ $or: nameFilters }).select('_id name');
  const totals = related.length
    ? await movementTotals({ item: { $in: related.map((row) => row._id) } })
    : new Map();
  const receivedByName = addByName(related, totals, (row) => (row && row.received) || 0);
  const issuedByName = addByName(related, totals, (row) => (row && row.issued) || 0);
  return withQty.map((json) => {
    const key = String(json.name || '').trim().toLowerCase();
    json.received = receivedByName.get(key) || 0;
    json.issued = issuedByName.get(key) || 0;
    return json;
  });
}

const items = {
  async create(body) {
    const code = await nextCode('inventory_item', 'ITM');
    return itemRepo.create({
      code,
      sku: (body.sku || code).toUpperCase(),
      name: body.name,
      category: body.category,
      unit: body.unit,
      reorderLevel: body.reorderLevel ?? 0,
      description: body.description || '',
      isActive: body.isActive !== false,
    });
  },

  async list(query) {
    const filter = {};
    if (query.category) filter.category = query.category;
    if (query.isActive !== undefined) filter.isActive = query.isActive;
    if (query.search) {
      const pattern = containsRegex(query.search);
      filter.$or = [{ name: pattern }, { sku: pattern }, { code: pattern }, { category: pattern }];
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
    if (body.sku) doc.sku = body.sku.toUpperCase();
    assignDefined(doc, body, ['name', 'category', 'unit', 'reorderLevel', 'description', 'isActive']);
    const [, onHandQty] = await Promise.all([doc.save(), onHand(doc._id)]);
    const json = doc.toJSON();
    json.onHand = onHandQty;
    return json;
  },

  async remove(id) {
    const doc = await getItem(id);
    if (await onHand(doc._id) > 0) {
      throw new AppError('Issue or transfer remaining stock before deleting this item', 409, 'CONFLICT');
    }
    await doc.deleteOne();
  },
};

async function increaseStock(step, session) {
  const location = normalizeLocation(step.location) || DEFAULT_LOCATION;
  const filter = { item: step.itemId, location };
  const update = {
    $inc: { quantity: step.quantity },
    $setOnInsert: { item: step.itemId, location },
  };

  try {
    await Balance.updateOne(filter, update, sessionOptions(session, { upsert: true }));
  } catch (error) {
    if (error.code !== 11000) throw error;
    await Balance.updateOne(filter, { $inc: { quantity: step.quantity } }, sessionOptions(session));
  }

  return { ...step, location };
}

async function decreaseFromItem(step, session) {
  let remaining = roundQuantity(step.quantity);
  const taken = [];
  const itemFilter = itemBalanceFilter(step);

  while (remaining > 0) {
    const full = await Balance.findOneAndUpdate(
      { ...itemFilter, quantity: { $gte: remaining } },
      { $inc: { quantity: -remaining } },
      sessionOptions(session, { new: true })
    );
    if (full) {
      taken.push({ ...step, location: full.location, quantity: remaining });
      remaining = 0;
      break;
    }

    const rowQuery = Balance.findOne({ ...itemFilter, quantity: { $gt: 0 } }).sort({ quantity: -1 });
    const row = session ? await rowQuery.session(session) : await rowQuery;
    if (!row) break;

    const take = roundQuantity(Math.min(row.quantity, remaining));
    const got = await Balance.findOneAndUpdate(
      { _id: row._id, quantity: { $gte: take } },
      { $inc: { quantity: -take } },
      sessionOptions(session, { new: true })
    );
    if (!got) continue;
    taken.push({ ...step, location: got.location, quantity: take });
    remaining = roundQuantity(remaining - take);
  }

  if (remaining > 0) {
    for (const part of [...taken].reverse()) {
      await increaseStock(part, session);
    }
    const available = await onHand(step.itemId);
    throw new AppError(
      `Insufficient stock. Remaining ${available}, requested ${step.quantity}`,
      409,
      'STOCK_INSUFFICIENT'
    );
  }

  return taken;
}

async function decreaseStock(step, session) {
  const location = normalizeLocation(step.location);
  if (!location) {
    return decreaseFromItem(step, session);
  }

  const updated = await Balance.findOneAndUpdate(
    { item: step.itemId, location, quantity: { $gte: step.quantity } },
    { $inc: { quantity: -step.quantity } },
    sessionOptions(session, { new: true })
  );

  if (!updated) {
    throw new AppError('Insufficient stock', 409, 'STOCK_INSUFFICIENT');
  }

  return [{ ...step, location }];
}

async function compensate(applied) {
  for (const entry of [...applied].reverse()) {
    try {
      if (entry.type === 'decrease') await increaseStock(entry.step, null);
      else await decreaseStock(entry.step, null);
    } catch (error) {
      logger.error({ err: error }, 'Stock compensation failed');
    }
  }
}

async function applyPlan(plan, itemId, session) {
  const applied = [];
  try {
    for (const step of plan.decrease) {
      const parts = await decreaseStock({ ...step, itemId }, session);
      for (const part of parts) {
        applied.push({ type: 'decrease', step: part });
      }
    }
    for (const step of plan.increase) {
      const tagged = await increaseStock({ ...step, itemId }, session);
      applied.push({ type: 'increase', step: tagged });
    }
    return applied;
  } catch (error) {
    if (!session) await compensate(applied);
    throw error;
  }
}

let transactionsEnabled;

async function transactionsAvailable() {
  if (transactionsEnabled !== undefined) return transactionsEnabled;
  try {
    const hello = await mongoose.connection.db.command({ hello: 1 });
    transactionsEnabled = Boolean(hello.setName);
  } catch {
    transactionsEnabled = false;
  }
  return transactionsEnabled;
}

function transactionsUnsupported(error) {
  const message = String(error && error.message ? error.message : '');
  return message.includes('Transaction numbers are only allowed')
    || message.includes('replica set');
}

async function withOptionalTransaction(work) {
  if (!(await transactionsAvailable())) return work(null);

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await work(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction().catch(() => { });
    if (!transactionsUnsupported(error)) throw error;
    transactionsEnabled = false;
    return work(null);
  } finally {
    session.endSession();
  }
}

function withDefaultLocations(body) {
  const next = { ...body };
  next.fromLocation = normalizeLocation(next.fromLocation);
  next.toLocation = normalizeLocation(next.toLocation);

  if ((next.type === 'receipt' || next.type === 'return') && !next.toLocation) {
    next.toLocation = DEFAULT_LOCATION;
  }
  if (next.type === 'adjustment' && next.direction === 'increase' && !next.toLocation && !next.fromLocation) {
    next.toLocation = DEFAULT_LOCATION;
  }
  if (next.type === 'issue' && !next.fromLocation) {
    next.fromLocation = DEFAULT_LOCATION;
  }
  if (next.type === 'adjustment' && next.direction === 'decrease' && !next.fromLocation && !next.toLocation) {
    next.fromLocation = DEFAULT_LOCATION;
  }
  return next;
}

function isLowStock(quantity, reorderLevel) {
  return Number(reorderLevel) > 0 && Number(quantity) <= Number(reorderLevel);
}

function presentStockItem(item, quantity, extra = {}) {
  const reorderLevel = item.reorderLevel || 0;
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
    isLow: isLowStock(onHand, reorderLevel),
    item: {
      id: item.id || String(item._id),
      name: item.name,
      sku: item.sku,
      unit: item.unit,
      code: item.code,
      category: item.category,
      reorderLevel,
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
      || pattern.test(row.item.sku || '')
      || pattern.test(row.item.code || '')
      || pattern.test(row.item.category || '')
    ));
  }
  const lowItems = items.filter((row) => row.isLow);
  const total = items.length;
  const unique = new Map();
  for (const row of items) {
    const key = String(row.item && row.item.name ? row.item.name : row.id).trim().toLowerCase();
    if (!unique.has(key)) unique.set(key, row);
  }
  const uniqueRows = [...unique.values()];
  return {
    items,
    lowItems,
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
    const location = normalizeLocation(query.location);
    if (location) {
      const filter = { location };
      if (query.itemId) {
        const item = await getItem(query.itemId);
        filter.item = { $in: await relatedItemIds(item) };
      }
      const docs = await Balance.find(filter)
        .sort({ quantity: -1 })
        .populate('item', 'name sku unit code category reorderLevel');
      const itemIds = docs.map((doc) => doc.item && doc.item._id).filter(Boolean);
      const totals = itemIds.length
        ? await movementTotals({
          item: { $in: itemIds },
          $or: [
            { type: { $in: ['receipt', 'return'] }, toLocation: location },
            { type: 'issue', fromLocation: location },
          ],
        })
        : new Map();
      const rows = docs.map((doc) => {
        const json = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
        if (!json.item) return null;
        const flow = totals.get(String(json.item.id || json.item._id)) || { received: 0, issued: 0 };
        return presentStockItem(json.item, json.quantity, {
          id: json.id,
          received: flow.received,
          issued: flow.issued,
          location: json.location || location,
        });
      }).filter(Boolean);
      return packStock(rows, query);
    }

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

  async low(query) {
    const skip = (query.page - 1) * query.limit;
    const [result] = await Item.aggregate([
      { $match: { isActive: true, reorderLevel: { $gt: 0 } } },
      {
        $lookup: {
          from: COLLECTIONS.stockBalances,
          localField: '_id',
          foreignField: 'item',
          as: 'balances',
        },
      },
      { $addFields: { onHand: { $ifNull: [{ $sum: '$balances.quantity' }, 0] } } },
      { $match: { $expr: { $lte: ['$onHand', '$reorderLevel'] } } },
      {
        $project: {
          _id: 0,
          id: { $toString: '$_id' },
          code: 1,
          sku: 1,
          name: 1,
          category: 1,
          unit: 1,
          reorderLevel: 1,
          onHand: 1,
        },
      },
      { $sort: { onHand: 1, name: 1 } },
      {
        $facet: {
          items: [{ $skip: skip }, { $limit: query.limit }],
          total: [{ $count: 'count' }],
        },
      },
    ]);

    const total = result && result.total[0] ? result.total[0].count : 0;
    return {
      items: result ? result.items : [],
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 1 : Math.ceil(total / query.limit),
      },
    };
  },
};

function idOf(value) {
  return asId(value) || undefined;
}

function pickId(next, current) {
  if (next === undefined) return idOf(current);
  if (next === null || next === '') return undefined;
  return String(next);
}

function pickLocation(next, current) {
  if (next === undefined) return normalizeLocation(current);
  if (next === null) return '';
  return normalizeLocation(next);
}

function mergeMovementInput(doc, body) {
  return {
    type: doc.type,
    itemId: pickId(body.itemId, doc.item),
    quantity: body.quantity !== undefined ? body.quantity : doc.quantity,
    direction: body.direction !== undefined ? body.direction : doc.direction,
    fromLocation: pickLocation(body.fromLocation, doc.fromLocation),
    toLocation: pickLocation(body.toLocation, doc.toLocation),
    locationType: body.locationType !== undefined ? body.locationType : doc.locationType,
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
    note: body.note !== undefined ? body.note : doc.note,
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
  if (
    body.type === 'adjustment'
    && normalizeLocation(body.fromLocation)
    && normalizeLocation(body.toLocation)
    && normalizeLocation(body.fromLocation).toLowerCase() !== normalizeLocation(body.toLocation).toLowerCase()
  ) {
    throw new AppError('An adjustment can update only one location', 400, 'BAD_REQUEST');
  }

  const movement = withDefaultLocations(body);
  if (movement.type === 'transfer' && (!movement.fromLocation || !movement.toLocation)) {
    throw new AppError('Transfer needs both a source and a destination location', 400, 'BAD_REQUEST');
  }

  const plan = planStockMovement(movement);

  const [item, site, employee] = await Promise.all([
    getItem(body.itemId),
    movement.siteId ? requireDoc(Site, movement.siteId, 'Site') : null,
    body.employeeId ? requireDoc(Employee, body.employeeId, 'Employee') : null,
  ]);

  if (!item.isActive) throw new AppError('Item is inactive', 400, 'BAD_REQUEST');

  const stockIds = await relatedItemIds(item);
  if (plan.decrease.length) {
    for (const step of plan.decrease) step.itemIds = stockIds;
  }

  return {
    movement,
    plan,
    item,
    site,
    employee,
  };
}

function movementRecord(body, movement, plan, refs) {
  const payload = {
    type: body.type,
    item: refs.item._id,
    quantity: plan.quantity,
    direction: body.type === 'adjustment' ? body.direction : undefined,
    fromLocation: movement.fromLocation || '',
    toLocation: movement.toLocation || '',
    locationType: body.locationType || movement.locationType || undefined,
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
    note: body.note || '',
  };

  if (movement.type === 'adjustment') {
    const location = movement.toLocation || movement.fromLocation || DEFAULT_LOCATION;
    payload.fromLocation = body.direction === 'decrease' ? location : '';
    payload.toLocation = body.direction === 'increase' ? location : '';
  }

  return payload;
}

function stockFingerprint(payload) {
  return [
    String(payload.item),
    String(payload.quantity),
    String(payload.type || ''),
    String(payload.direction || ''),
    String(payload.fromLocation || ''),
    String(payload.toLocation || ''),
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

async function presentSavedMovement(saved) {
  if (saved && typeof saved.populate === 'function') {
    await saved.populate(MOVEMENT_POPULATE);
  }
  return presentMovementListItem(saved);
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

    const saved = await withOptionalTransaction(async (session) => {
      const applied = await applyPlan(plan, item._id, session);
      try {
        const doc = new Movement(payload);
        await doc.save(sessionOptions(session));
        return doc;
      } catch (error) {
        if (!session) await compensate(applied);
        throw error;
      }
    });

    return await presentSavedMovement(saved);
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
      fromLocation: doc.fromLocation,
      toLocation: doc.toLocation,
    });
    const oldItem = await getItem(doc.item);
    const oldStockIds = await relatedItemIds(oldItem);
    const undone = reversePlan(oldPlan);
    for (const step of oldPlan.decrease) step.itemIds = oldStockIds;
    for (const step of undone.decrease) step.itemIds = oldStockIds;

    const stockTouched = stockFingerprint({
      item: doc.item,
      quantity: doc.quantity,
      type: doc.type,
      direction: doc.direction,
      fromLocation: doc.fromLocation,
      toLocation: doc.toLocation,
    }) !== stockFingerprint(payload);

    if (stockTouched) {
      await assertReplaceFits(oldItem, oldPlan, ctx.item, ctx.plan);
    }

    const saved = await withOptionalTransaction(async (session) => {
      if (stockTouched) {
        await applyPlan(undone, oldItem._id, session);
        try {
          await applyPlan(ctx.plan, ctx.item._id, session);
        } catch (error) {
          if (!session) await applyPlan(oldPlan, oldItem._id, null);
          throw error;
        }
      }
      Object.assign(doc, payload);
      try {
        await doc.save(sessionOptions(session));
        return doc;
      } catch (error) {
        if (!session && stockTouched) {
          const undoNew = reversePlan(ctx.plan);
          for (const step of undoNew.decrease) step.itemIds = await relatedItemIds(ctx.item);
          await applyPlan(undoNew, ctx.item._id, null);
          await applyPlan(oldPlan, oldItem._id, null);
        }
        throw error;
      }
    });

    return await presentSavedMovement(saved);
  },

  async updateIssue(id, body, user) {
    await movements.update(id, body, user, { expectType: 'issue' });
    return movements.getIssue(id);
  },

  async createIssue(body, user) {
    const saved = await movements.create({ ...body, type: 'issue' }, user);
    return movements.getIssue(saved.id);
  },

  async remove(id, options = {}) {
    const doc = await Movement.findById(id);
    if (!doc) {
      throw new AppError(
        options.expectType === 'issue' ? 'Stock issue not found' : 'Stock movement not found',
        404,
        'NOT_FOUND'
      );
    }
    if (options.expectType && doc.type !== options.expectType) {
      throw new AppError(
        options.expectType === 'issue'
          ? 'Stock issue not found'
          : `This record is a ${doc.type}, not a stock movement`,
        404,
        'NOT_FOUND'
      );
    }
    if (!options.expectType && doc.type === 'issue') {
      throw new AppError('Use the issue delete API for stock issues', 400, 'BAD_REQUEST');
    }

    const item = await getItem(doc.item);
    const stockIds = await relatedItemIds(item);
    const plan = planStockMovement({
      type: doc.type,
      quantity: doc.quantity,
      direction: doc.direction,
      fromLocation: doc.fromLocation,
      toLocation: doc.toLocation,
    });
    const undone = reversePlan(plan);
    for (const step of plan.decrease) step.itemIds = stockIds;
    for (const step of undone.decrease) step.itemIds = stockIds;

    const photo = doc.materialReceiptPhoto;
    await withOptionalTransaction(async (session) => {
      await applyPlan(undone, item._id, session);
      try {
        await doc.deleteOne(sessionOptions(session));
      } catch (error) {
        if (!session) await applyPlan(plan, item._id, null);
        throw error;
      }
    });

    removeStoredReceipt(photo);
  },

  async removeIssue(id) {
    return movements.remove(id, { expectType: 'issue' });
  },

  async list(query, options = {}) {
    const asIssue = options.asIssue === true;
    const filter = {};
    if (options.types) filter.type = { $in: options.types };
    else if (query.type) filter.type = query.type;
    if (query.itemId) filter.item = query.itemId;
    if (query.locationType) filter.locationType = query.locationType;
    if (query.siteId) filter.site = query.siteId;
    if (query.employeeId) filter.employee = query.employeeId;
    if (query.vehicleTypeId) filter.vehicleType = query.vehicleTypeId;
    if (query.location) {
      const location = normalizeLocation(query.location);
      filter.$or = [{ fromLocation: location }, { toLocation: location }];
    }
    if (query.search) {
      const pattern = containsRegex(query.search);
      filter.$and = [{ $or: [{ code: pattern }, { reference: pattern }, { remarks: pattern }, { note: pattern }, { vendorName: pattern }, { billNo: pattern }, { challanNo: pattern }, { address: pattern }] }];
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
      select: asIssue ? ISSUE_LIST_SELECT : MOVEMENT_LIST_SELECT,
      populate: asIssue ? ISSUE_POPULATE : MOVEMENT_POPULATE,
      lean: true,
    });
    const present = asIssue ? presentIssueListItem : presentMovementListItem;
    result.items = result.items.map((doc) => present(doc));
    return result;
  },

  async listMovements(query) {
    return movements.list(query, { types: ['receipt', 'return', 'transfer', 'adjustment'] });
  },

  async listIssues(query) {
    return movements.list(query, { types: ['issue'], asIssue: true });
  },

  async getById(id, options = {}) {
    const asIssue = options.expectType === 'issue';
    const doc = await Movement.findById(id)
      .select(asIssue ? ISSUE_LIST_SELECT : MOVEMENT_LIST_SELECT)
      .populate(asIssue ? ISSUE_POPULATE : MOVEMENT_POPULATE)
      .lean({ virtuals: true });
    if (!doc) throw new AppError('Stock movement not found', 404, 'NOT_FOUND');
    if (options.expectType && doc.type !== options.expectType) {
      throw new AppError('Stock issue not found', 404, 'NOT_FOUND');
    }
    return asIssue ? presentIssueListItem(doc) : presentMovementListItem(doc);
  },

  async getIssue(id) {
    return movements.getById(id, { expectType: 'issue' });
  },
};

module.exports = { items, stock, movements };
