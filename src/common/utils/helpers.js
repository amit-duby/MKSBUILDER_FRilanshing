const AppError = require('../errors/AppError');

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsRegex(value) {
  return new RegExp(escapeRegex(value), 'i');
}

function parseSort(value, allowed, fallback = { createdAt: -1 }) {
  if (!value) return fallback;
  const direction = value.startsWith('-') ? -1 : 1;
  const field = value.replace(/^-/, '');
  if (!allowed.includes(field)) {
    throw new AppError(`Sort must be one of: ${allowed.join(', ')}`, 400, 'BAD_REQUEST');
  }
  return { [field]: direction };
}

function assignDefined(target, source, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      target[key] = source[key];
    }
  }
  return target;
}

function archivedFilter(query) {
  if (query && query.includeArchived) return {};
  return { isDeleted: false };
}

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfBusinessDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

function calendarDayLabel(value) {
  return startOfBusinessDay(value).toISOString().slice(0, 10);
}

function endOfUtcDay(date) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    23,
    59,
    59,
    999
  ));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function resolveRange(query = {}, defaultMonths = 1) {
  const rawTo = query.to ? new Date(query.to) : new Date();
  const rawFrom = query.from
    ? new Date(query.from)
    : new Date(Date.UTC(rawTo.getUTCFullYear(), rawTo.getUTCMonth() - (defaultMonths - 1), 1));

  if (Number.isNaN(rawFrom.getTime()) || Number.isNaN(rawTo.getTime())) {
    throw new AppError('Invalid date range', 400, 'BAD_REQUEST');
  }

  const from = startOfUtcDay(rawFrom);
  const to = endOfUtcDay(rawTo);

  if (from > to) {
    throw new AppError('from must be earlier than or equal to to', 400, 'BAD_REQUEST');
  }

  const maxMs = 800 * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxMs) {
    throw new AppError('Date range cannot exceed 800 days', 400, 'BAD_REQUEST');
  }

  return { from, to };
}

module.exports = {
  escapeRegex,
  containsRegex,
  parseSort,
  assignDefined,
  archivedFilter,
  startOfUtcDay,
  endOfUtcDay,
  addDays,
  resolveRange,
};
