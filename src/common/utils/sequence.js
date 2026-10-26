const Counter = require('../models/counter.model');

async function nextCode(key, prefix, pad = 4) {
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );

  return `${prefix}-${String(counter.seq).padStart(pad, '0')}`;
}

module.exports = { nextCode };
