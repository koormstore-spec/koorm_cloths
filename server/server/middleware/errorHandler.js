const { logError, logErrorResponse } = require('../utils/logger');

const notFound = (req, res, next) => {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
};

const errorHandler = (err, req, res, next) => {
  logError(err, req);
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode).json({
    message: err.message || 'Server error',
  });
};

const logErrorResponses = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (res.statusCode >= 500) {
      logErrorResponse(req, res.statusCode, body?.message || 'Server error');
    }
    return originalJson(body);
  };

  next();
};

module.exports = { notFound, errorHandler, logErrorResponses };
