const ExcelJS = require('exceljs');
const AppError = require('../../common/errors/AppError');
const { EMPLOYMENT_TYPES, EMPLOYEE_STATUS, PAY_BASIS } = require('../../config/constants');
const Department = require('../departments/department.model');
const Site = require('../sites/site.model');
const Employee = require('./employee.model');
const employeeService = require('./employee.service');
const { createBody } = require('./employee.validation');

const MAX_ROWS = 500;

const TEMPLATE_COLUMNS = [
  { header: 'fullName', key: 'fullName', width: 24 },
  { header: 'phone', key: 'phone', width: 16 },
  { header: 'email', key: 'email', width: 28 },
  { header: 'address', key: 'address', width: 30 },
  { header: 'departmentCode', key: 'departmentCode', width: 16 },
  { header: 'designation', key: 'designation', width: 18 },
  { header: 'category', key: 'category', width: 14 },
  { header: 'employmentType', key: 'employmentType', width: 16 },
  { header: 'status', key: 'status', width: 12 },
  { header: 'joiningDate', key: 'joiningDate', width: 14 },
  { header: 'payBasis', key: 'payBasis', width: 12 },
  { header: 'baseAmount', key: 'baseAmount', width: 12 },
  { header: 'idType', key: 'idType', width: 12 },
  { header: 'idNumber', key: 'idNumber', width: 18 },
  { header: 'bankName', key: 'bankName', width: 18 },
  { header: 'accountNumber', key: 'accountNumber', width: 18 },
  { header: 'ifscCode', key: 'ifscCode', width: 14 },
  { header: 'notes', key: 'notes', width: 24 },
  { header: 'siteCode', key: 'siteCode', width: 14 },
];

const HEADER_ALIASES = {
  fullname: 'fullName',
  name: 'fullName',
  phone: 'phone',
  mobileno: 'phone',
  mobile: 'phone',
  email: 'email',
  address: 'address',
  departmentcode: 'departmentCode',
  departmentid: 'departmentId',
  department: 'departmentCode',
  designation: 'designation',
  category: 'category',
  employmenttype: 'employmentType',
  status: 'status',
  joiningdate: 'joiningDate',
  paybasis: 'payBasis',
  baseamount: 'baseAmount',
  salary: 'baseAmount',
  idtype: 'idType',
  idnumber: 'idNumber',
  bankname: 'bankName',
  accountnumber: 'accountNumber',
  ifsccode: 'ifscCode',
  notes: 'notes',
  sitecode: 'siteCode',
  siteid: 'siteId',
};

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .replace(/[\s_-]+/g, '')
    .toLowerCase();
}

function cellToString(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof value === 'object') {
    if (value.text != null) return String(value.text).trim();
    if (value.result != null) return String(value.result).trim();
    if (value.richText) {
      return value.richText.map((part) => part.text || '').join('').trim();
    }
  }
  return String(value).trim();
}

function emptyToUndefined(value) {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function parseRowDate(value) {
  if (value == null || value === '') return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = cellToString(value);
  if (!text) return undefined;
  // Excel serial date number
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial > 20000 && serial < 80000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      return new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
    }
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed;
}

async function buildTemplateBuffer() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MKS Construction ERP';
  const sheet = workbook.addWorksheet('Employees');
  sheet.columns = TEMPLATE_COLUMNS;
  sheet.getRow(1).font = { bold: true };

  sheet.addRow({
    fullName: 'Ravi Kumar',
    phone: '9876543210',
    email: 'ravi@example.com',
    address: 'Lucknow',
    departmentCode: 'DEP-0001',
    designation: 'Mason',
    category: 'Skilled',
    employmentType: 'daily_wage',
    status: 'active',
    joiningDate: '2026-04-01',
    payBasis: 'daily',
    baseAmount: 800,
    idType: 'Aadhaar',
    idNumber: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    notes: 'Sample row — delete before upload',
    siteCode: '',
  });

  const guide = workbook.addWorksheet('Guide');
  guide.columns = [
    { header: 'Field', key: 'field', width: 18 },
    { header: 'Required', key: 'required', width: 10 },
    { header: 'Notes', key: 'notes', width: 60 },
  ];
  guide.getRow(1).font = { bold: true };
  const guideRows = [
    ['fullName', 'Yes', 'Employee full name'],
    ['departmentCode', 'Yes*', 'Preferred. Example: DEP-0001. Or use departmentId'],
    ['departmentId', 'Yes*', 'Mongo ObjectId if code not used'],
    ['employmentType', 'Yes', EMPLOYMENT_TYPES.join(' | ')],
    ['joiningDate', 'Yes', 'YYYY-MM-DD'],
    ['baseAmount', 'Yes', 'Salary base amount'],
    ['payBasis', 'No', `${PAY_BASIS.join(' | ')} (default monthly)`],
    ['status', 'No', 'active | inactive (default active)'],
    ['siteCode', 'No', 'Optional active site code for assignment'],
  ];
  for (const [field, required, notes] of guideRows) {
    guide.addRow({ field, required, notes });
  }

  return workbook.xlsx.writeBuffer();
}

