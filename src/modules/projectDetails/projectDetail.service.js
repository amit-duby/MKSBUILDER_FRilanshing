const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const requireDoc = require('../../common/utils/requireDoc');
const { roundMoney } = require('../../common/utils/money');
const {
  assignDefined,
  containsRegex,
  parseSort,
  startOfBusinessDay,
} = require('../../common/utils/helpers');
const ProjectDetail = require('./projectDetail.model');
const Project = require('../projects/project.model');

const repo = new BaseRepository(ProjectDetail);
const SORT_FIELDS = ['startDate', 'clientName', 'status', 'createdAt', 'budgetAmount'];
const POPULATE = [{ path: 'project', select: 'code name status clientName' }];
const UPDATE_FIELDS = [
  'clientName',
  'clientPhoneNo',
  'description',
  'status',
  'startDate',
  'actualEndDate',
  'budgetAmount',
  'clientAmount',
  'moneySpend',
  'installmentType',
];

function pendingClientAmount(budgetAmount, clientAmount) {
  if (budgetAmount == null) return null;
  const paid = clientAmount == null ? 0 : Number(clientAmount);
  return roundMoney(Number(budgetAmount) - paid);
}

function projectBrief(project) {
  if (!project) return null;
  const json = typeof project.toJSON === 'function' ? project.toJSON() : project;
  return {
    id: json.id || String(json._id),
    code: json.code,
    name: json.name,
    status: json.status,
    clientName: json.clientName,
  };
}

function present(doc, project) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  if (project) {
    json.project = projectBrief(project);
    json.projectId = json.project.id;
  } else if (json.project && json.project.id) {
    json.projectId = json.project.id;
  } else {
    json.projectId = json.project || null;
  }
  json.clientPendingAmount = pendingClientAmount(json.budgetAmount, json.clientAmount);
  json.moneySpend = json.moneySpend == null ? 0 : roundMoney(json.moneySpend);
  return json;
}

async function getActive(id) {
  const doc = await ProjectDetail.findById(id).populate(POPULATE).lean({ virtuals: true });
  if (!doc) throw new AppError('Project detail not found', 404, 'NOT_FOUND');
  if (doc._id && doc.id == null) doc.id = String(doc._id);
  if (doc.project && doc.project._id && doc.project.id == null) {
    doc.project.id = String(doc.project._id);
  }
  return doc;
}

async function assertProject(projectId) {
  return requireDoc(Project, projectId, 'Project');
}

function assertDates(doc) {
  if (doc.actualEndDate && doc.startDate && doc.actualEndDate < doc.startDate) {
    throw new AppError('Actual end date must be on or after the start date', 400, 'BAD_REQUEST');
  }
}

function applyUpdateFields(doc, body) {
  assignDefined(doc, body, UPDATE_FIELDS);
  if (body.startDate) doc.startDate = startOfBusinessDay(body.startDate);
  if (Object.prototype.hasOwnProperty.call(body, 'actualEndDate')) {
    doc.actualEndDate = body.actualEndDate ? startOfBusinessDay(body.actualEndDate) : null;
  }
  if (doc.moneySpend == null) doc.moneySpend = 0;
  if (body.status === 'completed' && !doc.actualEndDate) doc.actualEndDate = new Date();
  doc.clientPendingAmount = pendingClientAmount(doc.budgetAmount, doc.clientAmount);
  assertDates(doc);
}

async function create(body) {
  const project = await assertProject(body.projectId);

  try {
    const doc = await repo.create({
      project: project._id,
      clientName: body.clientName,
      clientPhoneNo: body.clientPhoneNo || '',
      description: body.description || '',
      status: body.status || 'planning',
      startDate: startOfBusinessDay(body.startDate),
      actualEndDate: body.actualEndDate ? startOfBusinessDay(body.actualEndDate) : undefined,
      budgetAmount: body.budgetAmount,
      clientAmount: body.clientAmount,
      moneySpend: body.moneySpend ?? 0,
      clientPendingAmount: pendingClientAmount(body.budgetAmount, body.clientAmount),
      installmentType: body.installmentType || '',
    });
    return present(doc, project);
  } catch (error) {
    if (error && error.code === 11000) {
      throw new AppError('Project detail already exists for this project', 409, 'CONFLICT');
    }
    throw error;
  }
}

async function list(query) {
  const filter = {};
  if (query.projectId) filter.project = query.projectId;
  if (query.status) filter.status = query.status;
  if (query.search) {
    const pattern = containsRegex(query.search);
    filter.$or = [{ clientName: pattern }, { description: pattern }, { clientPhoneNo: pattern }];
  }

  const result = await repo.paginate({
    filter,
    page: query.page,
    limit: query.limit,
    sort: parseSort(query.sort, SORT_FIELDS, { startDate: -1 }),
    populate: POPULATE,
    lean: true,
  });

  return {
    ...result,
    items: result.items.map((item) => present(item)),
  };
}

async function getById(id) {
  return present(await getActive(id));
}

async function update(id, body) {
  const doc = await ProjectDetail.findById(id);
  if (!doc) throw new AppError('Project detail not found', 404, 'NOT_FOUND');

  let project;
  if (body.projectId) {
    project = await assertProject(body.projectId);
    doc.project = project._id;
  }

  applyUpdateFields(doc, body);

  try {
    await doc.save();
  } catch (error) {
    if (error && error.code === 11000) {
      throw new AppError('Project detail already exists for this project', 409, 'CONFLICT');
    }
    throw error;
  }

  return present(doc, project);
}

async function remove(id) {
  const doc = await ProjectDetail.findById(id).select('_id');
  if (!doc) throw new AppError('Project detail not found', 404, 'NOT_FOUND');
  await doc.deleteOne();
}

module.exports = { create, list, getById, update, remove };
