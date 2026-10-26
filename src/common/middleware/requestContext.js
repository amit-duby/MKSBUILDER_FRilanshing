const crypto = require('crypto');

function requestContext(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && incoming.trim() && incoming.length <= 80
    ? incoming.trim()
    : crypto.randomUUID();

  req.id = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}

module.exports = requestContext;
