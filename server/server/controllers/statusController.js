const { pool } = require('../config/db');
const { isEnabled, getMode } = require('../utils/razorpay');
const { version } = require('../package.json');

const DB_TIMEOUT_MS = 3000;

// Pings the database, giving up after a few seconds so the status page itself
// never hangs.
const checkDatabase = async () => {
  const started = Date.now();
  let timer;
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS); }),
    ]);
    return { status: 'connected', latency_ms: Date.now() - started };
  } catch (err) {
    return { status: 'unreachable', error: err.message === 'timeout' ? 'Timed out' : 'Connection failed' };
  } finally {
    clearTimeout(timer);
  }
};

// Shows the API is up and its dependencies are working. Reports only states,
// never hosts, database names or keys. Answers 503 when the database is down
// so uptime monitors notice.
const getStatus = async (req, res) => {
  const database = await checkDatabase();
  const healthy = database.status === 'connected';
  const body = {
    name: 'Koorm API',
    status: healthy ? 'ok' : 'degraded',
    message: healthy ? 'Koorm API is running and all systems are working.' : 'Koorm API is running, but the database cannot be reached.',
    version,
    environment: process.env.NODE_ENV || 'development',
    uptime_seconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: {
      database,
      payments: {
        status: isEnabled() ? 'enabled' : 'cash_on_delivery_only',
        mode: getMode(),
        webhooks: process.env.RAZORPAY_WEBHOOK_SECRET ? 'configured' : 'not_configured',
      },
      email: { status: process.env.EMAIL_USER && process.env.EMAIL_PASS ? 'configured' : 'not_configured' },
    },
  };
  res.set('Cache-Control', 'no-store');
  res.status(healthy ? 200 : 503).type('json').send(JSON.stringify(body, null, 2));
};

module.exports = { getStatus, checkDatabase };
