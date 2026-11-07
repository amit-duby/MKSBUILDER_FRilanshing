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
  VEHICLE_STATUS,
  FUEL_TYPES,
  MAINTENANCE_CATEGORY_STATUS,
  EXPENSE_CATEGORIES,
  PAYMENT_MODE_NOTES,
} = require('../config/constants');

const objectId = {
  type: 'string',
  pattern: '^[a-fA-F\\d]{24}$',
  example: '64b0c0c0c0c0c0c0c0c0c0c0',
};

const money = {
  type: 'number',
  minimum: 0,
  maximum: 999999999.99,
  multipleOf: 0.01,
  description: 'INR amount with up to 2 decimal places',
};

const quantity = {
  type: 'number',
  minimum: 0,
  exclusiveMinimum: true,
  maximum: 100000000,
  description: 'Quantity with up to 3 decimal places',
};

const positiveMoney = {
  ...money,
  exclusiveMinimum: true,
};

const dateString = { type: 'string', format: 'date', example: '2026-04-14' };
const dateTimeString = { type: 'string', format: 'date-time', example: '2026-04-14T09:00:00.000Z' };
const bearer = [{ bearerAuth: [] }];

function pathParam(name = 'id') {
  return { name, in: 'path', required: true, schema: objectId };
}

function query(name, schema, description) {
  return { name, in: 'query', required: false, schema, description };
}

function schemaObject(properties, required = []) {
  return {
    type: 'object',
    additionalProperties: false,
    ...(required.length ? { required } : {}),
    properties,
  };
}

function modelSchema(properties) {
  return {
    type: 'object',
    properties,
  };
}

function namedRef(name) {
  return { $ref: `#/components/schemas/${name}` };
}

function resolveSchema(schema, schemasMap) {
  if (!schema) return schema;
  if (schema.$ref) {
    const name = schema.$ref.split('/').pop();
    return resolveSchema(schemasMap[name], schemasMap);
  }
  if (schema.type === 'array' && schema.items) {
    return { ...schema, items: resolveSchema(schema.items, schemasMap) };
  }
  if (schema.properties) {
    const properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      properties[key] = resolveSchema(value, schemasMap);
    }
    return { ...schema, properties };
  }
  return schema;
}

function buildExample(schema, schemasMap) {
  const resolved = resolveSchema(schema, schemasMap);
  if (!resolved) return undefined;
  if (resolved.type === 'array') {
    return [buildExample(resolved.items, schemasMap)];
  }
  if (resolved.type === 'object' || resolved.properties) {
    const out = {};
    for (const [key, prop] of Object.entries(resolved.properties || {})) {
      if (!prop || prop.format === 'binary') continue;
      if (Object.prototype.hasOwnProperty.call(prop, 'example')) {
        out[key] = prop.example;
        continue;
      }
      if (prop.enum && prop.enum.length) {
        out[key] = prop.enum[0];
        continue;
      }
      if (prop.type === 'boolean') {
        out[key] = true;
        continue;
      }
      if (prop.type === 'integer' || prop.type === 'number') {
        out[key] = prop.minimum == null ? 0 : prop.minimum;
        continue;
      }
      if (prop.type === 'array') {
        out[key] = prop.items ? [buildExample(prop.items, schemasMap)] : [];
        continue;
      }
      if (prop.type === 'object' || prop.properties || prop.$ref) {
        out[key] = buildExample(prop, schemasMap);
        continue;
      }
      if (prop.format === 'date') {
        out[key] = '2026-04-14';
        continue;
      }
      if (prop.format === 'date-time') {
        out[key] = '2026-04-14T09:00:00.000Z';
        continue;
      }
      if (prop.format === 'email') {
        out[key] = 'owner@mksbuilder.local';
        continue;
      }
      if (prop.nullable) {
        out[key] = null;
        continue;
      }
      out[key] = '';
    }
    return out;
  }
  if (Object.prototype.hasOwnProperty.call(resolved, 'example')) return resolved.example;
  return null;
}

function jsonBody(schema, example) {
  return {
    required: true,
    content: {
      'application/json': {
        schema,
        ...(example ? { example } : {}),
      },
    },
  };
}

function multipartBody(schema) {
  return {
    required: true,
    content: {
      'multipart/form-data': { schema },
    },
  };
}

function bothBodies(jsonSchema, jsonExample, formSchema) {
  return {
    required: true,
    content: {
      'application/json': {
        schema: jsonSchema,
        example: jsonExample,
      },
      'multipart/form-data': {
        schema: formSchema,
      },
    },
  };
}

function envelopeSchema(dataSchema, list = false) {
  return {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: 'OK' },
      data: list
        ? { type: 'array', items: dataSchema || {} }
        : (dataSchema || {}),
      meta: {
        type: 'object',
        properties: {
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 20 },
          total: { type: 'integer', example: 1 },
          totalPages: { type: 'integer', example: 1 },
        },
      },
    },
  };
}

function operation(tag, summary, options = {}) {
  const dataSchema = options.data
    ? (typeof options.data === 'string' ? namedRef(options.data) : options.data)
    : undefined;
  const responses = {
    [options.status || '200']: {
      description: 'Envelope: success, message, data, optional meta',
      content: {
        'application/json': {
          schema: envelopeSchema(dataSchema, Boolean(options.list)),
        },
      },
    },
  };
  if (options.auth !== false) responses['401'] = { description: 'Authentication required' };
  if (options.body) responses['422'] = { description: 'Validation failed' };
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
  query('page', { type: 'integer', default: 1, minimum: 1 }),
  query('limit', { type: 'integer', default: 20, minimum: 1, maximum: 100 }),
  query('search', { type: 'string', maxLength: 80 }),
  query('sort', { type: 'string', maxLength: 40 }),
];

const amountLine = schemaObject(
  {
    name: { type: 'string', maxLength: 80, example: 'HRA' },
    amount: money,
  },
  ['name', 'amount']
);

const vehicleDocuments = schemaObject({
  insuranceExpiry: { ...dateString, nullable: true },
  fitnessExpiry: { ...dateString, nullable: true },
  permitExpiry: { ...dateString, nullable: true },
  pollutionExpiry: { ...dateString, nullable: true },
});

