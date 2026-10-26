const AppError = require('../errors/AppError');

function formatZod(error) {
  return error.issues.slice(0, 50).map((issue) => ({
    field: issue.path.join('.').replace(/^(body|query|params)\./, ''),
    message: issue.message,
  }));
}

function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      return next(new AppError('Validation failed', 422, 'VALIDATION_ERROR', formatZod(result.error)));
    }

    const keys = Object.keys(schema.shape);
    if (keys.includes('body')) req.body = result.data.body;
    if (keys.includes('query')) req.query = result.data.query;
    if (keys.includes('params')) req.params = result.data.params;
    return next();
  };
}

module.exports = validate;
