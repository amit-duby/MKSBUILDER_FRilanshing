const AppError = require('../../common/errors/AppError');
const { roundQuantity } = require('../../common/utils/quantity');

function step(quantity) {
  return [{ quantity }];
}

function planStockMovement({ type, quantity, direction }) {
  const qty = roundQuantity(quantity);
  if (!(qty > 0)) {
    throw new AppError('Quantity must be greater than zero', 400, 'BAD_REQUEST');
  }

  if (type === 'receipt' || type === 'return') {
    return { quantity: qty, increase: step(qty), decrease: [] };
  }

  if (type === 'issue') {
    return { quantity: qty, increase: [], decrease: step(qty) };
  }

  if (type === 'transfer') {
    throw new AppError('Stock transfer is not supported', 400, 'BAD_REQUEST');
  }

  if (type === 'adjustment') {
    if (!direction) {
      throw new AppError('Adjustment needs a direction', 400, 'BAD_REQUEST');
    }
    if (direction === 'increase') {
      return { quantity: qty, increase: step(qty), decrease: [] };
    }
    if (direction === 'decrease') {
      return { quantity: qty, increase: [], decrease: step(qty) };
    }
    throw new AppError('Adjustment direction must be increase or decrease', 400, 'BAD_REQUEST');
  }

  throw new AppError('Unsupported stock movement', 400, 'BAD_REQUEST');
}

function reversePlan(plan) {
  return {
    quantity: plan.quantity,
    increase: (plan.decrease || []).map((entry) => ({ ...entry })),
    decrease: (plan.increase || []).map((entry) => ({ ...entry })),
  };
}

function planQuantity(steps) {
  return (steps || []).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
}

module.exports = { planStockMovement, reversePlan, planQuantity };
