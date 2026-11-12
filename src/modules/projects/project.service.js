const mongoose = require('mongoose');
const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const { CURRENCY, COLLECTIONS } = require('../../config/constants');
const { roundMoney } = require('../../common/utils/money');
const {
  assignDefined,
  containsRegex,
  parseSort,
} = require('../../common/utils/helpers');
const Project = require('./project.model');
const Site = require('../sites/site.model');
const Expense = require('../accounts/expense.model');
const PayrollPayment = require('../accounts/payroll.model');
const VehicleAssignment = require('../vehicles/assignment.model');

const repo = new BaseRepository(Project);
const SORT_FIELDS = ['name', 'createdAt', 'status'];
const UPDATE_FIELDS = ['name', 'description', 'status'];

function present(doc) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  if (json._id && json.id == null) json.id = String(json._id);
  delete json.__v;
  return json;
}

async function getActive(id) {
  const doc = await repo.findById(id);
  if (!doc) throw new AppError('Project not found', 404, 'NOT_FOUND');
  return doc;
}

async function getActiveLean(id) {
  const doc = await Project.findById(id)
    .select('name description status createdAt updatedAt')
    .lean({ virtuals: true });
  if (!doc) throw new AppError('Project not found', 404, 'NOT_FOUND');
  return present(doc);
}

async function create(body) {
  const created = await repo.create({
    name: body.name,
    description: body.description || '',
    status: body.status !== undefined ? body.status : true,
  });
  return present(created);
}

async function list(query) {
  const filter = {};
  if (query.status !== undefined) filter.status = query.status;
  if (query.search) {
    const pattern = containsRegex(query.search);
    filter.$or = [{ name: pattern }, { description: pattern }];
  }

  return repo.paginate({
    filter,
    page: query.page,
    limit: query.limit,
    sort: parseSort(query.sort, SORT_FIELDS, { createdAt: -1 }),
    select: 'name description status createdAt updatedAt',
    lean: true,
  });
}

async function getById(id) {
  return getActiveLean(id);
}

async function update(id, body) {
  const doc = await getActive(id);
  assignDefined(doc, body, UPDATE_FIELDS);
  await doc.save();
  return present(doc);
}

async function remove(id) {
  const [doc, site] = await Promise.all([
    getActive(id),
    Site.exists({ project: id }),
  ]);
  if (site) {
    throw new AppError('Delete sites on this project before deleting the project', 409, 'CONFLICT');
  }
  await doc.deleteOne();
}

async function summaryStats(projectId) {
  const siteIds = await Site.find({ project: projectId }).distinct('_id');
  const [siteFacet, expenseRows, payrollRows, vehicles] = await Promise.all([
    Site.aggregate([
      { $match: { project: projectId } },
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
    siteIds.length
      ? PayrollPayment.aggregate([
        { $match: { site: { $in: siteIds } } },
        {
          $group: {
            _id: null,
            amountPaid: { $sum: '$netPay' },
            netAmount: { $sum: '$netPay' },
          },
        },
      ])
      : Promise.resolve([]),
    siteIds.length
      ? VehicleAssignment.countDocuments({ site: { $in: siteIds }, releasedAt: null })
      : Promise.resolve(0),
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
    salaryPaid: payrollRows[0] ? payrollRows[0].amountPaid : 0,
    salaryNet: payrollRows[0] ? payrollRows[0].netAmount : 0,
    vehicles,
  };
}

async function summary(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid identifier', 400, 'BAD_REQUEST');
  }
  const projectId = new mongoose.Types.ObjectId(id);
  const [project, stats] = await Promise.all([
    getActiveLean(id),
    summaryStats(projectId),
  ]);

  const recordedCost = stats.expenseTotal + stats.salaryPaid;
  const { sites, sitesByStatus, employeeCount, expenseTotal, salaryPaid, salaryNet, vehicles } = stats;

  return {
    project,
    currency: CURRENCY,
    sites: { total: sites, ...sitesByStatus },
    employeeCount,
    vehiclesAssigned: vehicles,
    accounts: {
      expenseTotal,
      salaryNet,
      salaryAmountPaid: salaryPaid,
      recordedCost,
      budgetAmount: null,
      clientAmount: null,
      clientPendingAmount: null,
      moneySpent: roundMoney(0),
      budgetRemaining: null,
    },
  };
}

module.exports = { create, list, getById, update, remove, summary };
