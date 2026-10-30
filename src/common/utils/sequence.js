const Counter = require('../models/counter.model');

function formatCode(prefix, seq, pad) {
  return `${prefix}-${String(seq).padStart(pad, '0')}`;
}

async function nextCode(key, prefix, pad = 4) {
  const [code] = await nextCodes(key, prefix, 1, pad);
  return code;
}

async function nextCodes(key, prefix, count, pad = 4) {
  if (count <= 0) return [];
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: count } },
    { upsert: true, new: true }
  );

  const start = counter.seq - count + 1;
  return Array.from({ length: count }, (_, index) => formatCode(prefix, start + index, pad));
}

module.exports = { nextCode, nextCodes };
