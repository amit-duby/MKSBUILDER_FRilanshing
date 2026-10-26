function roundMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    throw new TypeError('Amount must be a finite number');
  }
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function sumMoney(lines) {
  return roundMoney((lines || []).reduce((total, line) => total + Number(line.amount || 0), 0));
}

module.exports = { roundMoney, sumMoney };
