const mongoose = require('mongoose');
const { COLLECTIONS } = require('../../config/constants');
const logger = require('../../common/utils/logger');
const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const requireDoc = require('../../common/utils/requireDoc');
const { nextCode } = require('../../common/utils/sequence');
const { roundMoney } = require('../../common/utils/money');
const {
  assignDefined,
  archivedFilter,
  containsRegex,
  parseSort,
  startOfUtcDay,
  endOfUtcDay,
} = require('../../common/utils/helpers');
const { planStockMovement } = require('./stockPlan');
const Item = require('./item.model');
const Location = require('./location.model');
const Balance = require('./balance.model');
const Movement = require('./movement.model');
const Project = require('../projects/project.model');
const Site = require('../sites/site.model');

const itemRepo = new BaseRepository(Item);
const locationRepo = new BaseRepository(Location);
const ITEM_SORT = ['name', 'sku', 'code', 'category', 'createdAt'];
const LOCATION_SORT = ['name', 'code', 'type', 'createdAt'];
const MOVEMENT_SORT = ['movementDate', 'code', 'createdAt', 'type'];
const MOVEMENT_POPULATE = [
  { path: 'item', select: 'name sku unit code' },
  { path: 'fromLocation', select: 'name code type' },
  { path: 'toLocation', select: 'name code type' },
  { path: 'project', select: 'name code' },
  { path: 'site', select: 'name code' },
];

function sessionOptions(session, extra = {}) {
  return session ? { ...extra, session } : extra;
}

async function getItem(id) {
  const doc = await itemRepo.findById(id);
  if (!doc || doc.isDeleted) throw new AppError('Item not found', 404, 'NOT_FOUND');
  return doc;
}

async function onHand(itemId) {
  const [row] = await Balance.aggregate([
    { $match: { item: itemId } },
    { $group: { _id: null, quantity: { $sum: '$quantity' } } },
  ]);
  return row ? row.quantity : 0;
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
    const filter = { ...archivedFilter(query) };
    if (query.category) filter.category = query.category;
    if (query.isActive !== undefined) filter.isActive = query.isActive;
    if (query.search) {
      const pattern = containsRegex(query.search);
      filter.$or = [{ name: pattern }, { sku: pattern }, { code: pattern }, { category: pattern }];
    }

    return itemRepo.paginate({
      filter,
      page: query.page,
      limit: query.limit,
      sort: parseSort(query.sort, ITEM_SORT),
    });
  },

  async getById(id) {
    const doc = await getItem(id);
    const json = doc.toJSON();
    json.onHand = await onHand(doc._id);
    return json;
  },

  async update(id, body) {
    const doc = await getItem(id);
    if (body.sku) doc.sku = body.sku.toUpperCase();
    assignDefined(doc, body, ['name', 'category', 'unit', 'reorderLevel', 'description', 'isActive']);
    await doc.save();
    return this.getById(doc.id);
  },

  async remove(id) {
    const doc = await getItem(id);
    if (await onHand(doc._id) > 0) {
      throw new AppError('Issue or transfer remaining stock before archiving this item', 409, 'CONFLICT');
    }
    doc.isDeleted = true;
    doc.isActive = false;
    await doc.save();
  },

  async restore(id) {
    const doc = await itemRepo.findById(id);
    if (!doc) throw new AppError('Item not found', 404, 'NOT_FOUND');
    if (!doc.isDeleted) throw new AppError('Item is already active', 400, 'BAD_REQUEST');
    doc.isDeleted = false;
    doc.isActive = true;
    await doc.save();
    return doc;
  },
};

async function getLocation(id) {
  const doc = await Location.findById(id).populate('site', 'name code status');
  if (!doc || doc.isDeleted) throw new AppError('Stock location not found', 404, 'NOT_FOUND');
  return doc;
}

