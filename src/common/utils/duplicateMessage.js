function duplicateMessage(error) {
  const keys = Object.keys(error.keyPattern || {});

  if (keys.includes('attendanceDate')) {
    return 'Attendance is already marked for this employee on this date';
  }
  if (keys.includes('periodMonth') || keys.includes('periodYear')) {
    return 'A salary record already exists for this employee and month';
  }
  if (keys.includes('registrationNumber')) {
    return 'A vehicle with this registration number already exists';
  }
  if (keys.includes('email')) {
    return 'This email is already in use';
  }
  if (keys.includes('idNumber')) {
    return 'This ID number is already in use';
  }
  if (keys.includes('sku')) {
    return 'An item with this SKU already exists';
  }
  if (keys.includes('employee') && keys.includes('site')) {
    return 'This employee is already assigned to the site';
  }
  if (keys.includes('site')) {
    return 'This site already has a stock location';
  }
  if (keys.includes('code')) {
    return 'This code is already in use';
  }

  return 'A record with the same unique value already exists';
}

module.exports = duplicateMessage;