const schemas = {
  ApiEnvelope: schemaObject({
    success: { type: 'boolean', example: true },
    message: { type: 'string', example: 'OK' },
    data: {},
    meta: schemaObject({
      page: { type: 'integer' },
      limit: { type: 'integer' },
      total: { type: 'integer' },
      totalPages: { type: 'integer' },
    }),
    code: { type: 'string' },
    requestId: { type: 'string' },
  }),

  RegisterBody: schemaObject(
    {
      name: { type: 'string', maxLength: 120, example: 'Owner' },
      email: { type: 'string', format: 'email', example: 'owner@mksbuilder.local' },
      password: { type: 'string', minLength: 8, maxLength: 128, example: 'ChangeMe123!' },
    },
    ['name', 'email', 'password']
  ),
  LoginBody: schemaObject(
    {
      email: { type: 'string', format: 'email', example: 'owner@mksbuilder.local' },
      password: { type: 'string', minLength: 8, maxLength: 128, example: 'ChangeMe123!' },
    },
    ['email', 'password']
  ),
  ForgotPasswordBody: schemaObject(
    { email: { type: 'string', format: 'email', example: 'owner@mksbuilder.local' } },
    ['email']
  ),
  ResetPasswordBody: schemaObject(
    {
      password: { type: 'string', minLength: 8, maxLength: 128, example: 'NewPass123!' },
      confirmPassword: { type: 'string', minLength: 8, maxLength: 128, example: 'NewPass123!' },
    },
    ['password', 'confirmPassword']
  ),
  ChangePasswordBody: schemaObject(
    {
      currentPassword: { type: 'string', minLength: 8, maxLength: 128, example: 'ChangeMe123!' },
      newPassword: { type: 'string', minLength: 8, maxLength: 128, example: 'NewPass123!' },
      confirmPassword: { type: 'string', minLength: 8, maxLength: 128, example: 'NewPass123!' },
    },
    ['currentPassword', 'newPassword', 'confirmPassword']
  ),
  AvatarUpload: schemaObject(
    { avatar: { type: 'string', format: 'binary', description: 'JPEG, PNG, or WebP up to 2 MB' } },
    ['avatar']
  ),

  DepartmentCreate: schemaObject(
    {
      name: { type: 'string', maxLength: 120, example: 'Civil' },
      description: { type: 'string', maxLength: 500, example: 'Site civil works' },
      isActive: { type: 'boolean', example: true },
    },
    ['name']
  ),
  DepartmentUpdate: schemaObject({
    name: { type: 'string', maxLength: 120 },
    description: { type: 'string', maxLength: 500 },
    isActive: { type: 'boolean' },
  }),

  ProjectCreate: schemaObject(
    {
      name: { type: 'string', maxLength: 120, example: 'Riverfront' },
      clientName: { type: 'string', maxLength: 120, example: 'City Authority' },
      clientPhone: { type: 'string', maxLength: 20, example: '9876543210' },
      description: { type: 'string', maxLength: 2000 },
      status: { type: 'string', enum: PROJECT_STATUS, example: 'active' },
      startDate: dateString,
      expectedEndDate: dateString,
      budgetAmount: money,
      clientAmount: money,
      moneySpent: money,
      address: { type: 'string', maxLength: 300 },
      city: { type: 'string', maxLength: 80 },
      state: { type: 'string', maxLength: 80 },
      pincode: { type: 'string', maxLength: 12 },
    },
    ['name', 'clientName', 'startDate']
  ),
  ProjectUpdate: schemaObject({
    name: { type: 'string', maxLength: 120 },
    clientName: { type: 'string', maxLength: 120 },
    clientPhone: { type: 'string', maxLength: 20, nullable: true },
    description: { type: 'string', maxLength: 2000 },
    status: { type: 'string', enum: PROJECT_STATUS },
    startDate: dateString,
    expectedEndDate: { ...dateString, nullable: true },
    actualEndDate: { ...dateString, nullable: true },
    budgetAmount: { ...money, nullable: true },
    clientAmount: { ...money, nullable: true },
    moneySpent: { ...money, nullable: true },
    address: { type: 'string', maxLength: 300 },
    city: { type: 'string', maxLength: 80 },
    state: { type: 'string', maxLength: 80 },
    pincode: { type: 'string', maxLength: 12, nullable: true },
  }),

  SiteCreate: schemaObject(
    {
      projectId: objectId,
      name: { type: 'string', maxLength: 120, example: 'Tower A' },
      address: { type: 'string', maxLength: 300, example: 'Ring Road' },
      city: { type: 'string', maxLength: 80 },
      state: { type: 'string', maxLength: 80 },
      pincode: { type: 'string', maxLength: 12 },
      status: { type: 'string', enum: SITE_STATUS, example: 'active' },
      inchargeId: objectId,
      startDate: dateString,
      expectedEndDate: dateString,
      notes: { type: 'string', maxLength: 1000 },
    },
    ['projectId', 'name', 'startDate']
  ),
  SiteUpdate: schemaObject({
    name: { type: 'string', maxLength: 120 },
    address: { type: 'string', maxLength: 300 },
    city: { type: 'string', maxLength: 80 },
    state: { type: 'string', maxLength: 80 },
    pincode: { type: 'string', maxLength: 12 },
    status: { type: 'string', enum: SITE_STATUS },
    inchargeId: { ...objectId, nullable: true },
    startDate: dateString,
    expectedEndDate: { ...dateString, nullable: true },
    notes: { type: 'string', maxLength: 1000 },
  }),

  EmployeeSalary: schemaObject(
    {
      payBasis: { type: 'string', enum: PAY_BASIS, example: 'monthly' },
      baseAmount: money,
      allowances: { type: 'array', maxItems: 20, items: amountLine },
    },
    ['baseAmount']
  ),
  EmployeeCreate: schemaObject(
    {
      fullName: { type: 'string', maxLength: 120, example: 'Ravi Kumar' },
      phone: { type: 'string', maxLength: 20, example: '9876543210' },
      email: { type: 'string', format: 'email' },
      address: { type: 'string', maxLength: 300 },
      departmentId: objectId,
      designation: { type: 'string', maxLength: 80, example: 'Mason' },
      employmentType: { type: 'string', enum: EMPLOYMENT_TYPES, example: 'permanent' },
      status: { type: 'string', enum: ['active', 'inactive'], example: 'active' },
      joiningDate: dateString,
      relievingDate: dateString,
      salary: { $ref: '#/components/schemas/EmployeeSalary' },
      notes: { type: 'string', maxLength: 1000 },
      siteId: objectId,
      idType: { type: 'string', maxLength: 40, example: 'Aadhaar' },
      idNumber: { type: 'string', maxLength: 40, example: '123412341234' },
      profilePhoto: { type: 'string', nullable: true },
      idPhotos: { type: 'array', maxItems: 6, items: { type: 'string' } },
      bankName: { type: 'string', maxLength: 120, example: 'State Bank of India' },
      accountNumber: { type: 'string', pattern: '^[0-9]{9,18}$', example: '123456789012' },
      ifscCode: { type: 'string', example: 'SBIN0001234' },
    },
    ['fullName', 'departmentId', 'designation', 'employmentType', 'joiningDate', 'salary']
  ),
  EmployeeCreateForm: schemaObject(
    {
      fullName: { type: 'string', maxLength: 120 },
      phone: { type: 'string' },
      email: { type: 'string', format: 'email' },
      address: { type: 'string' },
      departmentId: objectId,
      designation: { type: 'string' },
      employmentType: { type: 'string', enum: EMPLOYMENT_TYPES },
      status: { type: 'string', enum: ['active', 'inactive'] },
      joiningDate: dateString,
      relievingDate: dateString,
      'salary[baseAmount]': money,
      'salary[payBasis]': { type: 'string', enum: PAY_BASIS },
      baseAmount: money,
      payBasis: { type: 'string', enum: PAY_BASIS },
      notes: { type: 'string' },
      siteId: objectId,
      idType: { type: 'string' },
      idNumber: { type: 'string' },
      bankName: { type: 'string' },
      accountNumber: { type: 'string' },
      ifscCode: { type: 'string' },
      profilePhoto: { type: 'string', format: 'binary' },
      idPhotos: { type: 'string', format: 'binary', description: 'Repeat this key for multiple ID photos' },
    },
    ['fullName', 'departmentId', 'designation', 'employmentType', 'joiningDate']
  ),
  EmployeeUpdate: schemaObject({
    fullName: { type: 'string', maxLength: 120 },
    phone: { type: 'string', maxLength: 20, nullable: true },
    email: { type: 'string', format: 'email', nullable: true },
    address: { type: 'string', maxLength: 300 },
    departmentId: objectId,
    designation: { type: 'string', maxLength: 80 },
    employmentType: { type: 'string', enum: EMPLOYMENT_TYPES },
    status: { type: 'string', enum: EMPLOYEE_STATUS },
    joiningDate: dateString,
    relievingDate: { ...dateString, nullable: true },
    salary: schemaObject({
      payBasis: { type: 'string', enum: PAY_BASIS },
      baseAmount: money,
      allowances: { type: 'array', maxItems: 20, items: amountLine },
    }),
    notes: { type: 'string', maxLength: 1000 },
    idType: { type: 'string', maxLength: 40 },
    idNumber: { type: 'string', maxLength: 40, nullable: true },
    profilePhoto: { type: 'string', nullable: true },
    idPhotos: { type: 'array', maxItems: 6, items: { type: 'string' } },
    bankName: { type: 'string', maxLength: 120 },
    accountNumber: { type: 'string', nullable: true },
    ifscCode: { type: 'string', nullable: true },
  }),
  EmployeeAssign: schemaObject(
    {
      siteId: objectId,
      startDate: dateString,
      remarks: { type: 'string', maxLength: 300 },
    },
    ['siteId']
  ),
  EmployeeRelease: schemaObject({
    endDate: dateString,
  }),

  AttendanceMark: schemaObject(
    {
      employeeId: objectId,
      date: dateString,
      status: { type: 'string', enum: ATTENDANCE_STATUS, example: 'present' },
      projectId: objectId,
      siteId: objectId,
      checkIn: { type: 'string', example: '09:00' },
      checkOut: { type: 'string', example: '18:00' },
      overtimeHours: { type: 'number', minimum: 0, example: 1 },
      remarks: { type: 'string', maxLength: 300 },
    },
    ['employeeId', 'date', 'status']
  ),
  AttendanceBulk: schemaObject(
    {
      date: dateString,
      projectId: objectId,
      siteId: objectId,
      entries: {
        type: 'array',
        minItems: 1,
        maxItems: 200,
        items: schemaObject(
          {
            employeeId: objectId,
            status: { type: 'string', enum: ATTENDANCE_STATUS },
            projectId: objectId,
            siteId: objectId,
            checkIn: { type: 'string' },
            checkOut: { type: 'string' },
            overtimeHours: { type: 'number', minimum: 0 },
            remarks: { type: 'string' },
          },
          ['employeeId', 'status']
        ),
      },
    },
    ['date', 'entries']
  ),
  AttendanceUpdate: schemaObject({
    date: dateString,
    status: { type: 'string', enum: ATTENDANCE_STATUS },
    projectId: { ...objectId, nullable: true },
    siteId: { ...objectId, nullable: true },
    checkIn: { type: 'string', nullable: true },
    checkOut: { type: 'string', nullable: true },
    overtimeHours: { type: 'number', minimum: 0 },
    remarks: { type: 'string', maxLength: 300 },
  }),

  ItemCreate: schemaObject(
    {
      sku: { type: 'string', maxLength: 40 },
      name: { type: 'string', maxLength: 120, example: 'Cement OPC 53' },
      category: { type: 'string', maxLength: 40, example: 'Material' },
      unit: { type: 'string', enum: UNITS, example: 'bag' },
      reorderLevel: { type: 'number', minimum: 0, example: 50 },
      description: { type: 'string', maxLength: 500 },
      isActive: { type: 'boolean', example: true },
    },
    ['name', 'category', 'unit']
  ),
  ItemUpdate: schemaObject({
    sku: { type: 'string', maxLength: 40 },
    name: { type: 'string', maxLength: 120 },
    category: { type: 'string', maxLength: 40 },
    unit: { type: 'string', enum: UNITS },
    reorderLevel: { type: 'number', minimum: 0 },
    description: { type: 'string', maxLength: 500 },
    isActive: { type: 'boolean' },
  }),
  LocationCreate: schemaObject(
    {
      name: { type: 'string', maxLength: 120, example: 'Main store' },
      type: { type: 'string', enum: STOCK_LOCATION_TYPES, example: 'central_store' },
      siteId: objectId,
      isActive: { type: 'boolean', example: true },
    },
    ['name', 'type']
  ),
  LocationUpdate: schemaObject({
    name: { type: 'string', maxLength: 120 },
    isActive: { type: 'boolean' },
  }),
  MovementCreate: schemaObject(
    {
      type: { type: 'string', enum: MOVEMENT_TYPES, example: 'issue' },
      itemId: objectId,
      quantity,
      direction: { type: 'string', enum: ADJUSTMENT_DIRECTIONS },
      fromLocationId: objectId,
      toLocationId: objectId,
      projectId: objectId,
      siteId: objectId,
      employeeId: objectId,
      vehicleTypeId: objectId,
      unitCost: money,
      vendorName: { type: 'string', maxLength: 120 },
      condition: { type: 'string', enum: MATERIAL_CONDITIONS },
      billNo: { type: 'string', maxLength: 80 },
      challanNo: { type: 'string', maxLength: 80 },
      materialReceiptPhoto: { type: 'string', maxLength: 500, nullable: true },
      paymentMode: { type: 'string', enum: PAYMENT_MODE_NOTES },
      address: { type: 'string', maxLength: 300 },
      movementDate: dateString,
      reference: { type: 'string', maxLength: 80 },
      remarks: { type: 'string', maxLength: 500 },
    },
    ['type', 'itemId', 'quantity']
  ),
  MovementUpdate: schemaObject({
    quantity,
    direction: { type: 'string', enum: ADJUSTMENT_DIRECTIONS },
    fromLocationId: { ...objectId, nullable: true },
    toLocationId: { ...objectId, nullable: true },
    projectId: { ...objectId, nullable: true },
    siteId: { ...objectId, nullable: true },
    employeeId: { ...objectId, nullable: true },
    vehicleTypeId: { ...objectId, nullable: true },
    unitCost: { ...money, nullable: true },
    vendorName: { type: 'string', maxLength: 120 },
    condition: { type: 'string', enum: MATERIAL_CONDITIONS },
    billNo: { type: 'string', maxLength: 80 },
    challanNo: { type: 'string', maxLength: 80 },
    materialReceiptPhoto: { type: 'string', maxLength: 500, nullable: true },
    paymentMode: { type: 'string', enum: PAYMENT_MODE_NOTES },
    address: { type: 'string', maxLength: 300 },
    movementDate: dateString,
    reference: { type: 'string', maxLength: 80 },
    remarks: { type: 'string', maxLength: 500 },
  }),

  VehicleCreate: schemaObject(
    {
      registrationNumber: { type: 'string', maxLength: 20, example: 'UP32 AB 2002' },
      type: { type: 'string', maxLength: 40, example: 'Tipper' },
      make: { type: 'string', maxLength: 80, example: 'Tata' },
      modelName: { type: 'string', maxLength: 80, example: 'Signa' },
      year: { type: 'integer', minimum: 1980, maximum: 2100, example: 2022 },
      fuelType: { type: 'string', enum: FUEL_TYPES, example: 'diesel' },
      odometer: { type: 'number', minimum: 0, example: 12000 },
      documents: vehicleDocuments,
      notes: { type: 'string', maxLength: 1000 },
      siteId: objectId,
      driverId: objectId,
      assignedAt: dateTimeString,
      remarks: { type: 'string', maxLength: 300 },
    },
    ['registrationNumber', 'type']
  ),
  VehicleUpdate: schemaObject({
    registrationNumber: { type: 'string', maxLength: 20 },
    type: { type: 'string', maxLength: 40 },
    make: { type: 'string', maxLength: 80 },
    modelName: { type: 'string', maxLength: 80 },
    year: { type: 'integer', minimum: 1980, maximum: 2100 },
    fuelType: { type: 'string', enum: FUEL_TYPES },
    status: { type: 'string', enum: ['available', 'inactive'] },
    odometer: { type: 'number', minimum: 0 },
    documents: vehicleDocuments,
    notes: { type: 'string', maxLength: 1000 },
  }),
  VehicleAssign: schemaObject(
    {
      siteId: objectId,
      driverId: objectId,
      assignedAt: dateTimeString,
      remarks: { type: 'string', maxLength: 300 },
    },
    ['siteId']
  ),
  VehicleRelease: schemaObject({
    releasedAt: dateTimeString,
    remarks: { type: 'string', maxLength: 300 },
  }),
  MaintenanceCategoryCreate: schemaObject(
    {
      name: { type: 'string', maxLength: 120, example: 'Engine service' },
      description: { type: 'string', maxLength: 500, example: 'Oil, filter, and engine checks' },
      status: { type: 'string', enum: MAINTENANCE_CATEGORY_STATUS, example: 'active' },
    },
    ['name']
  ),
  MaintenanceCategoryUpdate: schemaObject({
    name: { type: 'string', maxLength: 120 },
    description: { type: 'string', maxLength: 500 },
    status: { type: 'string', enum: MAINTENANCE_CATEGORY_STATUS },
  }),
  MaintenanceCreate: schemaObject(
    {
      maintenanceCategoryId: objectId,
      paidTo: { type: 'string', maxLength: 120, example: 'Sharma Motors' },
      date: dateString,
      amount: money,
      modeOfPayment: { type: 'string', enum: PAYMENT_MODE_NOTES, example: 'cash' },
      reference: { type: 'string', maxLength: 80, example: 'BILL-1024' },
      uploadReceipt: { type: 'string', maxLength: 500 },
      description: { type: 'string', minLength: 3, maxLength: 500, example: 'Engine oil change' },
      nextDueDate: dateString,
      recordExpense: { type: 'boolean', example: true },
      payeeName: { type: 'string', maxLength: 120 },
      paymentModeNote: { type: 'string', enum: PAYMENT_MODE_NOTES },
    },
    ['maintenanceCategoryId', 'paidTo', 'amount', 'modeOfPayment']
  ),
  MaintenanceCreateForm: schemaObject(
    {
      maintenanceCategoryId: objectId,
      paidTo: { type: 'string', maxLength: 120 },
      date: dateString,
      amount: money,
      modeOfPayment: { type: 'string', enum: PAYMENT_MODE_NOTES },
      reference: { type: 'string', maxLength: 80 },
      description: { type: 'string', minLength: 3, maxLength: 500 },
      nextDueDate: dateString,
      recordExpense: { type: 'boolean' },
      payeeName: { type: 'string', maxLength: 120 },
      paymentModeNote: { type: 'string', enum: PAYMENT_MODE_NOTES },
      uploadReceipt: { type: 'string', format: 'binary', description: 'JPEG, PNG, WebP, or PDF up to 5 MB' },
    },
    ['maintenanceCategoryId', 'paidTo', 'amount', 'modeOfPayment']
  ),
  MaintenanceUpdate: schemaObject({
    maintenanceCategoryId: objectId,
    paidTo: { type: 'string', maxLength: 120 },
    date: dateString,
    amount: money,
    modeOfPayment: { type: 'string', enum: PAYMENT_MODE_NOTES },
    reference: { type: 'string', maxLength: 80 },
    uploadReceipt: { type: 'string', maxLength: 500 },
    description: { type: 'string', minLength: 3, maxLength: 500 },
    nextDueDate: { ...dateString, nullable: true },
    recordExpense: { type: 'boolean' },
    payeeName: { type: 'string', maxLength: 120 },
    paymentModeNote: { type: 'string', enum: PAYMENT_MODE_NOTES },
  }),
  MaintenanceComplete: schemaObject({
    completedAt: dateString,
    completionNote: { type: 'string', maxLength: 500, example: 'Done' },
  }),
  FuelCreate: schemaObject(
    {
      loggedAt: dateTimeString,
      liters: quantity,
      amount: positiveMoney,
      odometer: { type: 'number', minimum: 0, example: 12500 },
      siteId: objectId,
      remarks: { type: 'string', maxLength: 300 },
      recordExpense: { type: 'boolean', example: true },
      payeeName: { type: 'string', maxLength: 120 },
      paymentModeNote: { type: 'string', enum: PAYMENT_MODE_NOTES },
    },
    ['liters', 'amount']
  ),

  SalaryCreate: schemaObject(
    {
      employeeId: objectId,
      projectId: objectId,
      siteId: objectId,
      periodMonth: { type: 'integer', minimum: 1, maximum: 12, example: 4 },
      periodYear: { type: 'integer', minimum: 2000, maximum: 2100, example: 2026 },
      payBasis: { type: 'string', enum: PAY_BASIS, example: 'monthly' },
      baseAmount: money,
      allowances: { type: 'array', maxItems: 20, items: amountLine },
      deductions: { type: 'array', maxItems: 20, items: amountLine },
      extras: { type: 'array', maxItems: 20, items: amountLine },
      amountPaid: money,
      recordStatus: { type: 'string', enum: SALARY_RECORD_STATUS },
      remarks: { type: 'string', maxLength: 500 },
    },
    ['employeeId', 'periodMonth', 'periodYear', 'baseAmount']
  ),
  SalaryUpdate: schemaObject({
    projectId: { ...objectId, nullable: true },
    siteId: { ...objectId, nullable: true },
    periodMonth: { type: 'integer', minimum: 1, maximum: 12 },
    periodYear: { type: 'integer', minimum: 2000, maximum: 2100 },
    payBasis: { type: 'string', enum: PAY_BASIS },
    baseAmount: money,
    allowances: { type: 'array', maxItems: 20, items: amountLine },
    deductions: { type: 'array', maxItems: 20, items: amountLine },
    extras: { type: 'array', maxItems: 20, items: amountLine },
    amountPaid: money,
    recordStatus: { type: 'string', enum: SALARY_RECORD_STATUS },
    remarks: { type: 'string', maxLength: 500 },
  }),
  ExpenseCreate: schemaObject(
    {
      category: { type: 'string', enum: EXPENSE_CATEGORIES, example: 'vehicle' },
      amount: positiveMoney,
      expenseDate: dateString,
      description: { type: 'string', minLength: 3, maxLength: 500, example: 'Cement purchase' },
      payeeName: { type: 'string', maxLength: 120 },
      employeeId: objectId,
      projectId: objectId,
      siteId: objectId,
      vehicleId: objectId,
      itemId: objectId,
      referenceNo: { type: 'string', maxLength: 80 },
      paymentModeNote: { type: 'string', enum: PAYMENT_MODE_NOTES, example: 'bank_transfer' },
    },
    ['category', 'amount', 'description']
  ),
  ExpenseUpdate: schemaObject({
    category: { type: 'string', enum: EXPENSE_CATEGORIES },
    amount: positiveMoney,
    expenseDate: dateString,
    description: { type: 'string', minLength: 3, maxLength: 500 },
    payeeName: { type: 'string', maxLength: 120 },
    employeeId: objectId,
    projectId: objectId,
    siteId: objectId,
    vehicleId: objectId,
    itemId: objectId,
    referenceNo: { type: 'string', maxLength: 80 },
    paymentModeNote: { type: 'string', enum: PAYMENT_MODE_NOTES },
  }),
  AdvanceCreate: schemaObject(
    {
      employeeId: objectId,
      monthlySalary: money,
      requestDate: dateString,
      advanceAmount: { ...positiveMoney, example: 5000 },
      reasonForAdvance: { type: 'string', maxLength: 500, example: 'Festival advance' },
      attachment: { type: 'string', maxLength: 500, nullable: true },
      employeeRemarks: { type: 'string', maxLength: 500 },
    },
    ['employeeId', 'advanceAmount', 'reasonForAdvance']
  ),
  AdvanceUpdate: schemaObject({
    employeeId: objectId,
    monthlySalary: money,
    requestDate: dateString,
    advanceAmount: positiveMoney,
    reasonForAdvance: { type: 'string', maxLength: 500 },
    attachment: { type: 'string', maxLength: 500, nullable: true },
    employeeRemarks: { type: 'string', maxLength: 500 },
  }),
  AdvanceRecover: schemaObject(
    {
      amount: { ...positiveMoney, example: 2000 },
      remarks: { type: 'string', maxLength: 300 },
    },
    ['amount']
  ),
  VoidBody: schemaObject(
    {
      reason: { type: 'string', minLength: 5, maxLength: 300, example: 'Duplicate entry removed' },
    },
    ['reason']
  ),

  // Response / model schemas for frontend
  NamedRef: modelSchema({
    id: objectId,
    name: { type: 'string' },
    code: { type: 'string' },
  }),
  Department: modelSchema({
    id: objectId,
    code: { type: 'string', example: 'DEP-0001' },
    name: { type: 'string', example: 'Civil' },
    description: { type: 'string' },
    isActive: { type: 'boolean', example: true },
    activeEmployeeCount: { type: 'integer', example: 4 },
    createdAt: dateTimeString,
    updatedAt: dateTimeString,
  }),
  Project: modelSchema({
    id: objectId,
    code: { type: 'string', example: 'PRJ-0001' },
    name: { type: 'string', example: 'Riverfront' },
    clientName: { type: 'string' },
    clientPhone: { type: 'string' },
    description: { type: 'string' },
    status: { type: 'string', enum: PROJECT_STATUS },
    startDate: dateString,
    expectedEndDate: { ...dateString, nullable: true },
    actualEndDate: { ...dateString, nullable: true },
    budgetAmount: money,
    clientAmount: money,
    clientPendingAmount: money,
    moneySpent: money,
    currency: { type: 'string', example: 'INR' },
    address: { type: 'string' },
    city: { type: 'string' },
    state: { type: 'string' },
    pincode: { type: 'string' },
    createdAt: dateTimeString,
    updatedAt: dateTimeString,
  }),
  Site: modelSchema({
    id: objectId,
    project: namedRef('NamedRef'),
    code: { type: 'string', example: 'STE-0001' },
    name: { type: 'string', example: 'Tower A' },
    address: { type: 'string' },
    status: { type: 'string', enum: SITE_STATUS },
    incharge: {
      type: 'object',
      nullable: true,
      properties: {
        id: objectId,
        fullName: { type: 'string' },
        code: { type: 'string' },
        designation: { type: 'string' },
        status: { type: 'string' },
      },
    },
    startDate: dateString,
    expectedEndDate: { ...dateString, nullable: true },
    notes: { type: 'string' },
    createdAt: dateTimeString,
    updatedAt: dateTimeString,
  }),
  Employee: modelSchema({
    id: objectId,
    code: { type: 'string', example: 'EMP-0001' },
    fullName: { type: 'string', example: 'Ravi Kumar' },
    phone: { type: 'string', nullable: true },
    email: { type: 'string', format: 'email', nullable: true },
    address: { type: 'string' },
    department: {
      type: 'object',
      properties: {
        id: objectId,
        name: { type: 'string' },
        code: { type: 'string' },
        isActive: { type: 'boolean' },
      },
    },
    designation: { type: 'string' },
    idType: { type: 'string' },
    idNumber: { type: 'string', nullable: true },
    profilePhoto: { type: 'string', nullable: true, example: 'http://localhost:4000/uploads/employees/photo.png' },
    idPhotos: { type: 'array', items: { type: 'string' } },
    bankName: { type: 'string' },
    accountNumber: { type: 'string' },
    ifscCode: { type: 'string' },
    employmentType: { type: 'string', enum: EMPLOYMENT_TYPES },
    status: { type: 'string', enum: EMPLOYEE_STATUS },
    joiningDate: dateString,
    relievingDate: { ...dateString, nullable: true },
    salary: namedRef('EmployeeSalary'),
    notes: { type: 'string' },
    currentAssignments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: objectId,
          site: namedRef('NamedRef'),
          project: namedRef('NamedRef'),
          startDate: dateString,
          endDate: { ...dateString, nullable: true },
        },
      },
    },
    createdAt: dateTimeString,
    updatedAt: dateTimeString,
  }),
  Vehicle: modelSchema({
    id: objectId,
    code: { type: 'string', example: 'VEH-0001' },
    registrationNumber: { type: 'string', example: 'UP32 AB 2002' },
    type: { type: 'string', example: 'Tipper' },
    make: { type: 'string' },
    modelName: { type: 'string' },
    year: { type: 'integer' },
    fuelType: { type: 'string', enum: FUEL_TYPES },
    status: { type: 'string', enum: VEHICLE_STATUS },
    currentAssignment: { type: 'object', nullable: true },
    odometer: { type: 'number' },
    documents: vehicleDocuments,
    notes: { type: 'string' },
    createdAt: dateTimeString,
    updatedAt: dateTimeString,
  }),
  VehicleAssignment: modelSchema({
    id: objectId,
    vehicle: {
      type: 'object',
      properties: {
        id: objectId,
        code: { type: 'string' },
        registrationNumber: { type: 'string' },
        type: { type: 'string' },
        make: { type: 'string' },
        modelName: { type: 'string' },
        status: { type: 'string', enum: VEHICLE_STATUS },
      },
    },
    site: {
      type: 'object',
      properties: {
        id: objectId,
        name: { type: 'string' },
        code: { type: 'string' },
        status: { type: 'string' },
      },
    },
    driver: {
      type: 'object',
      nullable: true,
      properties: {
        id: objectId,
        fullName: { type: 'string' },
        code: { type: 'string' },
        designation: { type: 'string' },
      },
    },
    assignedAt: dateTimeString,
    releasedAt: { ...dateTimeString, nullable: true },
    remarks: { type: 'string' },
    createdAt: dateTimeString,
    updatedAt: dateTimeString,
  }),
  MaintenanceCategory: modelSchema({
    id: objectId,
    name: { type: 'string' },
    description: { type: 'string' },
    status: { type: 'string', enum: MAINTENANCE_CATEGORY_STATUS },
    createdAt: dateTimeString,
    updatedAt: dateTimeString,
  }),
  Maintenance: modelSchema({
    id: objectId,
    vehicle: {
      type: 'object',
      properties: {
        id: objectId,
        code: { type: 'string' },
        registrationNumber: { type: 'string' },
        type: { type: 'string' },
        make: { type: 'string' },
        modelName: { type: 'string' },
        status: { type: 'string' },
      },
    },
    maintenanceCategory: namedRef('MaintenanceCategory'),
    paidTo: { type: 'string' },
    date: dateString,
    amount: money,
    modeOfPayment: { type: 'string', enum: PAYMENT_MODE_NOTES },
    reference: { type: 'string' },
    uploadReceipt: { type: 'string', nullable: true },
    description: { type: 'string' },
    nextDueDate: { ...dateString, nullable: true },
    completedAt: { ...dateTimeString, nullable: true },
    completionNote: { type: 'string' },
    createdAt: dateTimeString,
    updatedAt: dateTimeString,
  }),
  FuelLog: modelSchema({
    id: objectId,
    vehicle: objectId,
    loggedAt: dateTimeString,
    liters: quantity,
    amount: money,
    odometer: { type: 'number' },
    site: namedRef('NamedRef'),
    remarks: { type: 'string' },
    expense: { ...objectId, nullable: true },
    createdAt: dateTimeString,
    updatedAt: dateTimeString,
  }),
  InventoryItem: modelSchema({
    id: objectId,
    code: { type: 'string' },
    sku: { type: 'string' },
    name: { type: 'string' },
    category: { type: 'string' },
    unit: { type: 'string', enum: UNITS },
    reorderLevel: { type: 'number' },
    description: { type: 'string' },
    isActive: { type: 'boolean' },
    onHand: { type: 'number' },
    createdAt: dateTimeString,
    updatedAt: dateTimeString,
  }),
  StockLocation: modelSchema({
    id: objectId,
    code: { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string', enum: STOCK_LOCATION_TYPES },
    site: namedRef('NamedRef'),
    isSystem: { type: 'boolean' },
    isActive: { type: 'boolean' },
    createdAt: dateTimeString,
    updatedAt: dateTimeString,
  }),
  StockMovement: modelSchema({
    id: objectId,
    code: { type: 'string' },
    type: { type: 'string', enum: MOVEMENT_TYPES },
    item: { type: 'object' },
    quantity: quantity,
    fromLocation: { type: 'object', nullable: true },
    toLocation: { type: 'object', nullable: true },
    project: namedRef('NamedRef'),
    site: namedRef('NamedRef'),
    employee: { type: 'object', nullable: true },
    vendorName: { type: 'string' },
    condition: { type: 'string', enum: MATERIAL_CONDITIONS },
    billNo: { type: 'string' },
    challanNo: { type: 'string' },
    paymentMode: { type: 'string', enum: PAYMENT_MODE_NOTES },
    movementDate: dateString,
    remarks: { type: 'string' },
    createdAt: dateTimeString,
    updatedAt: dateTimeString,
  }),
  Expense: modelSchema({
    id: objectId,
    code: { type: 'string', example: 'EXP-0001' },
    category: { type: 'string', enum: EXPENSE_CATEGORIES },
    amount: money,
    expenseDate: dateString,
    description: { type: 'string' },
    payeeName: { type: 'string' },
    employee: { type: 'object', nullable: true },
    project: namedRef('NamedRef'),
    site: namedRef('NamedRef'),
    vehicle: {
      type: 'object',
      nullable: true,
      properties: {
        id: objectId,
        registrationNumber: { type: 'string' },
        code: { type: 'string' },
      },
    },
    item: { type: 'object', nullable: true },
    referenceNo: { type: 'string' },
    paymentModeNote: { type: 'string', enum: PAYMENT_MODE_NOTES },
    isVoid: { type: 'boolean' },
    voidReason: { type: 'string' },
    voidedAt: { ...dateTimeString, nullable: true },
    createdAt: dateTimeString,
    updatedAt: dateTimeString,
  }),
  SalaryRecord: modelSchema({
    id: objectId,
    code: { type: 'string' },
    employee: { type: 'object' },
    project: namedRef('NamedRef'),
    site: namedRef('NamedRef'),
    periodMonth: { type: 'integer' },
    periodYear: { type: 'integer' },
    payBasis: { type: 'string', enum: PAY_BASIS },
    baseAmount: money,
    allowances: { type: 'array', items: amountLine },
    deductions: { type: 'array', items: amountLine },
    extras: { type: 'array', items: amountLine },
    grossAmount: money,
    totalDeductions: money,
    totalExtras: money,
    netAmount: money,
    amountPaid: money,
    balanceAmount: { type: 'number' },
    outstandingAmount: money,
    overpaidAmount: money,
    recordStatus: { type: 'string', enum: SALARY_RECORD_STATUS },
    remarks: { type: 'string' },
    isVoid: { type: 'boolean' },
    createdAt: dateTimeString,
    updatedAt: dateTimeString,
  }),
  AuthUser: modelSchema({
    id: objectId,
    name: { type: 'string' },
    email: { type: 'string', format: 'email' },
    role: { type: 'string', example: 'admin' },
    avatar: { type: 'string', nullable: true },
  }),
  AuthSession: modelSchema({
    token: { type: 'string' },
    user: namedRef('AuthUser'),
  }),
  Attendance: modelSchema({
    id: objectId,
    employee: { type: 'object' },
    project: namedRef('NamedRef'),
    site: namedRef('NamedRef'),
    attendanceDate: dateString,
    status: { type: 'string', enum: ATTENDANCE_STATUS },
    checkIn: { type: 'string', nullable: true },
    checkOut: { type: 'string', nullable: true },
    overtimeHours: { type: 'number' },
    remarks: { type: 'string' },
    createdAt: dateTimeString,
    updatedAt: dateTimeString,
  }),
  Advance: modelSchema({
    id: objectId,
    code: { type: 'string', example: 'ADV-0001' },
    employee: {
      type: 'object',
      properties: {
        id: objectId,
        fullName: { type: 'string' },
        code: { type: 'string' },
        designation: { type: 'string' },
      },
    },
    department: namedRef('NamedRef'),
    monthlySalary: money,
    requestDate: dateString,
    advanceAmount: money,
    recoveredAmount: money,
    pendingAmount: money,
    reasonForAdvance: { type: 'string' },
    attachment: { type: 'string', nullable: true },
    employeeRemarks: { type: 'string' },
    recoveries: {
      type: 'array',
      items: schemaObject({
        amount: money,
        recoveredAt: dateTimeString,
        remarks: { type: 'string' },
      }),
    },
    isVoid: { type: 'boolean' },
    voidReason: { type: 'string' },
    voidedAt: { ...dateTimeString, nullable: true },
    createdAt: dateTimeString,
    updatedAt: dateTimeString,
  }),
  EmployeeAssignment: modelSchema({
    id: objectId,
    employee: objectId,
    site: namedRef('NamedRef'),
    project: namedRef('NamedRef'),
    startDate: dateString,
    endDate: { ...dateString, nullable: true },
    remarks: { type: 'string' },
    createdAt: dateTimeString,
    updatedAt: dateTimeString,
  }),
};

