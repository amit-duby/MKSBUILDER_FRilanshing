const ExcelJS = require('exceljs');
const departmentService = require('../departments/department.service');
const projectService = require('../projects/project.service');
const siteService = require('../sites/site.service');
const employeeService = require('../employees/employee.service');
const inventoryService = require('../inventory/inventory.service');
const vehicleService = require('../vehicles/vehicle.service');
const attendanceService = require('../attendance/attendance.service');
const expenseService = require('../accounts/expense.service');
const salaryService = require('../accounts/salary.service');
const impressService = require('../accounts/impress.service');
const localExpenseService = require('../accounts/localExpense.service');
const Department = require('../departments/department.model');
const Project = require('../projects/project.model');
const Site = require('../sites/site.model');
const Employee = require('../employees/employee.model');
const Item = require('../inventory/item.model');
const Vehicle = require('../vehicles/vehicle.model');
const Attendance = require('../attendance/attendance.model');
const { parseWorkbook, groupRows } = require('./workbook');
const {
  findDepartment,
  findProject,
  findSite,
  findEmployee,
  asNumber,
  asDate,
  rowError,
  createCache,
  remember,
  resolve,
} = require('./lookups');
const { startOfBusinessDay } = require('../../common/utils/helpers');

const ORDER = [
  'departments',
  'projects',
  'sites',
  'employees',
  'inventory',
  'vehicles',
  'attendance',
  'accounts',
];

const TEMPLATE_SHEETS = {
  departments: {
    headers: ['name', 'description'],
    sample: [{ name: 'Civil', description: 'Site execution' }],
  },
  projects: {
    headers: ['name', 'clientName', 'clientPhone', 'startDate', 'budgetAmount', 'status', 'address'],
    sample: [{
      name: 'Riverfront',
      clientName: 'City Authority',
      clientPhone: '9876543210',
      startDate: '2026-04-01',
      budgetAmount: 5000000,
      status: 'active',
      address: 'Ring Road',
    }],
  },
  sites: {
    headers: ['projectCode', 'name', 'address', 'startDate', 'status', 'notes'],
    sample: [{
      projectCode: 'Riverfront',
      name: 'Tower A',
      address: 'Ring Road',
      startDate: '2026-04-01',
      status: 'active',
      notes: '',
    }],
  },
  employees: {
    headers: [
      'fullName', 'departmentCode', 'designation', 'employmentType', 'joiningDate',
      'payBasis', 'baseAmount', 'siteCode', 'phone', 'email', 'idType', 'idNumber',
    ],
    sample: [{
      fullName: 'Ravi Kumar',
      departmentCode: 'Civil',
      designation: 'Mason',
      employmentType: 'permanent',
      joiningDate: '2026-04-01',
      payBasis: 'monthly',
      baseAmount: 25000,
      siteCode: 'Tower A',
      phone: '9876543210',
      email: '',
      idType: 'Aadhaar',
      idNumber: '123412341234',
    }],
  },
  inventory: {
    headers: ['name', 'category', 'unit', 'reorderLevel', 'sku', 'description'],
    sample: [{
      name: 'Cement OPC 53',
      category: 'Material',
      unit: 'bag',
      reorderLevel: 50,
      sku: '',
      description: '',
    }],
  },
  vehicles: {
    headers: ['registrationNumber', 'type', 'fuelType', 'make', 'modelName', 'year', 'odometer', 'siteCode'],
    sample: [{
      registrationNumber: 'UP32 AB 2002',
      type: 'Tipper',
      fuelType: 'diesel',
      make: '',
      modelName: '',
      year: 2022,
      odometer: 12000,
      siteCode: '',
    }],
  },
  attendance: {
    headers: ['date', 'employeeCode', 'status', 'siteCode', 'checkIn', 'checkOut', 'overtimeHours', 'remarks'],
    sample: [{
      date: '2026-04-14',
      employeeCode: 'Ravi Kumar',
      status: 'present',
      siteCode: 'Tower A',
      checkIn: '09:00',
      checkOut: '18:00',
      overtimeHours: 0,
      remarks: '',
    }],
  },
  accounts: {
    headers: [
      'type', 'date', 'employeeCode', 'siteCode', 'amount', 'description',
      'paymentMode', 'category', 'given', 'cashGiven', 'returnAmount',
      'periodMonth', 'periodYear', 'baseAmount', 'amountPaid',
    ],
    sample: [{
      type: 'expense',
      date: '2026-04-14',
      employeeCode: '',
      siteCode: 'Tower A',
      amount: 38000,
      description: 'Cement purchase',
      paymentMode: 'cash',
      category: 'material',
      given: '',
      cashGiven: '',
      returnAmount: '',
      periodMonth: '',
      periodYear: '',
      baseAmount: '',
      amountPaid: '',
    }],
  },
};

