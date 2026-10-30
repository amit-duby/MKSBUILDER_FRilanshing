const path = require('path');
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
const swaggerUi = require('swagger-ui-express');
const apiRoutes = require('./routes');
const passwordPages = require('./modules/auth/auth.pages');
const openapi = require('./docs/openapi');

function redactToken(url = '') {
  const hidden = url.replace(/\/password\/reset\/[a-f0-9]{32,}/i, '/password/reset/redacted');
  try {
    const parsed = new URL(hidden, 'http://local');
    if (!parsed.searchParams.has('token')) return hidden;
    parsed.searchParams.set('token', 'redacted');
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return hidden;
  }
}

const config = getConfig();
const app = express();

app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

const apiHelmet = helmet();
const docsHelmet = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
});
app.use((req, res, next) => {
  if (req.path === '/api/docs' || req.path.startsWith('/api/docs/')) return docsHelmet(req, res, next);
  return apiHelmet(req, res, next);
});
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
      return { id: req.id, method: req.method, url: redactToken(req.url) };
    },
  },
}));

app.get('/forgot-password', passwordPages.forgotPage);
app.get('/password/reset/:token', passwordPages.resetPage);
app.get('/password/reset', passwordPages.resetPage);
app.get('/reset-password', passwordPages.resetPage);
app.get('/password-pages.js', passwordPages.script);

app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'MKS Construction ERP API',
    data: { health: '/api/v1/health', docs: '/api/docs' },
  });
});

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
  maxAge: '7d',
  setHeaders(res) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  },
}));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi, {
  customSiteTitle: 'MKS Construction ERP API',
  swaggerOptions: { persistAuthorization: true },
}));
app.get('/api/docs.json', (_req, res) => {
  res.json(openapi);
});
app.use('/api/v1', apiLimiter, apiRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
