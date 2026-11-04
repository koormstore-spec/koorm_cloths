// Which websites may call this API from a browser.
//
// The live storefront is always allowed. Local development (any port on
// localhost or 127.0.0.1) is allowed too, so `npm run dev` in client/ works
// against this server whether it runs on your machine or in production.
// Sign-in uses a bearer token, not cookies, so a local page gets no access to
// anyone's account just by being allowed here.

const DEFAULT_ORIGINS = ['https://koormcollection.com', 'https://www.koormcollection.com'];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

const configuredOrigins = () => (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const localhostAllowed = () => !/^(false|0|no)$/i.test(process.env.ALLOW_LOCALHOST_ORIGINS || '');

const isAllowedOrigin = (origin) => {
  // Same-origin requests, curl and Razorpay webhooks send no Origin header.
  if (!origin) return true;
  if ([...DEFAULT_ORIGINS, ...configuredOrigins()].includes(origin)) return true;
  return localhostAllowed() && LOCAL_ORIGIN.test(origin);
};

const corsOptions = {
  // A blocked origin simply gets no CORS headers instead of a server error.
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
  credentials: true,
};

module.exports = { corsOptions, isAllowedOrigin };