function emptySheet() {
  return { created: 0, skipped: 0, failed: 0, rows: [] };
}

function resultRow(row, status, message, id) {
  return {
    row: row.__row,
    sheet: row.__sheet,
    status,
    message: message || '',
    id: id || null,
  };
}

async function importDepartment(row, commit, _user, cache) {
  const name = String(row.name || '').trim();
  if (!name) throw new Error('name is required');
  const existing = await findDepartment(name);
  if (existing) {
    remember(cache, 'department', existing, name);
    return { status: 'skipped', message: `Department already exists (${existing.code})`, id: existing.id };
  }
  if (!commit) {
    remember(cache, 'department', { name, code: name }, name);
    return { status: 'ready' };
  }
  const created = await departmentService.create({ name, description: row.description || '' });
  remember(cache, 'department', created, name);
  return { status: 'created', id: created.id };
}

async function importProject(row, commit, _user, cache) {
  const name = String(row.name || '').trim();
  if (!name) throw new Error('name is required');
  if (!row.clientName) throw new Error('clientName is required');
  const startDate = asDate(row.startDate);
  if (!startDate) throw new Error('startDate is required');
  const existing = await findProject(name);
  if (existing) {
    remember(cache, 'project', existing, name);
    return { status: 'skipped', message: `Project already exists (${existing.code})`, id: existing.id };
  }
  if (!commit) {
    remember(cache, 'project', { name, code: name }, name);
    return { status: 'ready' };
  }
  const created = await projectService.create({
    name,
    clientName: row.clientName,
    clientPhone: row.clientPhone,
    startDate,
    expectedEndDate: asDate(row.expectedEndDate),
    budgetAmount: asNumber(row.budgetAmount),
    clientAmount: asNumber(row.clientAmount),
    moneySpent: asNumber(row.moneySpent),
    status: row.status || 'planning',
    address: row.address,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    description: row.description,
  });
  remember(cache, 'project', created, name);
  return { status: 'created', id: created.id };
}

async function importSite(row, commit, _user, cache) {
  const name = String(row.name || '').trim();
  if (!name) throw new Error('name is required');
  const project = await resolve('project', row.projectCode, cache, findProject);
  if (!project) throw new Error(`Project not found: ${row.projectCode || ''}`);
  const startDate = asDate(row.startDate);
  if (!startDate) throw new Error('startDate is required');
  const existing = await Site.findOne({ project: project._id, name: new RegExp(`^${name}$`, 'i'), isDeleted: false });
  if (existing) {
    remember(cache, 'site', existing, name);
    return { status: 'skipped', message: `Site already exists (${existing.code})`, id: existing.id };
  }
  if (!commit) {
    remember(cache, 'site', { name, code: name }, name);
    return { status: 'ready' };
  }
  const created = await siteService.create({
    projectId: project.id,
    name,
    address: row.address,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    status: row.status || 'active',
    startDate,
    expectedEndDate: asDate(row.expectedEndDate),
    notes: row.notes,
  });
  remember(cache, 'site', created, name);
  return { status: 'created', id: created.id };
}

async function importEmployee(row, commit, _user, cache) {
  const fullName = String(row.fullName || '').trim();
  if (!fullName) throw new Error('fullName is required');
  const department = await resolve('department', row.departmentCode, cache, findDepartment);
  if (!department) throw new Error(`Department not found: ${row.departmentCode || ''}`);
  const joiningDate = asDate(row.joiningDate);
  if (!joiningDate) throw new Error('joiningDate is required');
  const baseAmount = asNumber(row.baseAmount);
  if (!(baseAmount >= 0)) throw new Error('baseAmount is required');
  if (row.idNumber) {
    const existing = await Employee.findOne({ idNumber: String(row.idNumber).trim(), isDeleted: false });
    if (existing) {
      remember(cache, 'employee', existing, fullName);
      return { status: 'skipped', message: `Employee already exists (${existing.code})`, id: existing.id };
    }
  }
  let siteId;
  if (row.siteCode) {
    const site = await resolve('site', row.siteCode, cache, findSite);
    if (!site) throw new Error(`Site not found: ${row.siteCode}`);
    siteId = site.id;
  }
  if (!commit) return { status: 'ready' };
  const created = await employeeService.create({
    fullName,
    departmentId: department.id,
    designation: row.designation || 'Staff',
    employmentType: row.employmentType || 'permanent',
    joiningDate,
    phone: row.phone,
    email: row.email,
    address: row.address,
    siteId,
    idType: row.idType || undefined,
    idNumber: row.idNumber || undefined,
    bankName: row.bankName || undefined,
    accountNumber: row.accountNumber || undefined,
    ifscCode: row.ifscCode || undefined,
    notes: row.notes,
    salary: {
      payBasis: row.payBasis || 'monthly',
      baseAmount,
    },
  });
  remember(cache, 'employee', created, fullName);
  return { status: 'created', id: created.id };
}

