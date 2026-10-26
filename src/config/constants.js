const CURRENCY = 'INR';

const PROJECT_STATUS = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
const SITE_STATUS = ['active', 'inactive', 'completed'];
const EMPLOYMENT_TYPES = ['permanent', 'contract', 'daily_wage'];
const EMPLOYEE_STATUS = ['active', 'inactive', 'resigned'];
const PAY_BASIS = ['monthly', 'daily'];
const ATTENDANCE_STATUS = ['present', 'absent', 'half_day', 'leave', 'weekly_off', 'holiday'];
const SALARY_RECORD_STATUS = ['draft', 'recorded'];

const STOCK_LOCATION_TYPES = ['central_store', 'site_store'];
const MOVEMENT_TYPES = ['receipt', 'issue', 'transfer', 'adjustment', 'return'];
const ADJUSTMENT_DIRECTIONS = ['increase', 'decrease'];
const UNITS = ['nos', 'bag', 'kg', 'ton', 'cum', 'sqm', 'rmt', 'liter', 'box', 'bundle', 'set'];

const VEHICLE_STATUS = ['available', 'assigned', 'maintenance', 'inactive'];
const FUEL_TYPES = ['diesel', 'petrol', 'cng', 'electric', 'other'];
const MAINTENANCE_TYPES = ['service', 'repair', 'tyre', 'insurance', 'other'];

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

const COLLECTIONS = {
  users: 'users',
  departments: 'departments',
  projects: 'projects',
  sites: 'sites',
  employees: 'employees',
  employeeAssignments: 'employee_assignments',
  inventoryItems: 'inventory_items',
  stockLocations: 'stock_locations',
  stockBalances: 'stock_balances',
  stockMovements: 'stock_movements',
  vehicles: 'vehicles',
  vehicleAssignments: 'vehicle_assignments',
  vehicleMaintenance: 'vehicle_maintenance_logs',
  vehicleFuel: 'vehicle_fuel_logs',
  salaryRecords: 'salary_records',
  expenses: 'expenses',
  attendance: 'attendance_records',
  counters: 'counters',
};

const DOCUMENT_EXPIRY_FIELDS = [
  'insuranceExpiry',
  'fitnessExpiry',
  'permitExpiry',
  'pollutionExpiry',
];

module.exports = {
  CURRENCY,
  PROJECT_STATUS,
  SITE_STATUS,
  EMPLOYMENT_TYPES,
  EMPLOYEE_STATUS,
  PAY_BASIS,
  ATTENDANCE_STATUS,
  SALARY_RECORD_STATUS,
  STOCK_LOCATION_TYPES,
  MOVEMENT_TYPES,
  ADJUSTMENT_DIRECTIONS,
  UNITS,
  VEHICLE_STATUS,
  FUEL_TYPES,
  MAINTENANCE_TYPES,
  EXPENSE_CATEGORIES,
  EMPLOYEE_EXPENSE_CATEGORIES,
  PAYMENT_MODE_NOTES,
  COLLECTIONS,
  DOCUMENT_EXPIRY_FIELDS,
};