const locations = {
  async create(body) {
    if (body.type === 'site_store') {
      const site = await requireDoc(Site, body.siteId, 'Site', { isDeleted: false });
      if (site.status !== 'active') {
        throw new AppError('Site store can only be added for an active site', 400, 'BAD_REQUEST');
      }
      const existing = await Location.findOne({ site: site._id });
      if (existing) {
        throw new AppError('This site already has a stock location', 409, 'CONFLICT');
      }
    }

    return Location.create({
      code: await nextCode('stock_location', 'LOC'),
      name: body.name,
      type: body.type,
      site: body.type === 'site_store' ? body.siteId : undefined,
      isSystem: false,
      isActive: body.isActive !== false,
    });
  },

  async list(query) {
    const filter = { ...archivedFilter(query) };
    if (query.type) filter.type = query.type;
    if (query.siteId) filter.site = query.siteId;
    if (query.search) {
      const pattern = containsRegex(query.search);
      filter.$or = [{ name: pattern }, { code: pattern }];
    }

    return locationRepo.paginate({
      filter,
      page: query.page,
      limit: query.limit,
      sort: parseSort(query.sort, LOCATION_SORT),
      populate: [{ path: 'site', select: 'name code status' }],
    });
  },

  getById(id) {
    return getLocation(id);
  },

  async update(id, body) {
    const doc = await Location.findById(id);
    if (!doc || doc.isDeleted) throw new AppError('Stock location not found', 404, 'NOT_FOUND');
    assignDefined(doc, body, ['name', 'isActive']);
    await doc.save();
    return getLocation(doc.id);
  },

  async remove(id) {
    const doc = await Location.findById(id);
    if (!doc || doc.isDeleted) throw new AppError('Stock location not found', 404, 'NOT_FOUND');
    if (doc.isSystem) throw new AppError('The main store cannot be archived', 409, 'CONFLICT');
    if (doc.type === 'site_store') {
      throw new AppError('Archive the site to archive its store', 409, 'CONFLICT');
    }
    const remaining = await Balance.exists({ location: doc._id, quantity: { $gt: 0 } });
    if (remaining) {
      throw new AppError('Move remaining stock before archiving this location', 409, 'CONFLICT');
    }
    doc.isDeleted = true;
    doc.isActive = false;
    await doc.save();
  },

  async restore(id) {
    const doc = await Location.findById(id);
    if (!doc) throw new AppError('Stock location not found', 404, 'NOT_FOUND');
    if (doc.isSystem) return getLocation(doc.id);
    if (!doc.isDeleted) throw new AppError('Stock location is already active', 400, 'BAD_REQUEST');
    if (doc.type === 'site_store') {
      throw new AppError('Restore the site to restore its store', 409, 'CONFLICT');
    }
    doc.isDeleted = false;
    doc.isActive = true;
    await doc.save();
    return getLocation(doc.id);
  },
};

async function increaseStock(step, session) {
  const filter = { item: step.itemId, location: step.locationId };
  const update = {
    $inc: { quantity: step.quantity },
    $setOnInsert: { item: step.itemId, location: step.locationId },
  };

  try {
    await Balance.updateOne(filter, update, sessionOptions(session, { upsert: true }));
  } catch (error) {
    if (error.code !== 11000) throw error;
    await Balance.updateOne(filter, { $inc: { quantity: step.quantity } }, sessionOptions(session));
  }
}

async function decreaseStock(step, session) {
  const updated = await Balance.findOneAndUpdate(
    { item: step.itemId, location: step.locationId, quantity: { $gte: step.quantity } },
    { $inc: { quantity: -step.quantity } },
    sessionOptions(session, { new: true })
  );

  if (!updated) {
    throw new AppError('Insufficient stock at the source location', 409, 'STOCK_INSUFFICIENT');
  }
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
      const tagged = { ...step, itemId };
      await decreaseStock(tagged, session);
      applied.push({ type: 'decrease', step: tagged });
    }
    for (const step of plan.increase) {
      const tagged = { ...step, itemId };
      await increaseStock(tagged, session);
      applied.push({ type: 'increase', step: tagged });
    }
    return applied;
  } catch (error) {
    if (!session) await compensate(applied);
    throw error;
  }
}

function transactionsUnsupported(error) {
  const message = String(error && error.message ? error.message : '');
  return message.includes('Transaction numbers are only allowed')
    || message.includes('replica set');
}

