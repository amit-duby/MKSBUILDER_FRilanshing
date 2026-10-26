function roundQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) {
    throw new TypeError('Quantity must be a finite number');
  }
  return Math.round((quantity + Number.EPSILON) * 1000) / 1000;
}

module.exports = { roundQuantity };
