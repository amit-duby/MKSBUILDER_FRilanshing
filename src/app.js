const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const hpp = require('hpp');
const pinoHttp = require('pino-http');
const { getConfig } = require('./config/env');
const logger = require('./common/utils/logger');
const requestContext = require('./common/middleware/requestContext');
const sanitize = require('./common/middleware/sanitize');
const { apiLimiter } = require('./common/middleware/rateLimit');
const notFound = require('./common/middleware/notFound');
const errorHandler = require('./common/middleware/errorHandler');
const apiRoutes = require('./routes');

const config = getConfig();
const app = express();

app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: config.corsOrigins }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(sanitize);
app.use(hpp());
app.use(requestContext);
app.use(pinoHttp({
  logger,
  genReqId: (req) => req.id,
  serializers: {
    req(req) {
      return { id: req.id, method: req.method, url: req.url };
    },
  },
}));

app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'MKS Construction ERP API',
    data: { health: '/api/v1/health' },
  });
});

app.use('/api/v1', apiLimiter, apiRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
