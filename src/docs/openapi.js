const objectId = {
  type: 'string',
  pattern: '^[a-fA-F\\d]{24}$',
  example: '64b0c0c0c0c0c0c0c0c0c0c0',
};

const bearer = [{ bearerAuth: [] }];

function pathParam(name = 'id') {
  return { name, in: 'path', required: true, schema: objectId };
}

function query(name, schema, description) {
  return { name, in: 'query', required: false, schema, description };
}

function jsonBody(example) {
  return {
    required: true,
    content: {
      'application/json': {
        schema: { type: 'object' },
        example,
      },
    },
  };
}

function operation(tag, summary, options = {}) {
  const responses = {
    [options.status || '200']: { description: 'Envelope: success, message, data' },
  };
  if (options.auth !== false) responses['401'] = { description: 'Authentication required' };
  return {
    tags: [tag],
    summary,
    security: options.auth === false ? [] : bearer,
    parameters: options.parameters || [],
    ...(options.body ? { requestBody: options.body } : {}),
    responses,
  };
}

const paging = [
  query('page', { type: 'integer', default: 1 }),
  query('limit', { type: 'integer', default: 20 }),
  query('search', { type: 'string' }),
  query('sort', { type: 'string' }),
  query('includeArchived', { type: 'boolean' }),
];

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'MKS Construction ERP API',
    version: '1.0.0',
    description: 'Projects, people, stock, vehicles, attendance, and salary/expense records. Amounts are INR. Accounts record ledgers and do not transfer money.',
  },
  servers: [{ url: '/api/v1' }],
  tags: [
    { name: 'Health' },
    { name: 'Auth' },
    { name: 'Dashboard' },
    { name: 'Departments' },
    { name: 'Projects' },
    { name: 'Sites' },
    { name: 'Employees' },
    { name: 'Attendance' },
    { name: 'Inventory' },
    { name: 'Vehicles' },
    { name: 'Accounts' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  paths: {
    '/health': {
      get: operation('Health', 'Service and database health', { auth: false }),
    },
    '/auth/register': {
      post: operation('Auth', 'Register an admin', {
        auth: false,
        status: '201',
        body: jsonBody({ name: 'Owner', email: 'owner@mksbuilder.local', password: 'ChangeMe123!' }),
      }),
    },
    '/auth/login': {
      post: operation('Auth', 'Log in', {
        auth: false,
        body: jsonBody({ email: 'owner@mksbuilder.local', password: 'ChangeMe123!' }),
      }),
    },
    '/auth/forgot-password': {
      post: operation('Auth', 'Email a reset link', {
        auth: false,
        body: jsonBody({ email: 'owner@mksbuilder.local' }),
      }),
    },
    '/auth/reset-password/{token}': {
      post: operation('Auth', 'Reset password with the email token', {
        auth: false,
        parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string', minLength: 32 } }],
        body: jsonBody({ password: 'NewPass123!', confirmPassword: 'NewPass123!' }),
      }),
    },
    '/auth/me': {
      get: operation('Auth', 'Current profile'),
    },
    '/auth/avatar': {
      post: operation('Auth', 'Upload a profile photo', {
        body: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['avatar'],
                properties: { avatar: { type: 'string', format: 'binary', description: 'JPEG, PNG, or WebP up to 2 MB' } },
              },
            },
          },
        },
      }),
    },
    '/auth/logout': {
      post: operation('Auth', 'Log out and invalidate the current token'),
    },
    '/auth/change-password': {
      post: operation('Auth', 'Change the current password', {
        body: jsonBody({
          currentPassword: 'ChangeMe123!',
          newPassword: 'NewPass123!',
          confirmPassword: 'NewPass123!',
        }),
      }),
    },
    '/dashboard': {
      get: operation('Dashboard', 'Owner overview'),
    },
    '/departments': {
      get: operation('Departments', 'List departments', { parameters: paging }),
    },
    '/departments/create': {
      post: operation('Departments', 'Create a department', {
        status: '201',
        body: jsonBody({ name: 'Civil', description: 'Site civil works', isActive: true }),
      }),
    },
    '/departments/get-by-id/{id}': {
      get: operation('Departments', 'Get a department', { parameters: [pathParam()] }),
    },
    '/departments/update/{id}': {
      patch: operation('Departments', 'Update a department', {
        parameters: [pathParam()],
        body: jsonBody({ name: 'Civil', isActive: true }),
      }),
    },
    '/departments/remove/{id}': {
      delete: operation('Departments', 'Archive a department', { parameters: [pathParam()] }),
    },
    '/departments/{id}/restore': {
      post: operation('Departments', 'Restore a department', { parameters: [pathParam()] }),
    },
    '/projects': {
      get: operation('Projects', 'List projects', {
        parameters: [...paging, query('status', { type: 'string', enum: ['planning', 'active', 'on_hold', 'completed', 'cancelled'] })],
      }),
    },
    '/projects/create': {
      post: operation('Projects', 'Create a project', {
        status: '201',
        body: jsonBody({
          name: 'Riverfront',
          clientName: 'City Authority',
          clientPhone: '9876543210',
          startDate: '2026-04-01',
          budgetAmount: 5000000,
          clientAmount: 1500000,
          moneySpent: 0,
          status: 'active',
        }),
      }),
    },
    '/projects/{id}/summary': {
      get: operation('Projects', 'Project cost summary', { parameters: [pathParam()] }),
    },
    '/projects/{id}': {
      get: operation('Projects', 'Get a project', { parameters: [pathParam()] }),
    },
    '/projects/update/{id}': {
      patch: operation('Projects', 'Update a project', {
        parameters: [pathParam()],
        body: jsonBody({ moneySpent: 850000, clientAmount: 2000000 }),
      }),
    },
    '/projects/delete/{id}': {
      delete: operation('Projects', 'Archive a project', { parameters: [pathParam()] }),
    },
    '/projects/{id}/restore': {
      post: operation('Projects', 'Restore a project', { parameters: [pathParam()] }),
    },
    '/sites': {
      get: operation('Sites', 'List sites', { parameters: [...paging, query('projectId', objectId)] }),
    },
    '/sites/create': {
      post: operation('Sites', 'Create a site', {
        status: '201',
        body: jsonBody({
          projectId: '64b0c0c0c0c0c0c0c0c0c0c0',
          name: 'Tower A',
          address: 'Ring Road',
          startDate: '2026-04-01',
          status: 'active',
        }),
      }),
    },
    '/sites/{id}': {
      get: operation('Sites', 'Get a site', { parameters: [pathParam()] }),
    },
    '/sites/update/{id}': {
      patch: operation('Sites', 'Update a site', {
        parameters: [pathParam()],
        body: jsonBody({ name: 'Tower A', status: 'active' }),
      }),
    },
    '/sites/delete/{id}': {
      delete: operation('Sites', 'Archive a site', { parameters: [pathParam()] }),
    },
    '/sites/{id}/restore': {
      post: operation('Sites', 'Restore a site', { parameters: [pathParam()] }),
    },
    '/employees': {
      get: operation('Employees', 'List employees', {
        parameters: [...paging, query('departmentId', objectId), query('siteId', objectId), query('status', { type: 'string' })],
      }),
    },
    '/employees/create': {
      post: operation('Employees', 'Create an employee', {
        status: '201',
        body: jsonBody({
          fullName: 'Ravi Kumar',
          departmentId: '64b0c0c0c0c0c0c0c0c0c0c0',
          designation: 'Mason',
          employmentType: 'permanent',
          joiningDate: '2026-04-01',
          salary: { payBasis: 'monthly', baseAmount: 25000 },
          siteId: '64b0c0c0c0c0c0c0c0c0c0c0',
          idType: 'Aadhaar',
          idNumber: '123412341234',
          bankName: 'State Bank of India',
          accountNumber: '123456789012',
          ifscCode: 'SBIN0001234',
        }),
      }),
    },
    '/employees/{id}': {
      get: operation('Employees', 'Get an employee', { parameters: [pathParam()] }),
      delete: operation('Employees', 'Archive an employee', { parameters: [pathParam()] }),
    },
    '/employees/update/{id}': {
      patch: operation('Employees', 'Update an employee', {
        parameters: [pathParam()],
        body: jsonBody({ designation: 'Senior mason', phone: '9876543210' }),
      }),
    },
    '/employees/{id}/restore': {
      post: operation('Employees', 'Restore an employee', { parameters: [pathParam()] }),
    },
    '/employees/{id}/assignments': {
      get: operation('Employees', 'List site assignments', { parameters: [pathParam()] }),
      post: operation('Employees', 'Assign an employee to a site', {
        parameters: [pathParam()],
        body: jsonBody({ siteId: '64b0c0c0c0c0c0c0c0c0c0c0', startDate: '2026-04-14' }),
      }),
    },
    '/employees/{id}/assignments/{assignmentId}/release': {
      post: operation('Employees', 'Release an employee from a site', {
        parameters: [pathParam(), pathParam('assignmentId')],
        body: jsonBody({ endDate: '2026-04-20' }),
      }),
    },
    '/attendance/register': {
      get: operation('Attendance', 'Daily attendance register', {
        parameters: [query('date', { type: 'string', format: 'date' }, 'Required'), query('departmentId', objectId), query('siteId', objectId)],
      }),
    },
    '/attendance/summary': {
      get: operation('Attendance', 'Attendance summary', {
        parameters: [query('from', { type: 'string', format: 'date' }), query('to', { type: 'string', format: 'date' }), query('employeeId', objectId)],
      }),
    },
    '/attendance': {
      get: operation('Attendance', 'List attendance', {
        parameters: [...paging, query('date', { type: 'string', format: 'date' }), query('from', { type: 'string', format: 'date' }), query('to', { type: 'string', format: 'date' }), query('employeeId', objectId), query('status', { type: 'string' })],
      }),
      post: operation('Attendance', 'Mark attendance', {
        status: '201',
        body: jsonBody({
          employeeId: '64b0c0c0c0c0c0c0c0c0c0c0',
          date: '2026-04-14',
          status: 'present',
          checkIn: '09:00',
          checkOut: '18:00',
          overtimeHours: 1,
        }),
      }),
    },
    '/attendance/bulk': {
      post: operation('Attendance', 'Mark attendance for up to 200 employees', {
        body: jsonBody({
          date: '2026-04-14',
          entries: [{ employeeId: '64b0c0c0c0c0c0c0c0c0c0c0', status: 'present', checkIn: '09:00', checkOut: '18:00' }],
        }),
      }),
    },
    '/attendance/{id}': {
      get: operation('Attendance', 'Get one attendance record', { parameters: [pathParam()] }),
      patch: operation('Attendance', 'Update attendance', {
        parameters: [pathParam()],
        body: jsonBody({ status: 'half_day', checkOut: '13:00', overtimeHours: 0 }),
      }),
      delete: operation('Attendance', 'Delete an attendance record', { parameters: [pathParam()] }),
    },
    '/inventory/items': {
      get: operation('Inventory', 'List items', { parameters: paging }),
      post: operation('Inventory', 'Create an item', {
        status: '201',
        body: jsonBody({ name: 'Cement OPC 53', category: 'Material', unit: 'bag', reorderLevel: 50 }),
      }),
    },
    '/inventory/items/{id}': {
      get: operation('Inventory', 'Get an item', { parameters: [pathParam()] }),
      patch: operation('Inventory', 'Update an item', { parameters: [pathParam()], body: jsonBody({ reorderLevel: 40 }) }),
      delete: operation('Inventory', 'Archive an item', { parameters: [pathParam()] }),
    },
    '/inventory/items/{id}/restore': {
      post: operation('Inventory', 'Restore an item', { parameters: [pathParam()] }),
    },
    '/inventory/locations': {
      get: operation('Inventory', 'List stock locations', { parameters: paging }),
      post: operation('Inventory', 'Create a stock location', {
        status: '201',
        body: jsonBody({ name: 'Main store', type: 'central_store' }),
      }),
    },
    '/inventory/locations/{id}': {
      get: operation('Inventory', 'Get a stock location', { parameters: [pathParam()] }),
      patch: operation('Inventory', 'Update a stock location', { parameters: [pathParam()], body: jsonBody({ name: 'Main store', isActive: true }) }),
      delete: operation('Inventory', 'Archive a stock location', { parameters: [pathParam()] }),
    },
    '/inventory/locations/{id}/restore': {
      post: operation('Inventory', 'Restore a stock location', { parameters: [pathParam()] }),
    },
    '/inventory/stock': {
      get: operation('Inventory', 'All stock items with received, issued, remaining, counts, and low-stock items', {
        parameters: [...paging, query('itemId', objectId), query('locationId', objectId)],
      }),
    },
    '/inventory/stock/low': {
      get: operation('Inventory', 'Items at or below reorder level'),
    },
    '/inventory/movements': {
      get: operation('Inventory', 'List inward stock movements (receipts, returns, transfers, adjustments)', {
        parameters: [
          ...paging,
          query('itemId', objectId),
          query('locationId', objectId),
          query('projectId', objectId),
          query('siteId', objectId),
          query('employeeId', objectId),
          query('vehicleTypeId', objectId),
          query('from', { type: 'string', format: 'date' }),
          query('to', { type: 'string', format: 'date' }),
        ],
      }),
      post: operation('Inventory', 'Record a stock movement', {
        status: '201',
        body: jsonBody({
          type: 'issue',
          itemId: '64b0c0c0c0c0c0c0c0c0c0c0',
          quantity: 10,
          siteId: '64b0c0c0c0c0c0c0c0c0c0c0',
          employeeId: '64b0c0c0c0c0c0c0c0c0c0c0',
          vehicleTypeId: '64b0c0c0c0c0c0c0c0c0c0c0',
        }),
      }),
    },
    '/inventory/movements/{id}': {
      get: operation('Inventory', 'Get a stock movement', { parameters: [pathParam()] }),
      patch: operation('Inventory', 'Update a stock movement and recalculate remaining stock', {
        parameters: [pathParam()],
        body: jsonBody({
          quantity: 80,
          vendorName: 'Ultratech Cement',
          billNo: 'INV-1024',
          remarks: 'Corrected inward quantity',
        }),
      }),
    },
    '/inventory/issues': {
      get: operation('Inventory', 'List stock issues', {
        parameters: [
          ...paging,
          query('itemId', objectId),
          query('locationId', objectId),
          query('projectId', objectId),
          query('siteId', objectId),
          query('employeeId', objectId),
          query('vehicleTypeId', objectId),
          query('from', { type: 'string', format: 'date' }),
          query('to', { type: 'string', format: 'date' }),
        ],
      }),
    },
    '/inventory/issues/{id}': {
      get: operation('Inventory', 'Get a stock issue', { parameters: [pathParam()] }),
      patch: operation('Inventory', 'Update an issue and recalculate remaining stock', {
        parameters: [pathParam()],
        body: jsonBody({
          quantity: 4,
          siteId: '64b0c0c0c0c0c0c0c0c0c0c0',
          remarks: 'Corrected issue quantity',
        }),
      }),
    },
    '/vehicles': {
      get: operation('Vehicles', 'List vehicles', { parameters: [...paging, query('status', { type: 'string' }), query('type', { type: 'string' }), query('siteId', objectId)] }),
      post: operation('Vehicles', 'Create a vehicle, and assign it when siteId is sent', {
        status: '201',
        body: jsonBody({
          registrationNumber: 'UP32 AB 2002',
          type: 'Tipper',
          fuelType: 'diesel',
          odometer: 12000,
          siteId: '64b0c0c0c0c0c0c0c0c0c0c0',
        }),
      }),
    },
    '/vehicles/alerts': {
      get: operation('Vehicles', 'Vehicles with documents expiring soon', {
        parameters: [query('withinDays', { type: 'integer', default: 30 })],
      }),
    },
    '/vehicles/{id}': {
      get: operation('Vehicles', 'Get a vehicle', { parameters: [pathParam()] }),
      patch: operation('Vehicles', 'Update a vehicle', { parameters: [pathParam()], body: jsonBody({ notes: 'New tyres fitted' }) }),
      delete: operation('Vehicles', 'Archive a vehicle', { parameters: [pathParam()] }),
    },
    '/vehicles/{id}/restore': {
      post: operation('Vehicles', 'Restore a vehicle', { parameters: [pathParam()] }),
    },
    '/vehicles/{id}/assign': {
      post: operation('Vehicles', 'Assign an available vehicle', {
        parameters: [pathParam()],
        body: jsonBody({ siteId: '64b0c0c0c0c0c0c0c0c0c0c0', assignedAt: '2026-04-14' }),
      }),
    },
    '/vehicles/{id}/release': {
      post: operation('Vehicles', 'Release an assigned vehicle', {
        parameters: [pathParam()],
        body: jsonBody({ releasedAt: '2026-04-15' }),
      }),
    },
    '/vehicles/{id}/assignments': {
      get: operation('Vehicles', 'Assignment history', { parameters: [pathParam(), ...paging] }),
    },
    '/vehicles/{id}/maintenance': {
      get: operation('Vehicles', 'List maintenance logs', { parameters: [pathParam()] }),
      post: operation('Vehicles', 'Add a maintenance log', {
        parameters: [pathParam()],
        body: jsonBody({ type: 'service', description: 'Engine oil change', cost: 2500, odometer: 12500 }),
      }),
    },
    '/vehicles/{id}/maintenance/{maintenanceId}/complete': {
      post: operation('Vehicles', 'Complete a maintenance log', {
        parameters: [pathParam(), pathParam('maintenanceId')],
        body: jsonBody({ completionNote: 'Done' }),
      }),
    },
    '/vehicles/{id}/fuel-logs': {
      get: operation('Vehicles', 'List fuel logs', { parameters: [pathParam()] }),
      post: operation('Vehicles', 'Add a fuel log', {
        parameters: [pathParam()],
        body: jsonBody({ liters: 40, amount: 3600, odometer: 12500 }),
      }),
    },
    '/accounts/summary': {
      get: operation('Accounts', 'Salary and expense totals', {
        parameters: [query('from', { type: 'string', format: 'date' }), query('to', { type: 'string', format: 'date' }), query('projectId', objectId)],
      }),
    },
    '/accounts/employees/{employeeId}/statement': {
      get: operation('Accounts', 'Employee ledger statement', { parameters: [pathParam('employeeId')] }),
    },
    '/accounts/salaries': {
      get: operation('Accounts', 'List salary records', { parameters: paging }),
      post: operation('Accounts', 'Record a salary sheet', {
        status: '201',
        body: jsonBody({
          employeeId: '64b0c0c0c0c0c0c0c0c0c0c0',
          periodMonth: 4,
          periodYear: 2026,
          payBasis: 'monthly',
          baseAmount: 25000,
          amountPaid: 25000,
        }),
      }),
    },
    '/accounts/salaries/{id}': {
      get: operation('Accounts', 'Get a salary record', { parameters: [pathParam()] }),
      patch: operation('Accounts', 'Update a salary record', { parameters: [pathParam()], body: jsonBody({ amountPaid: 20000 }) }),
    },
    '/accounts/salaries/{id}/void': {
      post: operation('Accounts', 'Void a salary record', {
        parameters: [pathParam()],
        body: jsonBody({ reason: 'Entered for the wrong month' }),
      }),
    },
    '/accounts/expenses': {
      get: operation('Accounts', 'List expenses', { parameters: paging }),
      post: operation('Accounts', 'Record an expense', {
        status: '201',
        body: jsonBody({
          category: 'material',
          amount: 38000,
          description: 'Cement purchase',
          paymentModeNote: 'bank_transfer',
        }),
      }),
    },
    '/accounts/expenses/{id}': {
      get: operation('Accounts', 'Get an expense', { parameters: [pathParam()] }),
      patch: operation('Accounts', 'Update an expense', { parameters: [pathParam()], body: jsonBody({ amount: 40000 }) }),
    },
    '/accounts/expenses/{id}/void': {
      post: operation('Accounts', 'Void an expense', {
        parameters: [pathParam()],
        body: jsonBody({ reason: 'Duplicate entry removed' }),
      }),
    },
    '/accounts/advances': {
      get: operation('Accounts', 'List employee advance requests', {
        parameters: [...paging, query('employeeId', objectId), query('departmentId', objectId), query('from', { type: 'string', format: 'date' }), query('to', { type: 'string', format: 'date' })],
      }),
      post: operation('Accounts', 'Create an employee advance request', {
        status: '201',
        body: jsonBody({
          employeeId: '64b0c0c0c0c0c0c0c0c0c0c0',
          advanceAmount: 5000,
          reasonForAdvance: 'Festival advance',
          employeeRemarks: 'Will adjust in next salary',
          requestDate: '2026-10-30',
        }),
      }),
    },
    '/accounts/advances/{id}': {
      get: operation('Accounts', 'Get an advance request', { parameters: [pathParam()] }),
      patch: operation('Accounts', 'Update an advance request', {
        parameters: [pathParam()],
        body: jsonBody({ advanceAmount: 7000, reasonForAdvance: 'Medical expense' }),
      }),
    },
    '/accounts/advances/{id}/recover': {
      post: operation('Accounts', 'Record an advance recovery', {
        parameters: [pathParam()],
        body: jsonBody({ amount: 2000, remarks: 'Adjusted in October salary' }),
      }),
    },
    '/accounts/advances/{id}/void': {
      post: operation('Accounts', 'Void an advance request', {
        parameters: [pathParam()],
        body: jsonBody({ reason: 'Entered for the wrong employee' }),
      }),
    },
    '/accounts/impress': {
      get: operation('Accounts', 'List impress entries with given, local receive, brought amount (still with them)', {
        parameters: [...paging, query('employeeId', objectId), query('siteId', objectId), query('from', { type: 'string', format: 'date' }), query('to', { type: 'string', format: 'date' })],
      }),
      post: operation('Accounts', 'Create an impress entry', {
        status: '201',
        body: jsonBody({
          date: '2026-10-30',
          employeeId: '64b0c0c0c0c0c0c0c0c0c0c0',
          siteId: '64b0c0c0c0c0c0c0c0c0c0c0',
          description: 'Site petty cash',
          given: 10000,
          notes: 'For local purchases',
        }),
      }),
    },
    '/accounts/impress/{id}': {
      get: operation('Accounts', 'Get an impress entry', { parameters: [pathParam()] }),
      patch: operation('Accounts', 'Update an impress entry', {
        parameters: [pathParam()],
        body: jsonBody({ given: 12000, notes: 'Top-up' }),
      }),
      delete: operation('Accounts', 'Delete an impress entry', { parameters: [pathParam()] }),
    },
    '/accounts/impress/{id}/void': {
      post: operation('Accounts', 'Void an impress entry', {
        parameters: [pathParam()],
        body: jsonBody({ reason: 'Entered for the wrong site' }),
      }),
    },
    '/accounts/local-expenses': {
      get: operation('Accounts', 'List local expenses', {
        parameters: [...paging, query('employeeId', objectId), query('siteId', objectId), query('paymentMode', { type: 'string' }), query('from', { type: 'string', format: 'date' }), query('to', { type: 'string', format: 'date' })],
      }),
      post: operation('Accounts', 'Create a local expense', {
        status: '201',
        body: jsonBody({
          date: '2026-10-30',
          employeeId: '64b0c0c0c0c0c0c0c0c0c0c0',
          cashGiven: 2000,
          expenseDetails: 'Tea, nails, and local transport',
          returnAmount: 150,
          paymentMode: 'cash',
        }),
      }),
    },
    '/accounts/local-expenses/employees/{employeeId}/site': {
      get: operation('Accounts', 'Related site for a selected employee', {
        parameters: [pathParam('employeeId')],
      }),
    },
    '/accounts/local-expenses/{id}': {
      get: operation('Accounts', 'Get a local expense', { parameters: [pathParam()] }),
      patch: operation('Accounts', 'Update a local expense', {
        parameters: [pathParam()],
        body: jsonBody({ returnAmount: 100, expenseDetails: 'Corrected details' }),
      }),
      delete: operation('Accounts', 'Delete a local expense', { parameters: [pathParam()] }),
    },
  },
};

module.exports = spec;
