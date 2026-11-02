const {
  PROJECT_STATUS,
  SITE_STATUS,
  EMPLOYMENT_TYPES,
  EMPLOYEE_STATUS,
  PAY_BASIS,
  ATTENDANCE_STATUS,
  SALARY_RECORD_STATUS,
  STOCK_LOCATION_TYPES,
  MOVEMENT_TYPES,
  MATERIAL_CONDITIONS,
  ADJUSTMENT_DIRECTIONS,
  UNITS,
  FUEL_TYPES,
  MAINTENANCE_TYPES,
  EXPENSE_CATEGORIES,
  PAYMENT_MODE_NOTES,
} = require('../config/constants');

const objectId = {
  type: 'string',
  pattern: '^[a-fA-F\\d]{24}$',
  example: '64b0c0c0c0c0c0c0c0c0c0c0',
  description: 'MongoDB ObjectId',
};

const bearer = [{ bearerAuth: [] }];

const money = {
  type: 'number',
  minimum: 0,
  maximum: 999999999.99,
  description: 'INR amount, at most 2 decimal places',
};

const positiveMoney = {
  type: 'number',
  exclusiveMinimum: 0,
  maximum: 999999999.99,
  description: 'INR amount greater than 0, at most 2 decimal places',
};

const quantity = {
  type: 'number',
  exclusiveMinimum: 0,
  maximum: 100000000,
  example: 10,
  description: 'Positive quantity, at most 3 decimal places',
};

const dateValue = {
  type: 'string',
  format: 'date',
  example: '2026-04-01',
};

const clock = {
  oneOf: [
    { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', example: '09:00', description: 'Time as HH:mm' },
    { type: 'string', format: 'date-time' },
  ],
};

const phone = {
  type: 'string',
  pattern: '^[0-9+\\-\\s()]{7,20}$',
  example: '9876543210',
};

const email = { type: 'string', format: 'email', maxLength: 160, example: 'owner@mksbuilder.local' };
const password = { type: 'string', minLength: 8, maxLength: 128, example: 'ChangeMe123!' };
const ifscCode = {
  type: 'string',
  description: '11 characters: 4 letters, 0, then 6 letters or digits',
  example: 'SBIN0001234',
};
const bankAccountNumber = {
  type: 'string',
  pattern: '^[0-9]{9,18}$',
  description: '9 to 18 digits',
  example: '123456789012',
};

function pathParam(name = 'id') {
  return { name, in: 'path', required: true, schema: objectId };
}

function query(name, schema, description) {
  return { name, in: 'query', required: false, schema, description };
}

function derefSchema(node, stack = []) {
  if (!node || typeof node !== 'object') return node;
  if (node.$ref) {
    const name = String(node.$ref).split('/').pop();
    if (!name || stack.includes(name) || !schemas[name]) return { type: 'object' };
    return derefSchema(schemas[name], stack.concat(name));
  }
  const copy = { ...node };
  if (copy.properties) {
    copy.properties = Object.fromEntries(
      Object.entries(copy.properties).map(([key, value]) => [key, derefSchema(value, stack)])
    );
  }
  if (copy.items) copy.items = derefSchema(copy.items, stack);
  if (copy.oneOf) copy.oneOf = copy.oneOf.map((item) => derefSchema(item, stack));
  return copy;
}

function exampleFromSchema(node, fieldName = '') {
  if (!node || typeof node !== 'object') return '';
  if (node.$ref) return exampleFromSchema(derefSchema(node), fieldName);
  if (Object.prototype.hasOwnProperty.call(node, 'example')) return node.example;
  if (node.enum && node.enum.length) return node.enum[0];
  if (node.oneOf && node.oneOf.length) return exampleFromSchema(node.oneOf[0], fieldName);
  if (node.type === 'array') return [exampleFromSchema(node.items, fieldName)];
  if (node.properties) {
    return Object.fromEntries(
      Object.entries(node.properties).map(([key, value]) => [key, exampleFromSchema(value, key)])
    );
  }
  if (node.type === 'boolean') return true;
  if (node.type === 'integer') return node.minimum == null ? 1 : node.minimum;
  if (node.type === 'number') return node.minimum == null ? 0 : node.minimum;
  if (node.format === 'date') return '2026-04-01';
  if (node.format === 'email') return 'owner@mksbuilder.local';
  if (node.nullable) return null;
  const samples = {
    description: 'Site civil works',
    address: 'Ring Road',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    pincode: '226001',
    notes: '',
    remarks: '',
    sku: 'CEM-53',
    make: 'Tata',
    modelName: 'Signa',
    vendorName: 'Ultratech Cement',
    payeeName: 'Ultratech',
    billNo: 'INV-1024',
    challanNo: 'CH-12',
    reference: 'REF-1',
    referenceNo: 'BILL-1024',
    name: fieldName === 'name' ? 'Sample' : '',
  };
  if (Object.prototype.hasOwnProperty.call(samples, fieldName)) return samples[fieldName];
  return '';
}

function mergeExample(base, override) {
  if (override === undefined) return base;
  if (
    !base
    || typeof base !== 'object'
    || Array.isArray(base)
    || typeof override !== 'object'
    || Array.isArray(override)
  ) {
    return override;
  }
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = mergeExample(base[key], value);
  }
  return merged;
}