function mapHeaderRow(row) {
  const map = {};
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const alias = HEADER_ALIASES[normalizeHeader(cellToString(cell.value))];
    if (alias) map[colNumber] = alias;
  });
  return map;
}

function rowToObject(row, headerMap) {
  const raw = {};
  for (const [col, key] of Object.entries(headerMap)) {
    raw[key] = row.getCell(Number(col)).value;
  }
  return raw;
}

function normalizeBulkRow(raw) {
  const joiningDate = parseRowDate(raw.joiningDate);
  const baseAmountRaw = cellToString(raw.baseAmount);
  const baseAmount = baseAmountRaw === '' ? undefined : Number(baseAmountRaw);

  return {
    fullName: emptyToUndefined(cellToString(raw.fullName)),
    phone: emptyToUndefined(cellToString(raw.phone)),
    email: emptyToUndefined(cellToString(raw.email)),
    address: emptyToUndefined(cellToString(raw.address)),
    departmentCode: emptyToUndefined(cellToString(raw.departmentCode)),
    departmentId: emptyToUndefined(cellToString(raw.departmentId)),
    designation: emptyToUndefined(cellToString(raw.designation)),
    category: emptyToUndefined(cellToString(raw.category)),
    employmentType: emptyToUndefined(cellToString(raw.employmentType)),
    status: emptyToUndefined(cellToString(raw.status)),
    joiningDate,
    payBasis: emptyToUndefined(cellToString(raw.payBasis)),
    baseAmount: Number.isFinite(baseAmount) ? baseAmount : baseAmountRaw || undefined,
    idType: emptyToUndefined(cellToString(raw.idType)),
    idNumber: emptyToUndefined(cellToString(raw.idNumber)),
    bankName: emptyToUndefined(cellToString(raw.bankName)),
    accountNumber: emptyToUndefined(cellToString(raw.accountNumber)),
    ifscCode: emptyToUndefined(cellToString(raw.ifscCode)),
    notes: emptyToUndefined(cellToString(raw.notes)),
    siteCode: emptyToUndefined(cellToString(raw.siteCode)),
    siteId: emptyToUndefined(cellToString(raw.siteId)),
  };
}

function isBlankRow(row) {
  return Object.values(row).every((value) => value == null || value === '');
}

async function loadLookups() {
  const [departments, sites] = await Promise.all([
    Department.find({}).select('name code isActive').lean(),
    Site.find({}).select('name code status').lean(),
  ]);

  const departmentByCode = new Map();
  const departmentById = new Map();
  for (const dept of departments) {
    departmentById.set(String(dept._id), dept);
    if (dept.code) departmentByCode.set(String(dept.code).toUpperCase(), dept);
  }

  const siteByCode = new Map();
  const siteById = new Map();
  for (const site of sites) {
    siteById.set(String(site._id), site);
    if (site.code) siteByCode.set(String(site.code).toUpperCase(), site);
  }

  return { departmentByCode, departmentById, siteByCode, siteById };
}

function resolveDepartment(row, lookups) {
  if (row.departmentId) {
    const dept = lookups.departmentById.get(String(row.departmentId));
    if (!dept) throw new Error(`Department not found: ${row.departmentId}`);
    if (!dept.isActive) throw new Error(`Department is inactive: ${dept.code || row.departmentId}`);
    return dept;
  }
  if (row.departmentCode) {
    const dept = lookups.departmentByCode.get(String(row.departmentCode).toUpperCase());
    if (!dept) throw new Error(`Department not found: ${row.departmentCode}`);
    if (!dept.isActive) throw new Error(`Department is inactive: ${row.departmentCode}`);
    return dept;
  }
  throw new Error('departmentCode or departmentId is required');
}

function resolveSite(row, lookups) {
  if (!row.siteId && !row.siteCode) return null;
  if (row.siteId) {
    const site = lookups.siteById.get(String(row.siteId));
    if (!site) throw new Error(`Site not found: ${row.siteId}`);
    if (site.status !== 'active') throw new Error(`Site is not active: ${site.code || row.siteId}`);
    return site;
  }
  const site = lookups.siteByCode.get(String(row.siteCode).toUpperCase());
  if (!site) throw new Error(`Site not found: ${row.siteCode}`);
  if (site.status !== 'active') throw new Error(`Site is not active: ${row.siteCode}`);
  return site;
}

function toCreateBody(row, department, site) {
  return {
    fullName: row.fullName,
    phone: row.phone,
    email: row.email,
    address: row.address,
    departmentId: String(department._id),
    designation: row.designation,
    category: row.category,
    employmentType: row.employmentType,
    status: row.status || 'active',
    joiningDate: row.joiningDate,
    salary: {
      payBasis: row.payBasis || 'monthly',
      baseAmount: row.baseAmount,
    },
    idType: row.idType,
    idNumber: row.idNumber,
    bankName: row.bankName,
    accountNumber: row.accountNumber,
    ifscCode: row.ifscCode,
    notes: row.notes,
    siteId: site ? String(site._id) : undefined,
  };
}

