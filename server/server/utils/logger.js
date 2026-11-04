const fs = require('fs');
const path = require('path');

const logPath = process.env.ERROR_LOG_PATH || path.join(__dirname, '..', 'logs', 'error.log');

const getRequestContext = (req) => {
  if (!req) return undefined;

  return {
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip,
    userId: req.user?.id,
    adminId: req.admin?.id,
  };
};

const writeLog = (entry) => {
  const line = `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`;

  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, line);
  } catch (writeError) {
    console.error('Unable to write error log:', writeError.message);
  }
};

const logError = (error, req, context = {}) => {
  const normalizedError = error instanceof Error ? error : new Error(String(error));

  writeLog({
    level: 'error',
    message: normalizedError.message,
    stack: normalizedError.stack,
    request: getRequestContext(req),
    ...context,
  });

  console.error(normalizedError);
};

const logErrorResponse = (req, statusCode, message) => {
  writeLog({
    level: 'error',
    message,
    statusCode,
    request: getRequestContext(req),
  });
};

module.exports = { logError, logErrorResponse };