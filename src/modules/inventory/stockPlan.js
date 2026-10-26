const AppError = require('../../common/errors/AppError');
const { roundQuantity } = require('../../common/utils/quantity');

function planStockMovement({ type, quantity, direction, fromLocationId, toLocationId }) {
  const qty = roundQuantity(quantity);
  if (!(qty > 0)) {
    throw new AppError('Quantity must be greater than zero', 400, 'BAD_REQUEST');
  }

  const single = (locationId) => [{ locationId: String(locationId), quantity: qty }];

  if (type === 'receipt' || type === 'return') {
    if (!toLocationId) {
      throw new AppError('A destination location is required', 400, 'BAD_REQUEST');
    }
    return { quantity: qty, increase: single(toLocationId), decrease: [] };
  }

  if (type === 'issue') {
    if (!fromLocationId) {
      throw new AppError('A source location is required', 400, 'BAD_REQUEST');
    }
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
    const locationId = toLocationId || fromLocationId;
    if (!locationId || !direction) {
      throw new AppError('Adjustment needs a location and a direction', 400, 'BAD_REQUEST');
    }
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

module.exports = { planStockMovement };