async function parseWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets.find((item) => item.name.toLowerCase() !== 'guide')
    || workbook.worksheets[0];
  if (!sheet) throw new AppError('Excel file has no sheet', 400, 'BAD_REQUEST');

  const headerMap = mapHeaderRow(sheet.getRow(1));
  if (!Object.keys(headerMap).length) {
    throw new AppError('Excel header row is missing or invalid', 400, 'BAD_REQUEST');
  }
  if (!Object.values(headerMap).includes('fullName')) {
    throw new AppError('Excel must include a fullName column', 400, 'BAD_REQUEST');
  }

  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const raw = rowToObject(row, headerMap);
    const normalized = normalizeBulkRow(raw);
    if (isBlankRow(normalized)) return;
    rows.push({ rowNumber, data: normalized });
  });

  if (!rows.length) throw new AppError('Excel has no employee rows', 400, 'BAD_REQUEST');
  if (rows.length > MAX_ROWS) {
    throw new AppError(`Excel can have at most ${MAX_ROWS} employee rows`, 400, 'BAD_REQUEST');
  }
  return rows;
}

async function bulkUpload(file, query = {}) {
  if (!file || !file.buffer) {
    throw new AppError('Choose an Excel file in the file field', 400, 'BAD_REQUEST');
  }

  const dryRun = String(query.dryRun || '').toLowerCase() === 'true';
  const parsedRows = await parseWorkbook(file.buffer);
  const lookups = await loadLookups();

  const emailsInFile = new Set();
  const idNumbersInFile = new Set();
  const prepared = [];
  const errors = [];

  for (const item of parsedRows) {
    const { rowNumber, data } = item;
    try {
      const department = resolveDepartment(data, lookups);
      const site = resolveSite(data, lookups);
      const body = toCreateBody(data, department, site);
      const parsed = createBody.safeParse(body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const path = first?.path?.length ? `${first.path.join('.')}: ` : '';
        throw new Error(`${path}${first?.message || 'Invalid row'}`);
      }

      if (parsed.data.status === 'resigned') {
        throw new Error('Create the employee as active, then mark them resigned');
      }

      const emailKey = parsed.data.email ? parsed.data.email.toLowerCase() : null;
      if (emailKey) {
        if (emailsInFile.has(emailKey)) throw new Error(`Duplicate email in file: ${emailKey}`);
        emailsInFile.add(emailKey);
      }

      const idKey = parsed.data.idNumber ? String(parsed.data.idNumber).trim() : null;
      if (idKey) {
        if (idNumbersInFile.has(idKey)) throw new Error(`Duplicate idNumber in file: ${idKey}`);
        idNumbersInFile.add(idKey);
      }

      prepared.push({
        rowNumber,
        fullName: parsed.data.fullName,
        body: parsed.data,
      });
    } catch (error) {
      errors.push({
        row: rowNumber,
        fullName: data.fullName || null,
        message: error.message || 'Invalid row',
      });
    }
  }

  // DB duplicate checks for remaining valid rows
  const emails = prepared.map((row) => row.body.email).filter(Boolean);
  const idNumbers = prepared.map((row) => row.body.idNumber).filter(Boolean);
  const [existingEmails, existingIds] = await Promise.all([
    emails.length
      ? Employee.find({ email: { $in: emails } }).select('email').lean()
      : [],
    idNumbers.length
      ? Employee.find({ idNumber: { $in: idNumbers } }).select('idNumber').lean()
      : [],
  ]);
  const existingEmailSet = new Set(existingEmails.map((doc) => String(doc.email).toLowerCase()));
  const existingIdSet = new Set(existingIds.map((doc) => String(doc.idNumber)));

  const toCreate = [];
  for (const row of prepared) {
    if (row.body.email && existingEmailSet.has(row.body.email.toLowerCase())) {
      errors.push({
        row: row.rowNumber,
        fullName: row.fullName,
        message: `Email already exists: ${row.body.email}`,
      });
      continue;
    }
    if (row.body.idNumber && existingIdSet.has(String(row.body.idNumber))) {
      errors.push({
        row: row.rowNumber,
        fullName: row.fullName,
        message: `idNumber already exists: ${row.body.idNumber}`,
      });
      continue;
    }
    toCreate.push(row);
  }

  const created = [];
  if (!dryRun) {
    for (const row of toCreate) {
      try {
        const employee = await employeeService.create(row.body);
        created.push({
          row: row.rowNumber,
          id: employee.id,
          code: employee.code,
          fullName: employee.fullName,
        });
      } catch (error) {
        errors.push({
          row: row.rowNumber,
          fullName: row.fullName,
          message: error.message || 'Failed to create employee',
        });
      }
    }
  }

  errors.sort((a, b) => a.row - b.row);

  return {
    dryRun,
    totalRows: parsedRows.length,
    createdCount: dryRun ? 0 : created.length,
    failedCount: errors.length,
    validCount: toCreate.length,
    created: dryRun ? [] : created,
    errors,
  };
}

module.exports = {
  buildTemplateBuffer,
  bulkUpload,
  MAX_ROWS,
  TEMPLATE_COLUMNS,
  EMPLOYMENT_TYPES,
  EMPLOYEE_STATUS,
  PAY_BASIS,
};
