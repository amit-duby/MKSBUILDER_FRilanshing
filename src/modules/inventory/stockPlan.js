const AppError = require('../../common/errors/AppError');
const { roundQuantity } = require('../../common/utils/quantity');

function planStockMovement({ type, quantity, direction, fromLocationId, toLocationId }) {
  const qty = roundQuantity(quantity);
  if (!(qty > 0)) {
    throw new AppError('Quantity must be greater than zero', 400, 'BAD_REQUEST');
  }

  const single = (locationId) => [{
    locationId: locationId ? String(locationId) : null,
    quantity: qty,
  }];

  if (type === 'receipt' || type === 'return') {
    return { quantity: qty, increase: single(toLocationId), decrease: [] };
  }

  if (type === 'issue') {
    return { quantity: qty, increase: [], decrease: single(fromLocationId) };
  }

  if (type === 'transfer') {
    if (!fromLocationId || !toLocationId) {
      throw new AppError('Transfer needs both a source and a destination location', 400, 'BAD_REQUEST');
    }
    if (String(fromLocationId) === String(toLocationId)) {
      throw new AppError('Source and destination locations must be different', 400, 'BAD_REQUEST');
    }
    return {
      quantity: qty,
      increase: single(toLocationId),
      decrease: single(fromLocationId),
    };
  }

  if (type === 'adjustment') {
    if (!direction) {
      throw new AppError('Adjustment needs a direction', 400, 'BAD_REQUEST');
    }
    const locationId = toLocationId || fromLocationId || null;
    if (direction === 'increase') {
      return { quantity: qty, increase: single(locationId), decrease: [] };
    }
    if (direction === 'decrease') {
      return { quantity: qty, increase: [], decrease: single(locationId) };
    }
    throw new AppError('Adjustment direction must be increase or decrease', 400, 'BAD_REQUEST');
  }

  throw new AppError('Unsupported stock movement', 400, 'BAD_REQUEST');
}

function reversePlan(plan) {
  return {
    quantity: plan.quantity,
    increase: (plan.decrease || []).map((step) => ({ ...step })),
    decrease: (plan.increase || []).map((step) => ({ ...step })),
  };
}

function planQuantity(steps) {
  return (steps || []).reduce((sum, step) => sum + Number(step.quantity || 0), 0);
}

module.exports = { planStockMovement, reversePlan, planQuantity };
