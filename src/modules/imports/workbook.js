const ExcelJS = require('exceljs');

const SHEET_ALIASES = {
  department: 'departments',
  departments: 'departments',
  project: 'projects',
  projects: 'projects',
  site: 'sites',
  sites: 'sites',
  employee: 'employees',
  employees: 'employees',
  inventory: 'inventory',
  item: 'inventory',
  items: 'inventory',
  stock: 'inventory',
  vehicle: 'vehicles',
  vehicles: 'vehicles',
  attendance: 'attendance',
  account: 'accounts',
  accounts: 'accounts',
  expense: 'accounts',
  expenses: 'accounts',
  salary: 'accounts',
  salaries: 'accounts',
  impress: 'accounts',
  localexpense: 'accounts',
  localexpenses: 'accounts',
};

const HEADER_ALIASES = {
  module: 'module',
  type: 'type',
  name: 'name',
  description: 'description',
  notes: 'notes',
  clientname: 'clientName',
  clientphone: 'clientPhone',
  status: 'status',
  startdate: 'startDate',
  expectedenddate: 'expectedEndDate',
  budgetamount: 'budgetAmount',
  clientamount: 'clientAmount',
  moneyspent: 'moneySpent',
  address: 'address',
  city: 'city',
  state: 'state',
  pincode: 'pincode',
  projectcode: 'projectCode',
  project: 'projectCode',
  departmentcode: 'departmentCode',
  department: 'departmentCode',
  dept: 'departmentCode',
  sitecode: 'siteCode',
  site: 'siteCode',
  employeecode: 'employeeCode',
  employee: 'employeeCode',
  fullname: 'fullName',
  employeename: 'fullName',
  phone: 'phone',
  email: 'email',
  designation: 'designation',
  employmenttype: 'employmentType',
  joiningdate: 'joiningDate',
  paybasis: 'payBasis',
  baseamount: 'baseAmount',
  monthlysalary: 'baseAmount',
  salary: 'baseAmount',
  idtype: 'idType',
  idnumber: 'idNumber',
  bankname: 'bankName',
  accountnumber: 'accountNumber',
  ifsccode: 'ifscCode',
  sku: 'sku',
  category: 'category',
  unit: 'unit',
  reorderlevel: 'reorderLevel',
  registrationnumber: 'registrationNumber',
  regno: 'registrationNumber',
  registration: 'registrationNumber',
  vehicletype: 'type',
  make: 'make',
  model: 'modelName',
  modelname: 'modelName',
  year: 'year',
  fueltype: 'fuelType',
  odometer: 'odometer',
  drivercode: 'driverCode',
  date: 'date',
  checkin: 'checkIn',
  checkout: 'checkOut',
  overtimehours: 'overtimeHours',
  remarks: 'remarks',
  amount: 'amount',
  expensedate: 'expenseDate',
  payeename: 'payeeName',
  paymentmode: 'paymentMode',
  paymentmodenote: 'paymentModeNote',
  given: 'given',
  cashgiven: 'cashGiven',
  expensedetails: 'expenseDetails',
  returnamount: 'returnAmount',
  periodmonth: 'periodMonth',
  periodyear: 'periodYear',
  amountpaid: 'amountPaid',
  reasonforadvance: 'reasonForAdvance',
  advanceamount: 'advanceAmount',
};

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function detectModule(name) {
  return SHEET_ALIASES[normalizeKey(name)] || null;
}

function cellText(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (value.text) return String(value.text).trim();
    if (value.result != null) return cellText(value.result);
    if (value.richText) return value.richText.map((part) => part.text).join('').trim();
  }
  return String(value).trim();
}

function mapHeader(header) {
  return HEADER_ALIASES[normalizeKey(header)] || null;
}

async function parseWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheets = [];

  workbook.eachSheet((sheet) => {
    const rows = [];
    const headers = [];
    sheet.eachRow((row, rowNumber) => {
      const values = row.values.slice(1).map(cellText);
      if (rowNumber === 1) {
        values.forEach((header, index) => {
          headers[index] = mapHeader(header) || normalizeKey(header);
        });
        return;
      }
      if (values.every((value) => value === '')) return;
      const record = {};
      headers.forEach((key, index) => {
        if (!key || key === 'module') {
          if (key === 'module') record.module = values[index];
          return;
        }
        if (values[index] !== '') record[key] = values[index];
      });
      if (Object.keys(record).length) {
        record.__row = rowNumber;
        rows.push(record);
      }
    });
    sheets.push({
      name: sheet.name,
      module: detectModule(sheet.name),
      rows,
    });
  });

  return sheets;
}

function groupRows(sheets) {
  const grouped = {
    departments: [],
    projects: [],
    sites: [],
    employees: [],
    inventory: [],
    vehicles: [],
    attendance: [],
    accounts: [],
  };

  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      const module = detectModule(row.module) || sheet.module;
      if (!module || !grouped[module]) continue;
      grouped[module].push({ ...row, __sheet: sheet.name });
    }
  }

  return grouped;
}

module.exports = { parseWorkbook, groupRows, detectModule, HEADER_ALIASES };
