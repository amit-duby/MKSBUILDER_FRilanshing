const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const requireDoc = require('../../common/utils/requireDoc');
const { nextCode } = require('../../common/utils/sequence');
const {
  assignDefined,
  containsRegex,
  parseSort,
  startOfBusinessDay,
  endOfUtcDay,
} = require('../../common/utils/helpers');
const { removeStoredLocalReceipt } = require('../../common/middleware/localAmountUpload');
const LocalAmount = require('./localAmount.model');
const ImpressAmount = require('../ImpressAmount/impressAmount.model');

const repo = new BaseRepository(LocalAmount);
const SORT_FIELDS = ['date', 'code', 'returnAmount', 'createdAt'];
const POPULATE = [
  {
    path: 'impressAmount',
    select: 'code date givenTo note employee site',
    populate: [
      { path: 'employee', select: 'code fullName designation status' },
      { path: 'site', select: 'name code status' },
    ],
  },
];

function present(doc, impressAmount) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  if (impressAmount) {
    const impress = typeof impressAmount.toJSON === 'function'
      ? impressAmount.toJSON()
      : impressAmount;
    json.impressAmount = {
      id: impress.id || String(impress._id),
      code: impress.code,
      date: impress.date,
      givenTo: impress.givenTo,
      note: impress.note,
      employee: impress.employee,
      site: impress.site,
    };
  }
  return json;
}

async function getActive(id) {
  const doc = await LocalAmount.findById(id).populate(POPULATE).lean({ virtuals: true });
  if (!doc) throw new AppError('Local amount not found', 404, 'NOT_FOUND');
  if (doc._id && doc.id == null) doc.id = String(doc._id);
  return doc;
}

async function assertImpressAmount(impressAmountId) {
  return requireDoc(ImpressAmount, impressAmountId, 'Impress amount');
}

async function create(body) {
  const [impressAmount, code] = await Promise.all([
    assertImpressAmount(body.impressAmountId),
    nextCode('localAmount', 'LOC'),
  ]);

  const doc = await repo.create({
    code,
    date: startOfBusinessDay(body.date),
    impressAmount: impressAmount._id,
    details: body.details,
    returnAmount: body.returnAmount,
    paymentMode: body.paymentMode,
    uploadReceipt: body.uploadReceipt || null,
  });

  return present(doc, impressAmount);
}

async function list(query) {
  const filter = {};
  if (query.impressAmountId) filter.impressAmount = query.impressAmountId;
  if (query.paymentMode) filter.paymentMode = query.paymentMode;
  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = startOfBusinessDay(query.from);
    if (query.to) filter.date.$lte = endOfUtcDay(startOfBusinessDay(query.to));
  }
  if (query.search) {
    const pattern = containsRegex(query.search);
    filter.$or = [{ code: pattern }, { details: pattern }];
  }

  return repo.paginate({
    filter,
    page: query.page,
    limit: query.limit,
    sort: parseSort(query.sort, SORT_FIELDS, { date: -1 }),
    populate: POPULATE,
    lean: true,
  });
}

function getById(id) {
  return getActive(id);
}

async function update(id, body) {
  const doc = await LocalAmount.findById(id);
  if (!doc) throw new AppError('Local amount not found', 404, 'NOT_FOUND');

  let impressAmount;
  if (body.impressAmountId) {
    impressAmount = await assertImpressAmount(body.impressAmountId);
    doc.impressAmount = impressAmount._id;
  }
  if (body.date) doc.date = startOfBusinessDay(body.date);

  const previousReceipt = doc.uploadReceipt;
  if (Object.prototype.hasOwnProperty.call(body, 'uploadReceipt')) {
    doc.uploadReceipt = body.uploadReceipt || null;
  }

  assignDefined(doc, body, ['details', 'returnAmount', 'paymentMode']);
  await doc.save();

  if (
    Object.prototype.hasOwnProperty.call(body, 'uploadReceipt')
    && previousReceipt
    && previousReceipt !== doc.uploadReceipt
  ) {
    removeStoredLocalReceipt(previousReceipt);
  }

  return present(doc, impressAmount);
}

async function remove(id) {
  const doc = await LocalAmount.findById(id).select('uploadReceipt');
  if (!doc) throw new AppError('Local amount not found', 404, 'NOT_FOUND');
  removeStoredLocalReceipt(doc.uploadReceipt);
  await doc.deleteOne();
}

module.exports = { create, list, getById, update, remove };