function jsonBody(example, schema) {
  const resolved = typeof schema === 'string'
    ? derefSchema(schemas[schema])
    : schema
      ? derefSchema(schema)
      : { type: 'object' };
  const generated = resolved && resolved.properties ? exampleFromSchema(resolved) : {};
  const fullExample = mergeExample(generated, example);
  return {
    required: true,
    content: {
      'application/json': {
        schema: {
          ...resolved,
          example: fullExample,
        },
        example: fullExample,
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

const amountLine = {
  type: 'object',
  required: ['name', 'amount'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 80, example: 'HRA' },
    amount: { ...money, example: 2000 },
  },
};

const schemas = {
  AmountLine: amountLine,
  RegisterBody: {
    type: 'object',
    required: ['name', 'email', 'password'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 120, example: 'Owner' },
      email,
      password,
    },
  },
  LoginBody: {
    type: 'object',
    required: ['email', 'password'],
    properties: { email, password },
  },
  RefreshBody: {
    type: 'object',
    properties: {
      refreshToken: {
        type: 'string',
        minLength: 32,
        maxLength: 256,
        example: 'paste-refresh-token',
        description: 'Optional when the HttpOnly refresh_token cookie is sent. JSON body is for Postman and mobile.',
      },
    },
  },
  ForgotPasswordBody: {
    type: 'object',
    required: ['email'],
    properties: { email },
  },
  ResetPasswordBody: {
    type: 'object',
    required: ['password', 'confirmPassword'],
    properties: {
      password,
      confirmPassword: { ...password, example: 'NewPass123!' },
    },
  },
  ChangePasswordBody: {
    type: 'object',
    required: ['currentPassword', 'newPassword', 'confirmPassword'],
    properties: {
      currentPassword: password,
      newPassword: { ...password, example: 'NewPass123!' },
      confirmPassword: { ...password, example: 'NewPass123!' },
    },
  },
  DepartmentCreate: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 120, example: 'Civil' },
      description: { type: 'string', maxLength: 500, example: 'Site civil works' },
      isActive: { type: 'boolean', example: true },
    },
  },
  ProjectCreate: {
    type: 'object',
    required: ['name', 'clientName', 'startDate'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 120, example: 'Riverfront' },
      clientName: { type: 'string', minLength: 1, maxLength: 120, example: 'City Authority' },
      clientPhone: phone,
      description: { type: 'string', maxLength: 2000 },
      status: { type: 'string', enum: PROJECT_STATUS, example: 'active' },
      startDate: dateValue,
      expectedEndDate: dateValue,
      budgetAmount: { ...money, example: 5000000 },
      clientAmount: { ...money, example: 1500000 },
      moneySpent: { ...money, example: 0 },
      address: { type: 'string', maxLength: 300 },
      city: { type: 'string', maxLength: 80 },
      state: { type: 'string', maxLength: 80 },
      pincode: { type: 'string', maxLength: 12 },
    },
  },
  SiteCreate: {
    type: 'object',
    required: ['projectId', 'name', 'startDate'],
    properties: {
      projectId: objectId,
      name: { type: 'string', minLength: 1, maxLength: 120, example: 'Tower A' },
      address: { type: 'string', maxLength: 300, example: 'Ring Road' },
      city: { type: 'string', maxLength: 80 },
      state: { type: 'string', maxLength: 80 },
      pincode: { type: 'string', maxLength: 12 },
      status: { type: 'string', enum: SITE_STATUS, example: 'active' },
      inchargeId: objectId,
      startDate: dateValue,
      expectedEndDate: dateValue,
      notes: { type: 'string', maxLength: 1000 },
    },
  },
  EmployeeSalary: {
    type: 'object',
    required: ['baseAmount'],
    properties: {
      payBasis: { type: 'string', enum: PAY_BASIS, example: 'monthly' },
      baseAmount: { ...money, example: 25000 },
      allowances: { type: 'array', maxItems: 20, items: amountLine },
    },
  },
  EmployeeCreate: {
    type: 'object',
    required: ['fullName', 'departmentId', 'designation', 'employmentType', 'joiningDate', 'salary'],
    properties: {
      fullName: { type: 'string', minLength: 1, maxLength: 120, example: 'Ravi Kumar' },
      phone,
      email: { ...email, example: 'ravi@example.com' },
      address: { type: 'string', maxLength: 300 },
      departmentId: objectId,
      designation: { type: 'string', minLength: 1, maxLength: 80, example: 'Mason' },
      employmentType: { type: 'string', enum: EMPLOYMENT_TYPES, example: 'permanent' },
      status: { type: 'string', enum: ['active', 'inactive'], example: 'active' },
      joiningDate: dateValue,
      relievingDate: dateValue,
      salary: { $ref: '#/components/schemas/EmployeeSalary' },
      notes: { type: 'string', maxLength: 1000 },
      siteId: objectId,
      idType: { type: 'string', maxLength: 40, example: 'Aadhaar' },
      idNumber: { type: 'string', maxLength: 40, example: '123412341234' },
      profilePhoto: {
        type: 'string',
        nullable: true,
        description: 'File path, or a JPEG/PNG/WebP (base64 or data URL) up to 10 MB. Large photos are compressed to about 800px and 200 KB.',
      },
      idPhotos: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'string',
          minLength: 1,
          description: 'File path, or a JPEG/PNG/WebP (base64 or data URL) up to 10 MB. Large ID photos are compressed to about 1280px and 300 KB.',
        },
      },
      bankName: { type: 'string', maxLength: 120, example: 'State Bank of India' },
      accountNumber: bankAccountNumber,
      ifscCode,
    },
  },
  EmployeeAssign: {
    type: 'object',
    required: ['siteId'],
    properties: {
      siteId: objectId,
      startDate: dateValue,
      remarks: { type: 'string', maxLength: 300 },
    },
  },
  AttendanceCreate: {
    type: 'object',
    required: ['employeeId', 'date', 'status'],
    properties: {
      employeeId: objectId,
      date: dateValue,
      status: { type: 'string', enum: ATTENDANCE_STATUS, example: 'present' },
      projectId: objectId,
      siteId: objectId,
      checkIn: clock,
      checkOut: clock,
      overtimeHours: { type: 'number', minimum: 0, maximum: 16, example: 1 },
      remarks: { type: 'string', maxLength: 300 },
    },
  },
  AttendanceBulkEntry: {
    type: 'object',
    required: ['employeeId', 'status'],
    properties: {
      employeeId: objectId,
      status: { type: 'string', enum: ATTENDANCE_STATUS, example: 'present' },
      siteId: objectId,
      checkIn: clock,
      checkOut: clock,
      overtimeHours: { type: 'number', minimum: 0, maximum: 16 },
      remarks: { type: 'string', maxLength: 300 },
    },
  },
  AttendanceBulkCreate: {
    type: 'object',
    required: ['date', 'entries'],
    properties: {
      date: dateValue,
      projectId: objectId,
      siteId: objectId,
      entries: {
        type: 'array',
        minItems: 1,
        maxItems: 200,
        items: { $ref: '#/components/schemas/AttendanceBulkEntry' },
      },
    },
  },
  InventoryItemCreate: {
    type: 'object',
    required: ['name', 'category', 'unit'],
    properties: {
      sku: { type: 'string', minLength: 1, maxLength: 40 },
      name: { type: 'string', minLength: 1, maxLength: 120, example: 'Cement OPC 53' },
      category: { type: 'string', minLength: 1, maxLength: 40, example: 'Material' },
      unit: { type: 'string', enum: UNITS, example: 'bag' },
      reorderLevel: { type: 'number', minimum: 0, maximum: 100000000, example: 50 },
      description: { type: 'string', maxLength: 500 },
      isActive: { type: 'boolean' },
    },
  },
  StockLocationCreate: {
    type: 'object',
    required: ['name', 'type'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 120, example: 'Main store' },
      type: { type: 'string', enum: STOCK_LOCATION_TYPES, example: 'central_store' },
      siteId: { ...objectId, description: 'Required when type is site_store. Must be empty for central_store.' },
      isActive: { type: 'boolean' },
    },
  },
  StockMovementCreate: {
    type: 'object',
    required: ['type', 'itemId', 'quantity'],
    properties: {
      type: { type: 'string', enum: MOVEMENT_TYPES, example: 'issue' },
      itemId: objectId,
      quantity,
      direction: { type: 'string', enum: ADJUSTMENT_DIRECTIONS, description: 'Required when type is adjustment' },
      fromLocationId: objectId,
      toLocationId: objectId,
      projectId: objectId,
      siteId: objectId,
      employeeId: objectId,
      vehicleTypeId: objectId,
      unitCost: money,
      vendorName: { type: 'string', maxLength: 120, description: 'Required when type is receipt' },
      condition: { type: 'string', enum: MATERIAL_CONDITIONS, description: 'Required when type is receipt' },
      billNo: { type: 'string', maxLength: 80, description: 'Bill or challan is required for receipt' },
      challanNo: { type: 'string', maxLength: 80 },
      materialReceiptPhoto: { type: 'string', nullable: true, maxLength: 500 },
      paymentMode: { type: 'string', enum: PAYMENT_MODE_NOTES, description: 'Required when type is receipt' },
      address: { type: 'string', maxLength: 300 },
      movementDate: dateValue,
      reference: { type: 'string', maxLength: 80 },
      remarks: { type: 'string', maxLength: 500 },
    },
  },
  VehicleDocuments: {
    type: 'object',
    properties: {
      insuranceExpiry: { ...dateValue, nullable: true },
      fitnessExpiry: { ...dateValue, nullable: true },
      permitExpiry: { ...dateValue, nullable: true },
      pollutionExpiry: { ...dateValue, nullable: true },
    },
  },
  VehicleCreate: {
    type: 'object',
    required: ['registrationNumber', 'type'],
    properties: {
      registrationNumber: { type: 'string', minLength: 1, maxLength: 20, example: 'UP32 AB 2002' },
      type: { type: 'string', minLength: 1, maxLength: 40, example: 'Tipper' },
      make: { type: 'string', maxLength: 80 },
      modelName: { type: 'string', maxLength: 80 },
      year: { type: 'integer', minimum: 1980, maximum: 2100, example: 2022 },
      fuelType: { type: 'string', enum: FUEL_TYPES, example: 'diesel' },
      odometer: { type: 'number', minimum: 0, example: 12000 },
      documents: { $ref: '#/components/schemas/VehicleDocuments' },
      notes: { type: 'string', maxLength: 1000 },
      siteId: objectId,
      driverId: objectId,
      assignedAt: dateValue,
      remarks: { type: 'string', maxLength: 300 },
    },
  },
  VehicleAssign: {
    type: 'object',
    required: ['siteId'],
    properties: {
      siteId: objectId,
      driverId: objectId,
      assignedAt: dateValue,
      remarks: { type: 'string', maxLength: 300 },
    },
  },
  VehicleMaintenanceCreate: {
    type: 'object',
    required: ['type', 'description', 'cost'],
    properties: {
      loggedAt: dateValue,
      type: { type: 'string', enum: MAINTENANCE_TYPES, example: 'service' },
      description: { type: 'string', minLength: 3, maxLength: 500, example: 'Engine oil change' },
      cost: { ...money, example: 2500 },
      odometer: { type: 'number', minimum: 0, example: 12500 },
      vendorName: { type: 'string', maxLength: 120 },
      nextDueDate: dateValue,
      recordExpense: { type: 'boolean' },
      payeeName: { type: 'string', minLength: 1, maxLength: 120 },
      paymentModeNote: { type: 'string', enum: PAYMENT_MODE_NOTES },
    },
  },
  VehicleFuelCreate: {
    type: 'object',
    required: ['liters', 'amount'],
    properties: {
      loggedAt: dateValue,
      liters: quantity,
      amount: { ...positiveMoney, example: 3600 },
      odometer: { type: 'number', minimum: 0, example: 12500 },
      siteId: objectId,
      remarks: { type: 'string', maxLength: 300 },
      recordExpense: { type: 'boolean' },
      payeeName: { type: 'string', minLength: 1, maxLength: 120 },
      paymentModeNote: { type: 'string', enum: PAYMENT_MODE_NOTES },
    },
  },
  SalaryCreate: {
    type: 'object',
    required: ['employeeId', 'periodMonth', 'periodYear'],
    properties: {
      employeeId: objectId,
      projectId: objectId,
      siteId: objectId,
      periodMonth: { type: 'integer', minimum: 1, maximum: 12, example: 4 },
      periodYear: { type: 'integer', minimum: 2000, maximum: 2100, example: 2026 },
      payBasis: { type: 'string', enum: PAY_BASIS, example: 'monthly' },
      baseAmount: { ...money, example: 25000 },
      allowances: { type: 'array', maxItems: 20, items: amountLine },
      deductions: { type: 'array', maxItems: 20, items: amountLine },
      extras: { type: 'array', maxItems: 20, items: amountLine },
      amountPaid: { ...money, example: 25000 },
      recordStatus: { type: 'string', enum: SALARY_RECORD_STATUS },
      remarks: { type: 'string', maxLength: 500 },
    },
  },
  ExpenseCreate: {
    type: 'object',
    required: ['category', 'amount', 'description'],
    properties: {
      category: { type: 'string', enum: EXPENSE_CATEGORIES, example: 'material' },
      amount: { ...positiveMoney, example: 38000 },
      expenseDate: dateValue,
      description: { type: 'string', minLength: 3, maxLength: 500, example: 'Cement purchase' },
      payeeName: { type: 'string', minLength: 1, maxLength: 120 },
      employeeId: objectId,
      projectId: objectId,
      siteId: objectId,
      vehicleId: objectId,
      itemId: objectId,
      referenceNo: { type: 'string', maxLength: 80 },
      paymentModeNote: { type: 'string', enum: PAYMENT_MODE_NOTES, example: 'bank_transfer' },
    },
  },
  AdvanceCreate: {
    type: 'object',
    required: ['employeeId', 'advanceAmount', 'reasonForAdvance'],
    properties: {
      employeeId: objectId,
      monthlySalary: money,
      requestDate: dateValue,
      advanceAmount: { ...positiveMoney, example: 5000 },
      reasonForAdvance: { type: 'string', minLength: 1, maxLength: 500, example: 'Festival advance' },
      attachment: { type: 'string', nullable: true, maxLength: 500 },
      employeeRemarks: { type: 'string', maxLength: 500, example: 'Will adjust in next salary' },
    },
  },
  ImpressCreate: {
    type: 'object',
    required: ['employeeId', 'siteId', 'description', 'given'],
    properties: {
      date: dateValue,
      employeeId: objectId,
      siteId: objectId,
      description: { type: 'string', minLength: 1, maxLength: 500, example: 'Site petty cash' },
      given: { ...positiveMoney, example: 10000 },
      notes: { type: 'string', maxLength: 500, example: 'For local purchases' },
    },
  },
  LocalExpenseCreate: {
    type: 'object',
    required: ['employeeId', 'cashGiven', 'expenseDetails', 'paymentMode'],
    properties: {
      date: dateValue,
      employeeId: objectId,
      siteId: objectId,
      cashGiven: { ...positiveMoney, example: 2000 },
      expenseDetails: { type: 'string', minLength: 1, maxLength: 1000, example: 'Tea, nails, and local transport' },
      returnAmount: { ...money, example: 150 },
      paymentMode: { type: 'string', enum: PAYMENT_MODE_NOTES, example: 'cash' },
      receipt: { type: 'string', nullable: true, maxLength: 500 },
    },
  },
};

