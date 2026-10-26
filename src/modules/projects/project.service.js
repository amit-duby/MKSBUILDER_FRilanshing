const mongoose = require('mongoose');
const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const { CURRENCY, COLLECTIONS } = require('../../config/constants');
const { nextCode } = require('../../common/utils/sequence');
const { roundMoney } = require('../../common/utils/money');
const {
  assignDefined,
  archivedFilter,
  containsRegex,
  parseSort,
} = require('../../common/utils/helpers');
const Project = require('./project.model');
const Site = require('../sites/site.model');
const Expense = require('../accounts/expense.model');
const SalaryRecord = require('../accounts/salary.model');
const VehicleAssignment = require('../vehicles/assignment.model');

const repo = new BaseRepository(Project);
const SORT_FIELDS = ['name', 'code', 'startDate', 'createdAt', 'status'];
const UPDATE_FIELDS = [
  'name',
  'clientName',
  'clientPhone',
  'description',
  'status',
  'startDate',
  'expectedEndDate',
  'actualEndDate',
  'budgetAmount',
  'clientAmount',
  'address',
  'city',
  'state',
  'pincode',
];

function pendingClientAmount(budgetAmount, clientAmount) {
  if (budgetAmount == null) return null;
  const paid = clientAmount == null ? 0 : Number(clientAmount);
  return roundMoney(Number(budgetAmount) - paid);
}

function withClientPending(doc) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  json.clientPendingAmount = pendingClientAmount(json.budgetAmount, json.clientAmount);
  return json;
}

async function getActive(id) {
  const doc = await repo.findById(id);
  if (!doc || doc.isDeleted) throw new AppError('Project not found', 404, 'NOT_FOUND');
  return doc;
}

function assertDates(doc) {
  if (doc.expectedEndDate && doc.startDate && doc.expectedEndDate < doc.startDate) {
    throw new AppError('Expected end date must be on or after the start date', 400, 'BAD_REQUEST');
  }
  if (doc.actualEndDate && doc.startDate && doc.actualEndDate < doc.startDate) {
    throw new AppError('Actual end date must be on or after the start date', 400, 'BAD_REQUEST');
  }

}

async function create(body) {
  const created = await repo.create({
    code: await nextCode('project', 'PRJ'),
    name: body.name,
    clientName: body.clientName,
    clientPhone: body.clientPhone,
    description: body.description || '',
    status: body.status || 'planning',
    startDate: body.startDate,
    expectedEndDate: body.expectedEndDate,
    budgetAmount: body.budgetAmount,
    clientAmount: body.clientAmount,
    clientPendingAmount: pendingClientAmount(body.budgetAmount, body.clientAmount),
    currency: CURRENCY,
    address: body.address || '',
    city: body.city || '',
    state: body.state || '',
    pincode: body.pincode || '',
  });
  return withClientPending(created);
}