async function importItem(row, commit) {
  const name = String(row.name || '').trim();
  if (!name) throw new Error('name is required');
  if (!row.category) throw new Error('category is required');
  if (!row.unit) throw new Error('unit is required');
  const existing = await Item.findOne({ name: new RegExp(`^${name}$`, 'i'), isDeleted: false });
  if (existing) return { status: 'skipped', message: `Item already exists (${existing.code})`, id: existing.id };
  if (!commit) return { status: 'ready' };
  const created = await inventoryService.items.create({
    name,
    category: row.category,
    unit: String(row.unit).toLowerCase(),
    reorderLevel: asNumber(row.reorderLevel) || 0,
    sku: row.sku || undefined,
    description: row.description,
  });
  return { status: 'created', id: created.id };
}

async function importVehicle(row, commit, _user, cache) {
  const registrationNumber = String(row.registrationNumber || '').trim();
  if (!registrationNumber) throw new Error('registrationNumber is required');
  if (!row.type) throw new Error('type is required');
  const existing = await Vehicle.findOne({
    registrationNumber: new RegExp(`^${registrationNumber}$`, 'i'),
    isDeleted: false,
  });
  if (existing) return { status: 'skipped', message: `Vehicle already exists (${existing.code})`, id: existing.id };
  let siteId;
  if (row.siteCode) {
    const site = await resolve('site', row.siteCode, cache, findSite);
    if (!site) throw new Error(`Site not found: ${row.siteCode}`);
    siteId = site.id;
  }
  if (!commit) return { status: 'ready' };
  const created = await vehicleService.create({
    registrationNumber,
    type: row.type,
    make: row.make,
    modelName: row.modelName,
    year: asNumber(row.year),
    fuelType: row.fuelType || 'diesel',
    odometer: asNumber(row.odometer),
    notes: row.notes,
    siteId,
  });
  return { status: 'created', id: created.id };
}

async function importAttendance(row, commit, user, cache) {
  const employee = await resolve('employee', row.employeeCode, cache, findEmployee);
  if (!employee) throw new Error(`Employee not found: ${row.employeeCode || ''}`);
  const date = asDate(row.date);
  if (!date) throw new Error('date is required');
  if (!row.status) throw new Error('status is required');
  const attendanceDate = startOfBusinessDay(date);
  const existing = await Attendance.findOne({ employee: employee._id, attendanceDate });
  if (existing) return { status: 'skipped', message: 'Attendance already marked', id: existing.id };
  let siteId;
  if (row.siteCode) {
    const site = await resolve('site', row.siteCode, cache, findSite);
    if (!site) throw new Error(`Site not found: ${row.siteCode}`);
    siteId = site.id;
  }
  if (!commit) return { status: 'ready' };
  const created = await attendanceService.mark({
    employeeId: employee.id,
    date,
    status: String(row.status).toLowerCase(),
    siteId,
    checkIn: row.checkIn || undefined,
    checkOut: row.checkOut || undefined,
    overtimeHours: asNumber(row.overtimeHours),
    remarks: row.remarks,
  }, user);
  return { status: 'created', id: created.id };
}