for (const schema of Object.values(schemas)) {
  if (schema && schema.properties && schema.example === undefined) {
    schema.example = exampleFromSchema(schema);
  }
}

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
    { name: 'Imports' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas,
  },
  paths: {
    '/health': {
      get: operation('Health', 'Service and database health', { auth: false }),
    },
    '/auth/register': {
      post: operation('Auth', 'Register an admin', {
        auth: false,
        status: '201',
        body: jsonBody({ name: 'Owner', email: 'owner@mksbuilder.local', password: 'ChangeMe123!' }, 'RegisterBody'),
      }),
    },
    '/auth/login': {
      post: operation('Auth', 'Log in', {
        auth: false,
        body: jsonBody({ email: 'owner@mksbuilder.local', password: 'ChangeMe123!' }, 'LoginBody'),
      }),
    },
    '/auth/refresh': {
      post: operation('Auth', 'Rotate the refresh token (OAuth 2.0). Sends a new access token and a new HttpOnly refresh_token cookie', {
        auth: false,
        body: jsonBody({ refreshToken: 'paste-refresh-token' }, 'RefreshBody'),
      }),
    },
    '/auth/forgot-password': {
      post: operation('Auth', 'Email a reset link', {
        auth: false,
        body: jsonBody({ email: 'owner@mksbuilder.local' }, 'ForgotPasswordBody'),
      }),
    },
    '/auth/reset-password/{token}': {
      post: operation('Auth', 'Reset password with the email token', {
        auth: false,
        parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string', minLength: 32 } }],
        body: jsonBody({ password: 'NewPass123!', confirmPassword: 'NewPass123!' }, 'ResetPasswordBody'),
      }),
    },
    '/auth/users': {
      get: operation('Auth', 'List users'),
    },
    '/auth/users/{id}': {
      delete: operation('Auth', 'Permanently delete a user', { parameters: [pathParam()] }),
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
                properties: { avatar: { type: 'string', format: 'binary', description: 'JPEG, PNG, or WebP up to 10 MB. Large photos are compressed to about 512px and 150 KB.' } },
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
        }, 'ChangePasswordBody'),
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
        body: jsonBody({ name: 'Civil', description: 'Site civil works', isActive: true }, 'DepartmentCreate'),
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
      delete: operation('Departments', 'Permanently delete a department', { parameters: [pathParam()] }),
    },
    '/departments/{id}/restore': {
      post: operation('Departments', 'Restore a department', { parameters: [pathParam()] }),
    },
    '/projects': {
      get: operation('Projects', 'List projects', {
        parameters: [...paging, query('status', { type: 'string', enum: PROJECT_STATUS })],
      }),
    },
    '/projects/create': {
      post: operation('Projects', 'Create a project', {
        status: '201',
        body: jsonBody({
          name: 'Riverfront',
          clientName: 'City Authority',
          clientPhone: '9876543210',
          description: '',
          startDate: '2026-04-01',
          expectedEndDate: '2026-12-31',
          budgetAmount: 5000000,
          clientAmount: 1500000,
          moneySpent: 0,
          status: 'active',
          address: 'Ring Road',
          city: 'Lucknow',
          state: 'Uttar Pradesh',
          pincode: '226001',
        }, 'ProjectCreate'),
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
          city: 'Lucknow',
          state: 'Uttar Pradesh',
          pincode: '226001',
          startDate: '2026-04-01',
          expectedEndDate: '2026-12-31',
          status: 'active',
          inchargeId: '64b0c0c0c0c0c0c0c0c0c0c0',
          notes: '',
        }, 'SiteCreate'),
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
        body: {
          required: true,
          content: {
            ...jsonBody({
              fullName: 'Ravi Kumar',
              phone: '9876543210',
              email: 'ravi@example.com',
              address: 'Lucknow',
              departmentId: '64b0c0c0c0c0c0c0c0c0c0c0',
              designation: 'Mason',
              employmentType: 'permanent',
              status: 'active',
              joiningDate: '2026-04-01',
              salary: { payBasis: 'monthly', baseAmount: 25000, allowances: [] },
              notes: '',
              siteId: '64b0c0c0c0c0c0c0c0c0c0c0',
              idType: 'Aadhaar',
              idNumber: '123412341234',
              bankName: 'State Bank of India',
              accountNumber: '123456789012',
              ifscCode: 'SBIN0001234',
            }, 'EmployeeCreate').content,
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['fullName', 'departmentId', 'designation', 'employmentType', 'joiningDate', 'salary.baseAmount'],
                properties: {
                  fullName: { type: 'string', example: 'Ravi Kumar' },
                  phone: { type: 'string', example: '9876543210' },
                  email: { type: 'string', example: 'ravi@example.com' },
                  address: { type: 'string', example: 'Lucknow' },
                  departmentId: objectId,
                  designation: { type: 'string', example: 'Mason' },
                  employmentType: { type: 'string', enum: EMPLOYMENT_TYPES, example: 'permanent' },
                  status: { type: 'string', enum: ['active', 'inactive'], example: 'active' },
                  joiningDate: { type: 'string', format: 'date', example: '2026-04-01' },
                  'salary.baseAmount': { type: 'number', example: 25000 },
                  'salary.payBasis': { type: 'string', enum: PAY_BASIS, example: 'monthly' },
                  siteId: objectId,
                  idType: { type: 'string', example: 'Aadhaar' },
                  idNumber: { type: 'string', example: '123412341234' },
                  bankName: { type: 'string', example: 'State Bank of India' },
                  accountNumber: { type: 'string', example: '123456789012' },
                  ifscCode: { type: 'string', example: 'SBIN0001234' },
                  notes: { type: 'string' },
                  profilePhoto: { type: 'string', format: 'binary', description: 'JPEG, PNG, or WebP up to 10 MB. Compressed automatically.' },
                  idPhotos: { type: 'array', maxItems: 6, items: { type: 'string', format: 'binary' }, description: 'Up to 6 ID photos' },
                },
              },
            },
          },
        },
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
        body: jsonBody({ siteId: '64b0c0c0c0c0c0c0c0c0c0c0', startDate: '2026-04-14', remarks: '' }, 'EmployeeAssign'),
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
          projectId: '64b0c0c0c0c0c0c0c0c0c0c0',
          siteId: '64b0c0c0c0c0c0c0c0c0c0c0',
          checkIn: '09:00',
          checkOut: '18:00',
          overtimeHours: 1,
          remarks: '',
        }, 'AttendanceCreate'),
      }),
    },
    '/attendance/bulk': {
      post: operation('Attendance', 'Mark attendance for up to 200 employees', {
        body: jsonBody({
          date: '2026-04-14',
          projectId: '64b0c0c0c0c0c0c0c0c0c0c0',
          siteId: '64b0c0c0c0c0c0c0c0c0c0c0',
          entries: [{ employeeId: '64b0c0c0c0c0c0c0c0c0c0c0', status: 'present', checkIn: '09:00', checkOut: '18:00' }],
        }, 'AttendanceBulkCreate'),
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
        body: jsonBody({
          name: 'Cement OPC 53',
          category: 'Material',
          unit: 'bag',
          sku: 'CEM-53',
          reorderLevel: 50,
          description: '',
          isActive: true,
        }, 'InventoryItemCreate'),
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
        body: jsonBody({ name: 'Main store', type: 'central_store', isActive: true }, 'StockLocationCreate'),
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
          fromLocationId: '64b0c0c0c0c0c0c0c0c0c0c0',
          projectId: '64b0c0c0c0c0c0c0c0c0c0c0',
          siteId: '64b0c0c0c0c0c0c0c0c0c0c0',
          employeeId: '64b0c0c0c0c0c0c0c0c0c0c0',
          vehicleTypeId: '64b0c0c0c0c0c0c0c0c0c0c0',
          movementDate: '2026-04-14',
          remarks: '',
        }, 'StockMovementCreate'),
      }),
    },
    '/inventory/movements/{id}': {
      get: operation('Inventory', 'Get a stock movement', { parameters: [pathParam()] }),
      delete: operation('Inventory', 'Permanently delete a stock movement and reverse its stock effect', { parameters: [pathParam()] }),
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
      delete: operation('Inventory', 'Permanently delete a stock issue and return the quantity', { parameters: [pathParam()] }),
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
          make: 'Tata',
          modelName: 'Signa',
          year: 2022,
          fuelType: 'diesel',
          odometer: 12000,
          documents: {
            insuranceExpiry: '2027-04-01',
            fitnessExpiry: '2027-04-01',
            permitExpiry: '2027-04-01',
            pollutionExpiry: '2027-04-01',
          },
          notes: '',
          siteId: '64b0c0c0c0c0c0c0c0c0c0c0',
          driverId: '64b0c0c0c0c0c0c0c0c0c0c0',
          assignedAt: '2026-04-14',
        }, 'VehicleCreate'),
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
        body: jsonBody({ siteId: '64b0c0c0c0c0c0c0c0c0c0c0', assignedAt: '2026-04-14' }, 'VehicleAssign'),
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
        body: jsonBody({
          type: 'service',
          description: 'Engine oil change',
          cost: 2500,
          odometer: 12500,
          vendorName: 'Local garage',
          nextDueDate: '2026-10-14',
          recordExpense: false,
        }, 'VehicleMaintenanceCreate'),
      }),
    },
    '/vehicles/{id}/maintenance/{maintenanceId}': {
      delete: operation('Vehicles', 'Permanently delete a maintenance log', {
        parameters: [pathParam(), pathParam('maintenanceId')],
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
        body: jsonBody({
          liters: 40,
          amount: 3600,
          odometer: 12500,
          siteId: '64b0c0c0c0c0c0c0c0c0c0c0',
          remarks: '',
          recordExpense: false,
        }, 'VehicleFuelCreate'),
      }),
    },
    '/vehicles/{id}/fuel-logs/{fuelLogId}': {
      delete: operation('Vehicles', 'Permanently delete a fuel log', {
        parameters: [pathParam(), pathParam('fuelLogId')],
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
          projectId: '64b0c0c0c0c0c0c0c0c0c0c0',
          siteId: '64b0c0c0c0c0c0c0c0c0c0c0',
          periodMonth: 4,
          periodYear: 2026,
          payBasis: 'monthly',
          baseAmount: 25000,
          allowances: [],
          deductions: [],
          extras: [],
          amountPaid: 25000,
          remarks: '',
        }, 'SalaryCreate'),
      }),
    },
    '/accounts/salaries/{id}': {
      get: operation('Accounts', 'Get a salary record', { parameters: [pathParam()] }),
      patch: operation('Accounts', 'Update a salary record', { parameters: [pathParam()], body: jsonBody({ amountPaid: 20000 }) }),
      delete: operation('Accounts', 'Permanently delete a salary record', { parameters: [pathParam()] }),
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
          expenseDate: '2026-04-14',
          description: 'Cement purchase',
          payeeName: 'Ultratech',
          employeeId: '64b0c0c0c0c0c0c0c0c0c0c0',
          projectId: '64b0c0c0c0c0c0c0c0c0c0c0',
          siteId: '64b0c0c0c0c0c0c0c0c0c0c0',
          vehicleId: '64b0c0c0c0c0c0c0c0c0c0c0',
          itemId: '64b0c0c0c0c0c0c0c0c0c0c0',
          referenceNo: 'BILL-1024',
          paymentModeNote: 'bank_transfer',
        }, 'ExpenseCreate'),
      }),
    },
    '/accounts/expenses/{id}': {
      get: operation('Accounts', 'Get an expense', { parameters: [pathParam()] }),
      patch: operation('Accounts', 'Update an expense', { parameters: [pathParam()], body: jsonBody({ amount: 40000 }) }),
      delete: operation('Accounts', 'Permanently delete an expense', { parameters: [pathParam()] }),
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
          monthlySalary: 25000,
          advanceAmount: 5000,
          reasonForAdvance: 'Festival advance',
          employeeRemarks: 'Will adjust in next salary',
          requestDate: '2026-10-30',
        }, 'AdvanceCreate'),
      }),
    },
    '/accounts/advances/{id}': {
      get: operation('Accounts', 'Get an advance request', { parameters: [pathParam()] }),
      patch: operation('Accounts', 'Update an advance request', {
        parameters: [pathParam()],
        body: jsonBody({ advanceAmount: 7000, reasonForAdvance: 'Medical expense' }),
      }),
      delete: operation('Accounts', 'Permanently delete an advance request', { parameters: [pathParam()] }),
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
        }, 'ImpressCreate'),
      }),
    },
    '/accounts/impress/{id}': {
      get: operation('Accounts', 'Get an impress entry', { parameters: [pathParam()] }),
      patch: operation('Accounts', 'Update an impress entry', {
        parameters: [pathParam()],
        body: jsonBody({ given: 12000, notes: 'Top-up' }),
      }),
      delete: operation('Accounts', 'Permanently delete an impress entry', { parameters: [pathParam()] }),
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
          siteId: '64b0c0c0c0c0c0c0c0c0c0c0',
          cashGiven: 2000,
          expenseDetails: 'Tea, nails, and local transport',
          returnAmount: 150,
          paymentMode: 'cash',
        }, 'LocalExpenseCreate'),
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
      delete: operation('Accounts', 'Permanently delete a local expense', { parameters: [pathParam()] }),
    },
    '/imports/template': {
      get: operation('Imports', 'Download the global Excel template with one sheet per module'),
    },
    '/imports/preview': {
      post: operation('Imports', 'Preview a workbook. Detects sheets and validates rows without saving', {
        body: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary', description: 'xlsx workbook' } },
              },
            },
          },
        },
      }),
    },
    '/imports': {
      post: operation('Imports', 'Import a workbook into departments, projects, sites, employees, inventory, vehicles, attendance, and accounts', {
        body: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary', description: 'xlsx workbook' } },
              },
            },
          },
        },
      }),
    },
  },
};

module.exports = spec;
