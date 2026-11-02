const { escapeRegex } = require('../../common/utils/helpers');
const Department = require('../departments/department.model');
const Project = require('../projects/project.model');
const Site = require('../sites/site.model');
const Employee = require('../employees/employee.model');

function codeOrName(value) {
  return String(value || '').trim();
}

function nameFilter(value) {
  return new RegExp(`^${escapeRegex(codeOrName(value))}$`, 'i');
}

async function findDepartment(value) {
  const text = codeOrName(value);
  if (!text) return null;
  return Department.findOne({
    isDeleted: false,
    $or: [{ code: text.toUpperCase() }, { name: nameFilter(text) }],
  });
}

async function findProject(value) {
  const text = codeOrName(value);
  if (!text) return null;
  return Project.findOne({
    isDeleted: false,
    $or: [{ code: text.toUpperCase() }, { name: nameFilter(text) }],
  });
}

async function findSite(value) {
  const text = codeOrName(value);
  if (!text) return null;
  return Site.findOne({
    isDeleted: false,
    $or: [{ code: text.toUpperCase() }, { name: nameFilter(text) }],
  });
}

async function findEmployee(value) {
  const text = codeOrName(value);
  if (!text) return null;
  return Employee.findOne({
    isDeleted: false,
    $or: [{ code: text.toUpperCase() }, { fullName: nameFilter(text) }],
  });
}

function asNumber(value) {
  if (value == null || value === '') return undefined;
  const number = Number(String(value).replace(/[,₹\s]/g, ''));
  return Number.isFinite(number) ? number : undefined;
}

function asDate(value) {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function rowError(error) {
  return error && error.message ? error.message : String(error);
}

function createCache() {
  return {
    department: new Map(),
    project: new Map(),
    site: new Map(),
    employee: new Map(),
  };
}

function remember(cache, kind, doc, ...aliases) {
  if (!cache || !doc) return doc;
  const map = cache[kind];
  if (!map) return doc;
  if (doc.code) map.set(String(doc.code).trim().toUpperCase(), doc);
  if (doc.name) map.set(String(doc.name).trim().toLowerCase(), doc);
  if (doc.fullName) map.set(String(doc.fullName).trim().toLowerCase(), doc);
  for (const alias of aliases) {
    const text = codeOrName(alias);
    if (!text) continue;
    map.set(text.toUpperCase(), doc);
    map.set(text.toLowerCase(), doc);
  }
  return doc;
}

async function resolve(kind, value, cache, finder) {
  const text = codeOrName(value);
  if (!text) return null;
  if (cache && cache[kind]) {
    const hit = cache[kind].get(text.toUpperCase()) || cache[kind].get(text.toLowerCase());
    if (hit) return hit;
  }
  return finder(value);
}

module.exports = {
  findDepartment,
  findProject,
  findSite,
  findEmployee,
  asNumber,
  asDate,
  rowError,
  codeOrName,
  createCache,
  remember,
  resolve,
};