async function withOptionalTransaction(work) {
  const session = await mongoose.startSession();
  let useFallback = false;

  try {
    session.startTransaction();
    const result = await work(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    if (!transactionsUnsupported(error)) throw error;
    useFallback = true;
  } finally {
    session.endSession();
  }

  if (useFallback) return work(null);
  return null;
}

async function activeLocation(id, label) {
  const location = await requireDoc(Location, id, label, { isDeleted: false });
  if (!location.isActive) throw new AppError(`${label} is inactive`, 400, 'BAD_REQUEST');
  return location;
}

async function assertLocationMatchesSite(location, siteId) {
  if (siteId && location.site && String(location.site) !== String(siteId)) {
    throw new AppError('Stock location does not belong to the selected site', 400, 'BAD_REQUEST');
  }
}

const stock = {
  async list(query) {
    const filter = {};
    if (query.itemId) filter.item = query.itemId;
    if (query.locationId) filter.location = query.locationId;

    const result = await new BaseRepository(Balance).paginate({
      filter,
      page: query.page,
      limit: query.limit,
      sort: parseSort(query.sort, ['quantity', 'updatedAt'], { updatedAt: -1 }),
      populate: [
        { path: 'item', select: 'name sku unit code category reorderLevel' },
        { path: 'location', select: 'name code type site' },
      ],
    });

    return result;
  },

  async low(query) {
    const skip = (query.page - 1) * query.limit;
    const [result] = await Item.aggregate([
      { $match: { isDeleted: false, isActive: true, reorderLevel: { $gt: 0 } } },
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

const movements = {
  async create(body, user) {
    const item = await getItem(body.itemId);
    if (!item.isActive) throw new AppError('Item is inactive', 400, 'BAD_REQUEST');

    if (
      body.type === 'adjustment'
      && body.fromLocationId
      && body.toLocationId
      && String(body.fromLocationId) !== String(body.toLocationId)
    ) {
      throw new AppError('An adjustment can update only one location', 400, 'BAD_REQUEST');
    }

    const plan = planStockMovement(body);
    const locationIds = new Set([
      ...plan.increase.map((step) => step.locationId),
      ...plan.decrease.map((step) => step.locationId),
    ]);

    for (const locationId of locationIds) {
      const location = await activeLocation(locationId, 'Stock location');
      await assertLocationMatchesSite(location, body.siteId);
    }

    let site;
    if (body.siteId) {
      site = await requireDoc(Site, body.siteId, 'Site', { isDeleted: false });
    }
    if (body.projectId) {
      await requireDoc(Project, body.projectId, 'Project', { isDeleted: false });
      if (site && String(site.project) !== String(body.projectId)) {
        throw new AppError('Site does not belong to the selected project', 400, 'BAD_REQUEST');
      }
    }

    const payload = {
      code: await nextCode('stock_movement', 'MOV'),
      type: body.type,
      item: item._id,
      quantity: plan.quantity,
      direction: body.type === 'adjustment' ? body.direction : undefined,
      fromLocation: body.fromLocationId,
      toLocation: body.toLocationId,
      project: body.projectId,
      site: body.siteId,
      unitCost: body.unitCost === undefined ? undefined : roundMoney(body.unitCost),
      movementDate: body.movementDate || new Date(),
      reference: body.reference || '',
      remarks: body.remarks || '',
      createdBy: user && user.id,
    };

    if (body.type === 'adjustment') {
      const locationId = body.toLocationId || body.fromLocationId;
      payload.fromLocation = body.direction === 'decrease' ? locationId : undefined;
      payload.toLocation = body.direction === 'increase' ? locationId : undefined;
    }

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

    return Movement.findById(saved.id).populate(MOVEMENT_POPULATE);
  },

  async list(query) {
    const filter = {};
    if (query.type) filter.type = query.type;
    if (query.itemId) filter.item = query.itemId;
    if (query.projectId) filter.project = query.projectId;
    if (query.siteId) filter.site = query.siteId;
    if (query.locationId) {
      filter.$or = [{ fromLocation: query.locationId }, { toLocation: query.locationId }];
    }
    if (query.search) {
      const pattern = containsRegex(query.search);
      filter.$and = [{ $or: [{ code: pattern }, { reference: pattern }, { remarks: pattern }] }];
    }
    if (query.from || query.to) {
      const from = query.from ? startOfUtcDay(new Date(query.from)) : new Date(0);
      const to = query.to ? endOfUtcDay(new Date(query.to)) : new Date();
      if (from > to) throw new AppError('from must be earlier than or equal to to', 400, 'BAD_REQUEST');
      filter.movementDate = { $gte: from, $lte: to };
    }

    return new BaseRepository(Movement).paginate({
      filter,
      page: query.page,
      limit: query.limit,
      sort: parseSort(query.sort, MOVEMENT_SORT, { movementDate: -1 }),
      populate: MOVEMENT_POPULATE,
    });
  },

  async getById(id) {
    const doc = await Movement.findById(id).populate(MOVEMENT_POPULATE);
    if (!doc) throw new AppError('Stock movement not found', 404, 'NOT_FOUND');
    return doc;
  },
};

module.exports = { items, locations, stock, movements };