async function importAccount(row, commit, user, cache) {
  const type = String(row.type || 'expense').trim().toLowerCase();
  if (type === 'expense') {
    if (!(asNumber(row.amount) > 0)) throw new Error('amount is required');
    if (!row.description) throw new Error('description is required');
    const employee = row.employeeCode ? await resolve('employee', row.employeeCode, cache, findEmployee) : null;
    if (row.employeeCode && !employee) throw new Error(`Employee not found: ${row.employeeCode}`);
    const site = row.siteCode ? await resolve('site', row.siteCode, cache, findSite) : null;
    if (row.siteCode && !site) throw new Error(`Site not found: ${row.siteCode}`);
    if (!commit) return { status: 'ready' };
    const created = await expenseService.create({
      category: row.category || 'miscellaneous',
      amount: asNumber(row.amount),
      expenseDate: asDate(row.date),
      description: row.description,
      payeeName: row.payeeName,
      employeeId: employee && employee.id,
      siteId: site && site.id,
      paymentModeNote: row.paymentMode || row.paymentModeNote || 'cash',
    }, user);
    return { status: 'created', id: created.id };
  }

  if (type === 'impress') {
    const employee = await resolve('employee', row.employeeCode, cache, findEmployee);
    const site = await resolve('site', row.siteCode, cache, findSite);
    if (!employee) throw new Error(`Employee not found: ${row.employeeCode || ''}`);
    if (!site) throw new Error(`Site not found: ${row.siteCode || ''}`);
    if (!(asNumber(row.given) > 0)) throw new Error('given is required');
    if (!commit) return { status: 'ready' };
    const created = await impressService.create({
      date: asDate(row.date),
      employeeId: employee.id,
      siteId: site.id,
      description: row.description || 'Impress',
      given: asNumber(row.given),
      notes: row.notes,
    }, user);
    return { status: 'created', id: created.id };
  }

  if (type === 'local_expense' || type === 'localexpense') {
    const employee = await resolve('employee', row.employeeCode, cache, findEmployee);
    if (!employee) throw new Error(`Employee not found: ${row.employeeCode || ''}`);
    if (!(asNumber(row.cashGiven) > 0)) throw new Error('cashGiven is required');
    if (!row.expenseDetails && !row.description) throw new Error('expenseDetails is required');
    if (!commit) return { status: 'ready' };
    const site = row.siteCode ? await resolve('site', row.siteCode, cache, findSite) : null;
    const created = await localExpenseService.create({
      date: asDate(row.date),
      employeeId: employee.id,
      siteId: site && site.id,
      cashGiven: asNumber(row.cashGiven),
      expenseDetails: row.expenseDetails || row.description,
      returnAmount: asNumber(row.returnAmount) || 0,
      paymentMode: row.paymentMode || 'cash',
    }, user);
    return { status: 'created', id: created.id };
  }

  if (type === 'salary') {
    const employee = await resolve('employee', row.employeeCode, cache, findEmployee);
    if (!employee) throw new Error(`Employee not found: ${row.employeeCode || ''}`);
    const periodMonth = asNumber(row.periodMonth);
    const periodYear = asNumber(row.periodYear);
    if (!periodMonth || !periodYear) throw new Error('periodMonth and periodYear are required');
    if (!commit) return { status: 'ready' };
    const created = await salaryService.create({
      employeeId: employee.id,
      periodMonth,
      periodYear,
      baseAmount: asNumber(row.baseAmount),
      amountPaid: asNumber(row.amountPaid),
    }, user);
    return { status: 'created', id: created.id };
  }

  throw new Error(`Unknown accounts type: ${type}. Use expense, impress, local_expense, or salary`);
}

const IMPORTERS = {
  departments: importDepartment,
  projects: importProject,
  sites: importSite,
  employees: importEmployee,
  inventory: importItem,
  vehicles: importVehicle,
  attendance: importAttendance,
  accounts: importAccount,
};

async function runWorkbook(buffer, { commit, user }) {
  const grouped = groupRows(await parseWorkbook(buffer));
  const cache = createCache();
  const sheets = {};
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const module of ORDER) {
    sheets[module] = emptySheet();
    for (const row of grouped[module]) {
      try {
        const outcome = await IMPORTERS[module](row, commit, user, cache);
        const status = outcome.status === 'created' && !commit ? 'ready' : outcome.status;
        sheets[module].rows.push(resultRow(row, status, outcome.message, outcome.id));
        if (status === 'created') {
          sheets[module].created += 1;
          created += 1;
        } else if (status === 'skipped') {
          sheets[module].skipped += 1;
          skipped += 1;
        } else {
          sheets[module].ready = (sheets[module].ready || 0) + 1;
        }
      } catch (error) {
        sheets[module].failed += 1;
        failed += 1;
        sheets[module].rows.push(resultRow(row, 'failed', rowError(error)));
      }
    }
  }

  return {
    commit: Boolean(commit),
    totals: { created, skipped, failed, ready: commit ? 0 : Object.values(sheets).reduce((sum, sheet) => sum + (sheet.ready || 0), 0) },
    sheets,
  };
}

async function preview(buffer, user) {
  return runWorkbook(buffer, { commit: false, user });
}

async function importAll(buffer, user) {
  return runWorkbook(buffer, { commit: true, user });
}

async function templateBuffer() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MKS Construction ERP';
  const guide = workbook.addWorksheet('readme');
  guide.addRow(['Use one sheet per module. Later sheets can use names from earlier sheets (Civil, Riverfront, Tower A). Existing codes also work.']);
  guide.addRow(['Import order is departments, projects, sites, employees, inventory, vehicles, attendance, accounts.']);
  guide.addRow(['Manual forms still work. This file is only for bulk create.']);
  guide.addRow(['accounts.type can be expense, impress, local_expense, or salary.']);

  for (const [name, spec] of Object.entries(TEMPLATE_SHEETS)) {
    const sheet = workbook.addWorksheet(name);
    sheet.addRow(spec.headers);
    spec.sample.forEach((row) => {
      sheet.addRow(spec.headers.map((header) => (row[header] == null ? '' : row[header])));
    });
    sheet.getRow(1).font = { bold: true };
  }

  return workbook.xlsx.writeBuffer();
}

module.exports = { preview, importAll, templateBuffer };