const ref = (name) => namedRef(name);

function finalizeSpec(document) {
  const schemasMap = document.components.schemas;
  for (const pathItem of Object.values(document.paths || {})) {
    for (const op of Object.values(pathItem || {})) {
      if (!op || typeof op !== 'object') continue;

      if (op.requestBody && op.requestBody.content) {
        for (const media of Object.values(op.requestBody.content)) {
          if (!media || !media.schema) continue;
          media.schema = resolveSchema(media.schema, schemasMap);
          if (!media.example) {
            media.example = buildExample(media.schema, schemasMap);
          } else {
            media.example = {
              ...buildExample(media.schema, schemasMap),
              ...media.example,
            };
          }
        }
      }

      for (const response of Object.values(op.responses || {})) {
        const appJson = response && response.content && response.content['application/json'];
        if (!appJson || !appJson.schema) continue;
        appJson.schema = resolveSchema(appJson.schema, schemasMap);
        if (!appJson.example) {
          appJson.example = buildExample(appJson.schema, schemasMap);
        }
      }
    }
  }
  return document;
}

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'MKS Construction ERP API',
    version: '1.0.0',
    description:
      'Projects, people, stock, vehicles, attendance, and salary/expense records. Amounts are INR. Accounts record ledgers and do not transfer money. Request bodies below list every accepted JSON field.',
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
        data: 'AuthSession',
        body: jsonBody(ref('RegisterBody'), {
          name: 'Owner',
          email: 'owner@mksbuilder.local',
          password: 'ChangeMe123!',
        }),
      }),
    },
    '/auth/login': {
      post: operation('Auth', 'Log in', {
        auth: false,
        data: 'AuthSession',
        body: jsonBody(ref('LoginBody'), {
          email: 'owner@mksbuilder.local',
          password: 'ChangeMe123!',
        }),
      }),
    },
    '/auth/forgot-password': {
      post: operation('Auth', 'Email a reset link', {
        auth: false,
        body: jsonBody(ref('ForgotPasswordBody'), { email: 'owner@mksbuilder.local' }),
      }),
    },
    '/auth/reset-password/{token}': {
      post: operation('Auth', 'Reset password with the email token', {
        auth: false,
        parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string', minLength: 32 } }],
        body: jsonBody(ref('ResetPasswordBody'), {
          password: 'NewPass123!',
          confirmPassword: 'NewPass123!',
        }),
      }),
    },
    '/auth/me': {
      get: operation('Auth', 'Current profile'),
    },
    '/auth/avatar': {
      post: operation('Auth', 'Upload a profile photo', {
        body: multipartBody(ref('AvatarUpload')),
      }),
    },
    '/auth/logout': {
      post: operation('Auth', 'Log out and invalidate the current token'),
    },
    '/auth/change-password': {
      post: operation('Auth', 'Change the current password', {
        body: jsonBody(ref('ChangePasswordBody'), {
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
      get: operation('Departments', 'List departments', { parameters: paging, data: 'Department', list: true }),
    },
    '/departments/create': {
      post: operation('Departments', 'Create a department', {
        status: '201',
        data: 'Department',
        body: jsonBody(ref('DepartmentCreate'), {
          name: 'Civil',
          description: 'Site civil works',
          isActive: true,
        }),
      }),
    },
    '/departments/get-by-id/{id}': {
      get: operation('Departments', 'Get a department', { parameters: [pathParam()], data: 'Department' }),
    },
    '/departments/update/{id}': {
      patch: operation('Departments', 'Update a department', {
        parameters: [pathParam()],
        data: 'Department',
        body: jsonBody(ref('DepartmentUpdate'), { name: 'Civil', isActive: true }),
      }),
    },
    '/departments/remove/{id}': {
      delete: operation('Departments', 'Delete a department', { parameters: [pathParam()] }),
    },
    '/projects': {
      get: operation('Projects', 'List projects', {
        parameters: [...paging, query('status', { type: 'string', enum: PROJECT_STATUS })],
        data: 'Project',
        list: true,
      }),
    },
    '/projects/create': {
      post: operation('Projects', 'Create a project', {
        status: '201',
        data: 'Project',
        body: jsonBody(ref('ProjectCreate'), {
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
      get: operation('Projects', 'Get a project', { parameters: [pathParam()], data: 'Project' }),
    },
    '/projects/update/{id}': {
      patch: operation('Projects', 'Update a project', {
        parameters: [pathParam()],
        data: 'Project',
        body: jsonBody(ref('ProjectUpdate'), { moneySpent: 850000, clientAmount: 2000000 }),
      }),
    },
    '/projects/delete/{id}': {
      delete: operation('Projects', 'Delete a project', { parameters: [pathParam()] }),
    },
    '/sites': {
      get: operation('Sites', 'List sites', {
        parameters: [...paging, query('projectId', objectId), query('status', { type: 'string', enum: SITE_STATUS })],
        data: 'Site',
        list: true,
      }),
    },
    '/sites/create': {
      post: operation('Sites', 'Create a site', {
        status: '201',
        data: 'Site',
        body: jsonBody(ref('SiteCreate'), {
          projectId: '64b0c0c0c0c0c0c0c0c0c0c0',
          name: 'Tower A',
          address: 'Ring Road',
          startDate: '2026-04-01',
          status: 'active',
        }),
      }),
    },
    '/sites/{id}': {
      get: operation('Sites', 'Get a site', { parameters: [pathParam()], data: 'Site' }),
    },
    '/sites/update/{id}': {
      patch: operation('Sites', 'Update a site', {
        parameters: [pathParam()],
        data: 'Site',
        body: jsonBody(ref('SiteUpdate'), { name: 'Tower A', status: 'active' }),
      }),
    },
    '/sites/delete/{id}': {
      delete: operation('Sites', 'Delete a site', { parameters: [pathParam()] }),
    },
    '/employees': {
      get: operation('Employees', 'List employees', {
        parameters: [
          ...paging,
          query('departmentId', objectId),
          query('siteId', objectId),
          query('status', { type: 'string', enum: EMPLOYEE_STATUS }),
          query('employmentType', { type: 'string', enum: EMPLOYMENT_TYPES }),
        ],
        data: 'Employee',
        list: true,
      }),
    },
    '/employees/create': {
      post: operation('Employees', 'Create an employee', {
        status: '201',
        data: 'Employee',
        body: bothBodies(
          ref('EmployeeCreate'),
          {
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
          },
          ref('EmployeeCreateForm')
        ),
      }),
    },
    '/employees/{id}': {
      get: operation('Employees', 'Get an employee', { parameters: [pathParam()], data: 'Employee' }),
      delete: operation('Employees', 'Delete an employee', { parameters: [pathParam()] }),
    },
    '/employees/update/{id}': {
      patch: operation('Employees', 'Update an employee', {
        parameters: [pathParam()],
        data: 'Employee',
        body: bothBodies(
          ref('EmployeeUpdate'),
          { designation: 'Senior mason', phone: '9876543210' },
          ref('EmployeeCreateForm')
        ),
      }),
    },
    '/employees/{id}/assignments': {
      get: operation('Employees', 'List site assignments', {
        parameters: [pathParam()],
        data: 'EmployeeAssignment',
        list: true,
      }),
      post: operation('Employees', 'Assign an employee to a site', {
        parameters: [pathParam()],
        data: 'EmployeeAssignment',
        body: jsonBody(ref('EmployeeAssign'), {
          siteId: '64b0c0c0c0c0c0c0c0c0c0c0',
          startDate: '2026-04-14',
        }),
      }),
    },
    '/employees/{id}/assignments/{assignmentId}/release': {
      post: operation('Employees', 'Release an employee from a site', {
        parameters: [pathParam(), pathParam('assignmentId')],
        data: 'EmployeeAssignment',
        body: jsonBody(ref('EmployeeRelease'), { endDate: '2026-04-20' }),
      }),
    },
    '/attendance/register': {
      get: operation('Attendance', 'Daily attendance register', {
        parameters: [
          query('date', dateString, 'Required'),
          query('departmentId', objectId),
          query('siteId', objectId),
        ],
        data: 'Attendance',
        list: true,
      }),
    },
    '/attendance/summary': {
      get: operation('Attendance', 'Attendance summary', {
        parameters: [
          query('from', dateString),
          query('to', dateString),
          query('employeeId', objectId),
        ],
      }),
    },
    '/attendance': {
      get: operation('Attendance', 'List attendance', {
        parameters: [
          ...paging,
          query('date', dateString),
          query('from', dateString),
          query('to', dateString),
          query('employeeId', objectId),
          query('status', { type: 'string', enum: ATTENDANCE_STATUS }),
        ],
        data: 'Attendance',
        list: true,
      }),
      post: operation('Attendance', 'Mark attendance', {
        status: '201',
        data: 'Attendance',
        body: jsonBody(ref('AttendanceMark'), {
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
        data: 'Attendance',
        list: true,
        body: jsonBody(ref('AttendanceBulk'), {
          date: '2026-04-14',
          entries: [
            {
              employeeId: '64b0c0c0c0c0c0c0c0c0c0c0',
              status: 'present',
              checkIn: '09:00',
              checkOut: '18:00',
            },
          ],
        }),
      }),
    },
    '/attendance/{id}': {
      get: operation('Attendance', 'Get one attendance record', { parameters: [pathParam()], data: 'Attendance' }),
      patch: operation('Attendance', 'Update attendance', {
        parameters: [pathParam()],
        data: 'Attendance',
        body: jsonBody(ref('AttendanceUpdate'), {
          status: 'half_day',
          checkOut: '13:00',
          overtimeHours: 0,
        }),
      }),
      delete: operation('Attendance', 'Delete an attendance record', { parameters: [pathParam()] }),
    },
    '/inventory/items': {
      get: operation('Inventory', 'List items', { parameters: paging, data: 'InventoryItem', list: true }),
      post: operation('Inventory', 'Create an item', {
        status: '201',
        data: 'InventoryItem',
        body: jsonBody(ref('ItemCreate'), {
          name: 'Cement OPC 53',
          category: 'Material',
          unit: 'bag',
          reorderLevel: 50,
        }),
      }),
    },
    '/inventory/items/{id}': {
      get: operation('Inventory', 'Get an item', { parameters: [pathParam()], data: 'InventoryItem' }),
      patch: operation('Inventory', 'Update an item', {
        parameters: [pathParam()],
        data: 'InventoryItem',
        body: jsonBody(ref('ItemUpdate'), { reorderLevel: 40 }),
      }),
      delete: operation('Inventory', 'Delete an item', { parameters: [pathParam()] }),
    },
    '/inventory/locations': {
      get: operation('Inventory', 'List stock locations', { parameters: paging, data: 'StockLocation', list: true }),
      post: operation('Inventory', 'Create a stock location', {
        status: '201',
        data: 'StockLocation',
        body: jsonBody(ref('LocationCreate'), {
          name: 'Main store',
          type: 'central_store',
        }),
      }),
    },
    '/inventory/locations/{id}': {
      get: operation('Inventory', 'Get a stock location', { parameters: [pathParam()], data: 'StockLocation' }),
      patch: operation('Inventory', 'Update a stock location', {
        parameters: [pathParam()],
        data: 'StockLocation',
        body: jsonBody(ref('LocationUpdate'), { name: 'Main store', isActive: true }),
      }),
      delete: operation('Inventory', 'Delete a stock location', { parameters: [pathParam()] }),
    },
    '/inventory/stock': {
      get: operation('Inventory', 'All stock items with received, issued, remaining, counts, and low-stock items', {
        parameters: [...paging, query('itemId', objectId), query('locationId', objectId)],
      }),
    },
    '/inventory/stock/low': {
      get: operation('Inventory', 'Items at or below reorder level', { data: 'InventoryItem', list: true }),
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
          query('from', dateString),
          query('to', dateString),
        ],
        data: 'StockMovement',
        list: true,
      }),
      post: operation('Inventory', 'Record a stock movement', {
        status: '201',
        data: 'StockMovement',
        body: jsonBody(ref('MovementCreate'), {
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
      get: operation('Inventory', 'Get a stock movement', { parameters: [pathParam()], data: 'StockMovement' }),
      patch: operation('Inventory', 'Update a stock movement and recalculate remaining stock', {
        parameters: [pathParam()],
        data: 'StockMovement',
        body: jsonBody(ref('MovementUpdate'), {
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
          query('from', dateString),
          query('to', dateString),
        ],
        data: 'StockMovement',
        list: true,
      }),
    },
    '/inventory/issues/{id}': {
      get: operation('Inventory', 'Get a stock issue', { parameters: [pathParam()], data: 'StockMovement' }),
      patch: operation('Inventory', 'Update an issue and recalculate remaining stock', {
        parameters: [pathParam()],
        data: 'StockMovement',
        body: jsonBody(ref('MovementUpdate'), {
          quantity: 4,
          siteId: '64b0c0c0c0c0c0c0c0c0c0c0',
          remarks: 'Corrected issue quantity',
        }),
      }),
    },
    '/vehicles': {
      get: operation('Vehicles', 'List vehicles', {
        parameters: [
          ...paging,
          query('status', { type: 'string', enum: VEHICLE_STATUS }),
          query('type', { type: 'string' }),
          query('siteId', objectId),
        ],
        data: 'Vehicle',
        list: true,
      }),
      post: operation('Vehicles', 'Create a vehicle, and assign it when siteId is sent', {
        status: '201',
        data: 'Vehicle',
        body: jsonBody(ref('VehicleCreate'), {
          registrationNumber: 'UP32 AB 2002',
          type: 'Tipper',
          fuelType: 'diesel',
          odometer: 12000,
          siteId: '64b0c0c0c0c0c0c0c0c0c0c0',
        }),
      }),
    },
    '/vehicles/maintenance-categories': {
      get: operation('Vehicles', 'List maintenance categories', {
        parameters: [...paging, query('status', { type: 'string', enum: MAINTENANCE_CATEGORY_STATUS })],
        data: 'MaintenanceCategory',
        list: true,
      }),
      post: operation('Vehicles', 'Create a maintenance category', {
        status: '201',
        data: 'MaintenanceCategory',
        body: jsonBody(ref('MaintenanceCategoryCreate'), {
          name: 'Engine service',
          description: 'Oil, filter, and engine checks',
          status: 'active',
        }),
      }),
    },
    '/vehicles/maintenance-categories/{id}': {
      get: operation('Vehicles', 'Get a maintenance category', {
        parameters: [pathParam()],
        data: 'MaintenanceCategory',
      }),
      patch: operation('Vehicles', 'Update a maintenance category', {
        parameters: [pathParam()],
        data: 'MaintenanceCategory',
        body: jsonBody(ref('MaintenanceCategoryUpdate'), {
          description: 'Full engine service',
          status: 'inactive',
        }),
      }),
      delete: operation('Vehicles', 'Delete a maintenance category', { parameters: [pathParam()] }),
    },
    '/vehicles/alerts': {
      get: operation('Vehicles', 'Vehicles with documents expiring soon', {
        parameters: [query('withinDays', { type: 'integer', default: 30, minimum: 1, maximum: 365 })],
        data: 'Vehicle',
        list: true,
      }),
    },
    '/vehicles/assignments': {
      get: operation('Vehicles', 'List all vehicle assignments', {
        parameters: [
          ...paging,
          query('vehicleId', objectId),
          query('siteId', objectId),
          query('driverId', objectId),
          query('current', { type: 'boolean', default: true }),
          query('from', dateString),
          query('to', dateString),
        ],
        data: 'VehicleAssignment',
        list: true,
      }),
    },
    '/vehicles/maintenance': {
      get: operation('Vehicles', 'List all maintenance logs', {
        parameters: [
          ...paging,
          query('vehicleId', objectId),
          query('maintenanceCategoryId', objectId),
          query('from', dateString),
          query('to', dateString),
        ],
        data: 'Maintenance',
        list: true,
      }),
    },
    '/vehicles/maintenance/{maintenanceId}': {
      patch: operation('Vehicles', 'Update a maintenance log', {
        parameters: [pathParam('maintenanceId')],
        data: 'Maintenance',
        body: bothBodies(
          ref('MaintenanceUpdate'),
          {
            paidTo: 'Sharma Motors',
            amount: 2800,
            modeOfPayment: 'upi',
            description: 'Engine oil and filter',
          },
          ref('MaintenanceCreateForm')
        ),
      }),
    },
    '/vehicles/{id}': {
      get: operation('Vehicles', 'Get a vehicle', { parameters: [pathParam()], data: 'Vehicle' }),
      patch: operation('Vehicles', 'Update a vehicle', {
        parameters: [pathParam()],
        data: 'Vehicle',
        body: jsonBody(ref('VehicleUpdate'), { notes: 'New tyres fitted' }),
      }),
      delete: operation('Vehicles', 'Delete a vehicle', { parameters: [pathParam()] }),
    },
    '/vehicles/{id}/assign': {
      post: operation('Vehicles', 'Assign an available vehicle', {
        parameters: [pathParam()],
        data: 'VehicleAssignment',
        body: jsonBody(ref('VehicleAssign'), {
          siteId: '64b0c0c0c0c0c0c0c0c0c0c0',
          assignedAt: '2026-04-14',
        }),
      }),
    },
    '/vehicles/{id}/release': {
      post: operation('Vehicles', 'Release an assigned vehicle', {
        parameters: [pathParam()],
        data: 'VehicleAssignment',
        body: jsonBody(ref('VehicleRelease'), { releasedAt: '2026-04-15' }),
      }),
    },
    '/vehicles/{id}/assignments': {
      get: operation('Vehicles', 'Assignment history', {
        parameters: [pathParam(), ...paging],
        data: 'VehicleAssignment',
        list: true,
      }),
    },
    '/vehicles/{id}/maintenance': {
      get: operation('Vehicles', 'List maintenance logs', {
        parameters: [pathParam(), ...paging],
        data: 'Maintenance',
        list: true,
      }),
      post: operation('Vehicles', 'Add a maintenance log', {
        parameters: [pathParam()],
        status: '201',
        data: 'Maintenance',
        body: bothBodies(
          ref('MaintenanceCreate'),
          {
            maintenanceCategoryId: '64b0c0c0c0c0c0c0c0c0c0c0',
            paidTo: 'Sharma Motors',
            date: '2026-04-14',
            amount: 2500,
            modeOfPayment: 'cash',
            reference: 'BILL-1024',
            description: 'Engine oil change',
            recordExpense: true,
          },
          ref('MaintenanceCreateForm')
        ),
      }),
    },
    '/vehicles/{id}/maintenance/{maintenanceId}': {
      patch: operation('Vehicles', 'Update a vehicle maintenance log', {
        parameters: [pathParam(), pathParam('maintenanceId')],
        data: 'Maintenance',
        body: bothBodies(
          ref('MaintenanceUpdate'),
          { paidTo: 'Sharma Motors', amount: 2800, modeOfPayment: 'upi' },
          ref('MaintenanceCreateForm')
        ),
      }),
    },
    '/vehicles/{id}/maintenance/{maintenanceId}/complete': {
      post: operation('Vehicles', 'Complete a maintenance log', {
        parameters: [pathParam(), pathParam('maintenanceId')],
        data: 'Maintenance',
        body: jsonBody(ref('MaintenanceComplete'), { completionNote: 'Done' }),
      }),
    },
    '/vehicles/{id}/fuel-logs': {
      get: operation('Vehicles', 'List fuel logs', {
        parameters: [pathParam(), ...paging],
        data: 'FuelLog',
        list: true,
      }),
      post: operation('Vehicles', 'Add a fuel log', {
        parameters: [pathParam()],
        data: 'FuelLog',
        body: jsonBody(ref('FuelCreate'), {
          liters: 40,
          amount: 3600,
          odometer: 12500,
          recordExpense: true,
        }),
      }),
    },
    '/accounts/summary': {
      get: operation('Accounts', 'Salary and expense totals', {
        parameters: [query('from', dateString), query('to', dateString), query('projectId', objectId)],
      }),
    },
    '/accounts/employees/{employeeId}/statement': {
      get: operation('Accounts', 'Employee ledger statement', { parameters: [pathParam('employeeId')] }),
    },
    '/accounts/salaries': {
      get: operation('Accounts', 'List salary records', {
        parameters: paging,
        data: 'SalaryRecord',
        list: true,
      }),
      post: operation('Accounts', 'Record a salary sheet', {
        status: '201',
        data: 'SalaryRecord',
        body: jsonBody(ref('SalaryCreate'), {
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
      get: operation('Accounts', 'Get a salary record', { parameters: [pathParam()], data: 'SalaryRecord' }),
      patch: operation('Accounts', 'Update a salary record', {
        parameters: [pathParam()],
        data: 'SalaryRecord',
        body: jsonBody(ref('SalaryUpdate'), { amountPaid: 20000 }),
      }),
    },
    '/accounts/salaries/{id}/void': {
      post: operation('Accounts', 'Void a salary record', {
        parameters: [pathParam()],
        data: 'SalaryRecord',
        body: jsonBody(ref('VoidBody'), { reason: 'Entered for the wrong month' }),
      }),
    },
    '/accounts/expenses': {
      get: operation('Accounts', 'List expenses', {
        parameters: [
          ...paging,
          query('category', { type: 'string', enum: EXPENSE_CATEGORIES }),
          query('vehicleId', objectId),
          query('employeeId', objectId),
          query('projectId', objectId),
          query('siteId', objectId),
          query('from', dateString),
          query('to', dateString),
        ],
        data: 'Expense',
        list: true,
      }),
      post: operation('Accounts', 'Record an expense', {
        status: '201',
        data: 'Expense',
        body: jsonBody(ref('ExpenseCreate'), {
          category: 'material',
          amount: 38000,
          description: 'Cement purchase',
          paymentModeNote: 'bank_transfer',
        }),
      }),
    },
    '/accounts/expenses/{id}': {
      get: operation('Accounts', 'Get an expense', { parameters: [pathParam()], data: 'Expense' }),
      patch: operation('Accounts', 'Update an expense', {
        parameters: [pathParam()],
        data: 'Expense',
        body: jsonBody(ref('ExpenseUpdate'), { amount: 40000 }),
      }),
    },
    '/accounts/expenses/{id}/void': {
      post: operation('Accounts', 'Void an expense', {
        parameters: [pathParam()],
        data: 'Expense',
        body: jsonBody(ref('VoidBody'), { reason: 'Duplicate entry removed' }),
      }),
    },
    '/accounts/advances': {
      get: operation('Accounts', 'List employee advance requests', {
        parameters: [
          ...paging,
          query('employeeId', objectId),
          query('departmentId', objectId),
          query('from', dateString),
          query('to', dateString),
        ],
        data: 'Advance',
        list: true,
      }),
      post: operation('Accounts', 'Create an employee advance request', {
        status: '201',
        data: 'Advance',
        body: jsonBody(ref('AdvanceCreate'), {
          employeeId: '64b0c0c0c0c0c0c0c0c0c0c0',
          advanceAmount: 5000,
          reasonForAdvance: 'Festival advance',
          employeeRemarks: 'Will adjust in next salary',
          requestDate: '2026-10-30',
        }),
      }),
    },
    '/accounts/advances/{id}': {
      get: operation('Accounts', 'Get an advance request', { parameters: [pathParam()], data: 'Advance' }),
      patch: operation('Accounts', 'Update an advance request', {
        parameters: [pathParam()],
        data: 'Advance',
        body: jsonBody(ref('AdvanceUpdate'), {
          advanceAmount: 7000,
          reasonForAdvance: 'Medical expense',
        }),
      }),
    },
    '/accounts/advances/{id}/recover': {
      post: operation('Accounts', 'Record an advance recovery', {
        parameters: [pathParam()],
        data: 'Advance',
        body: jsonBody(ref('AdvanceRecover'), {
          amount: 2000,
          remarks: 'Adjusted in October salary',
        }),
      }),
    },
    '/accounts/advances/{id}/void': {
      post: operation('Accounts', 'Void an advance request', {
        parameters: [pathParam()],
        data: 'Advance',
        body: jsonBody(ref('VoidBody'), { reason: 'Entered for the wrong employee' }),
      }),
    },
  },
};

module.exports = finalizeSpec(spec);
