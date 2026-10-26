function ok(res, data, message = 'OK', meta) {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(200).json(body);
}

function created(res, data, message = 'Created') {
  return res.status(201).json({ success: true, message, data });
}

module.exports = { ok, created };