async function list(query) {
  const filter = { ...archivedFilter(query) };
  if (query.status) filter.status = query.status;
  if (query.search) {
    const pattern = containsRegex(query.search);
    filter.$or = [{ name: pattern }, { code: pattern }, { clientName: pattern }, { city: pattern }];
  }

  const page = query.page;
  const limit = query.limit;
  const [row] = await Project.aggregate([
    { $match: filter },
    {
      $facet: {
        items: [
          { $sort: parseSort(query.sort, SORT_FIELDS) },
          { $skip: (page - 1) * limit },
          { $limit: limit },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);
  const total = row && row.total[0] ? row.total[0].count : 0;

  return {
    items: (row ? row.items : []).map((doc) => {
      doc.id = doc._id.toString();
      delete doc._id;
      delete doc.__v;
      return withClientPending(doc);
    }),
    meta: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 1 : Math.ceil(total / limit),
    },
  };
}

async function getById(id) {
  return withClientPending(await getActive(id));
}

async function update(id, body) {
  const completing = body.status === 'completed';
  const [doc, activeSite] = await Promise.all([
    getActive(id),
    completing ? Site.exists({ project: id, isDeleted: false, status: 'active' }) : null,
  ]);

  if (completing && activeSite) {
    throw new AppError(
      'Complete or deactivate active sites before completing this project',
      409,
      'CONFLICT'
    );
  }

  assignDefined(doc, body, UPDATE_FIELDS);
  doc.clientPendingAmount = pendingClientAmount(doc.budgetAmount, doc.clientAmount);
  if (body.status === 'completed' && !doc.actualEndDate) doc.actualEndDate = new Date();
  assertDates(doc);
  await doc.save();
  return withClientPending(doc);
}

async function remove(id) {
  const [doc, activeSite] = await Promise.all([
    getActive(id),
    Site.exists({ project: id, isDeleted: false, status: 'active' }),
  ]);
  if (activeSite) {
    throw new AppError('Archive or complete active sites before archiving this project', 409, 'CONFLICT');
  }
  doc.isDeleted = true;
  if (doc.status === 'planning' || doc.status === 'active' || doc.status === 'on_hold') {
    doc.status = 'cancelled';
  }
  await doc.save();
}

async function restore(id) {
  const doc = await repo.findById(id);
  if (!doc) throw new AppError('Project not found', 404, 'NOT_FOUND');
  if (!doc.isDeleted) throw new AppError('Project is already active', 400, 'BAD_REQUEST');
  doc.isDeleted = false;
  if (doc.status === 'cancelled') doc.status = 'planning';
  await doc.save();
  return withClientPending(doc);
}

async function summaryStats(projectId) {
  const [siteFacet, expenseRows, salaryRows, vehicles] = await Promise.all([
    Site.aggregate([
      { $match: { project: projectId, isDeleted: false } },
      {
        $facet: {
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          employees: [
            {
              $lookup: {
                from: COLLECTIONS.employeeAssignments,
                let: { siteId: '$_id' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$site', '$$siteId'] },
                          { $eq: ['$isCurrent', true] },
                        ],
                      },
                    },
                  },
                  { $group: { _id: '$employee' } },
                ],
                as: 'assigned',
              },
            },
            { $unwind: '$assigned' },
            { $group: { _id: '$assigned._id' } },
            { $count: 'count' },
          ],
        },
      },
    ]),
    Expense.aggregate([
      { $match: { project: projectId, isVoid: false } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    SalaryRecord.aggregate([
      { $match: { project: projectId, isVoid: false } },
      {
        $group: {
          _id: null,
          amountPaid: { $sum: '$amountPaid' },
          netAmount: { $sum: '$netAmount' },
        },
      },
    ]),
    VehicleAssignment.countDocuments({ project: projectId, releasedAt: null }),
  ]);

  const facet = siteFacet[0] || { byStatus: [], employees: [] };
  const sitesByStatus = { active: 0, inactive: 0, completed: 0 };
  let sites = 0;
  for (const row of facet.byStatus) {
    sitesByStatus[row._id] = row.count;
    sites += row.count;
  }

  return {
    sites,
    sitesByStatus,
    employeeCount: facet.employees[0] ? facet.employees[0].count : 0,
    expenseTotal: expenseRows[0] ? expenseRows[0].total : 0,
    salaryPaid: salaryRows[0] ? salaryRows[0].amountPaid : 0,
    salaryNet: salaryRows[0] ? salaryRows[0].netAmount : 0,
    vehicles,
  };
}

async function summary(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid identifier', 400, 'BAD_REQUEST');
  }
  const projectId = new mongoose.Types.ObjectId(id);
  const [project, stats] = await Promise.all([
    getActive(id),
    summaryStats(projectId),
  ]);

  const budgetAmount = project.budgetAmount ?? null;
  const clientAmount = project.clientAmount ?? null;
  const clientPendingAmount = pendingClientAmount(budgetAmount, clientAmount);
  const recordedCost = stats.expenseTotal + stats.salaryPaid;
  const { sites, sitesByStatus, employeeCount, expenseTotal, salaryPaid, salaryNet, vehicles } = stats;

  return {
    project: withClientPending(project),
    currency: project.currency || CURRENCY,
    sites: { total: sites, ...sitesByStatus },
    employeeCount,
    vehiclesAssigned: vehicles,
    accounts: {
      expenseTotal,
      salaryNet,
      salaryAmountPaid: salaryPaid,
      recordedCost,
      budgetAmount,
      clientAmount,
      clientPendingAmount,
      budgetRemaining: budgetAmount === null ? null : budgetAmount - recordedCost,
    },
  };
}

module.exports = { create, list, getById, update, remove, restore, summary };
