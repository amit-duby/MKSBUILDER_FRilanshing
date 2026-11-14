const CURRENCY = 'INR';

const PROJECT_STATUS = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
const SITE_STATUS = ['active', 'inactive', 'completed', 'On_hold'];
const EMPLOYMENT_TYPES = ['permanent', 'contract', 'daily_wage', 'staff'];
const EMPLOYEE_STATUS = ['active', 'inactive', 'resigned'];
const PAY_BASIS = ['monthly', 'daily'];
const ATTENDANCE_STATUS = ['present', 'absent', 'half_day', 'leave', 'weekly_off', 'holiday'];
const STOCK_LOCATION_TYPES = ['central_store', 'site_store'];
const MOVEMENT_TYPES = ['receipt', 'issue', 'transfer', 'adjustment', 'return'];
const MATERIAL_CONDITIONS = ['new', 'old', 'scrap'];
const ADJUSTMENT_DIRECTIONS = ['increase', 'decrease'];
const UNITS = ['nos', 'bag', 'kg', 'ton', 'cum', 'sqm', 'rmt', 'liter', 'box', 'bundle', 'set'];

const VEHICLE_STATUS = ['available', 'assigned', 'inactive'];
const FUEL_TYPES = ['diesel', 'petrol', 'cng', 'electric', 'other'];
const MAINTENANCE_TYPES = ['service', 'repair', 'tyre', 'insurance', 'other'];
const MAINTENANCE_CATEGORY_STATUS = ['active', 'inactive'];
const VEHICLE_TYPE_STATUS = ['active', 'inactive'];

const EXPENSE_CATEGORIES = [
  'employee_advance',
  'employee_extra',
  'employee_reimbursement',
  'material',
  'vehicle',
  'site',
  'contractor',
  'miscellaneous',
];

const EMPLOYEE_EXPENSE_CATEGORIES = [
  'employee_advance',
  'employee_extra',
  'employee_reimbursement',
];

const PAYMENT_MODE_NOTES = ['cash', 'bank_transfer', 'upi', 'cheque', 'other'];

const DOCUMENT_EXPIRY_FIELDS = [
  'insuranceExpiry',
  'fitnessExpiry',
  'permitExpiry',
  'pollutionExpiry',
];

const COLLECTIONS = {
  users: 'users',
  departments: 'departments',
  projects: 'projects',
  sites: 'sites',
  employees: 'employees',
  employeeAssignments: 'employee_assignments',
  inventoryItems: 'inventory_items',
  stockBalances: 'stock_balances',
  stockMovements: 'stock_movements',
  vehicles: 'vehicles',
  vehicleTypes: 'vehicle_types',
  vehicleAssignments: 'vehicle_assignments',
  vehicleMaintenance: 'vehicle_maintenance_logs',
  vehicleMaintenanceCategories: 'vehicle_maintenance_categories',
  expenses: 'expenses',
  employeeAdvances: 'employee_advances',
  payrollPayments: 'payroll_payments',
  impressAmounts: 'impress_amounts',
  localAmounts: 'local_amounts',
  projectDetails: 'project_details',
  gallary: 'gallary',
  contactUs: 'contact_us',
  contactDetails: 'contact_details',
  companies: 'companies',
  attendance: 'attendance_records',
  counters: 'counters',
};

module.exports = {
  CURRENCY,
  PROJECT_STATUS,
  SITE_STATUS,
  EMPLOYMENT_TYPES,
  EMPLOYEE_STATUS,
  PAY_BASIS,
  ATTENDANCE_STATUS,
  STOCK_LOCATION_TYPES,
  MOVEMENT_TYPES,
  MATERIAL_CONDITIONS,
  ADJUSTMENT_DIRECTIONS,
  UNITS,
  VEHICLE_STATUS,
  FUEL_TYPES,
  MAINTENANCE_TYPES,
  MAINTENANCE_CATEGORY_STATUS,
  VEHICLE_TYPE_STATUS,
  EXPENSE_CATEGORIES,
  EMPLOYEE_EXPENSE_CATEGORIES,
  PAYMENT_MODE_NOTES,
  COLLECTIONS,
  DOCUMENT_EXPIRY_FIELDS,
};
