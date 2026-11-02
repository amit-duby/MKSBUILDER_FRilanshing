const path = require('path');
const ExcelJS = require('exceljs');

const sheets = {
  departments: {
    headers: ['name', 'description'],
    rows: [
      ['Civil', 'Site execution team'],
      ['Accounts', 'Office accounts'],
      ['Stores', 'Material store'],
    ],
  },
  projects: {
    headers: ['name', 'clientName', 'clientPhone', 'startDate', 'budgetAmount', 'status', 'address'],
    rows: [
      ['Riverfront', 'City Authority', '9876543210', '2026-04-01', 5000000, 'active', 'Ring Road'],
    ],
  },
  sites: {
    headers: ['projectCode', 'name', 'address', 'startDate', 'status', 'notes'],
    rows: [
      ['Riverfront', 'Tower A', 'Ring Road', '2026-04-01', 'active', 'Main tower'],
      ['Riverfront', 'Labour Camp', 'Site gate', '2026-04-01', 'active', ''],
    ],
  },
  employees: {
    headers: [
      'fullName', 'departmentCode', 'designation', 'employmentType', 'joiningDate',
      'payBasis', 'baseAmount', 'siteCode', 'phone', 'email', 'idType', 'idNumber',
    ],
    rows: [
      ['Ravi Kumar', 'Civil', 'Mason', 'permanent', '2026-04-01', 'monthly', 25000, 'Tower A', '9876543210', '', 'Aadhaar', '123412341234'],
      ['Sita Devi', 'Stores', 'Store keeper', 'permanent', '2026-04-02', 'monthly', 22000, 'Tower A', '9876543211', '', 'Aadhaar', '123412341235'],
    ],
  },
  inventory: {
    headers: ['name', 'category', 'unit', 'reorderLevel', 'sku', 'description'],
    rows: [
      ['Cement OPC 53', 'Material', 'bag', 50, '', ''],
      ['TMT Bar 12mm', 'Material', 'kg', 200, '', ''],
      ['Binding Wire', 'Material', 'kg', 20, '', ''],
    ],
  },
  vehicles: {
    headers: ['registrationNumber', 'type', 'fuelType', 'make', 'modelName', 'year', 'odometer', 'siteCode'],
    rows: [
      ['UP32 AB 2002', 'Tipper', 'diesel', 'Tata', 'Signa', 2022, 12000, 'Tower A'],
    ],
  },
  attendance: {
    headers: ['date', 'employeeCode', 'status', 'siteCode', 'checkIn', 'checkOut', 'overtimeHours', 'remarks'],
    rows: [
      ['2026-04-14', 'Ravi Kumar', 'present', 'Tower A', '09:00', '18:00', 0, ''],
      ['2026-04-14', 'Sita Devi', 'present', 'Tower A', '09:00', '17:30', 0, ''],
    ],
  },
  accounts: {
    headers: [
      'type', 'date', 'employeeCode', 'siteCode', 'amount', 'description',
      'paymentMode', 'category', 'given', 'cashGiven', 'returnAmount',
      'periodMonth', 'periodYear', 'baseAmount', 'amountPaid',
    ],
    rows: [
      ['expense', '2026-04-14', '', 'Tower A', 38000, 'Cement purchase', 'cash', 'material', '', '', '', '', '', '', ''],
      ['impress', '2026-04-14', 'Ravi Kumar', 'Tower A', '', 'Site petty cash', 'cash', '', 10000, '', '', '', '', '', ''],
      ['local_expense', '2026-04-15', 'Ravi Kumar', 'Tower A', '', 'Tea and transport', 'cash', '', '', 2000, 150, '', '', '', ''],
      ['salary', '2026-04-30', 'Ravi Kumar', '', '', 'April salary', '', '', '', '', '', 4, 2026, 25000, 25000],
    ],
  },
};

async function main() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MKS Construction ERP';

  const guide = workbook.addWorksheet('readme');
  [
    'Fill these sheets, then upload with POST /api/v1/imports (form-data field: file).',
    'Keep the first header row. Do not rename sheets.',
    'projectCode / departmentCode / siteCode / employeeCode can be a code (DEP-0001) or the name from this file.',
    'First import creates departments and projects. Next rows can use those names in the same file.',
    'accounts.type must be one of: expense, impress, local_expense, salary.',
    'employmentType: permanent, contract, daily_wage, staff',
    'attendance status: present, absent, half_day, leave, weekly_off, holiday',
    'inventory unit: nos, bag, kg, ton, cum, sqm, rmt, liter, box, bundle, set',
    'Manual forms still work. This file is only for bulk create.',
  ].forEach((line) => guide.addRow([line]));
  guide.getColumn(1).width = 110;

  for (const [name, spec] of Object.entries(sheets)) {
    const sheet = workbook.addWorksheet(name);
    sheet.addRow(spec.headers);
    spec.rows.forEach((row) => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true };
    spec.headers.forEach((_, index) => {
      sheet.getColumn(index + 1).width = Math.max(14, spec.headers[index].length + 2);
    });
  }

  const file = path.join(process.cwd(), 'mks-erp-import-template.xlsx');
  await workbook.xlsx.writeFile(file);
  console.log(file);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
