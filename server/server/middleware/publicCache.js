// Lets browsers and CDNs reuse public catalogue responses for a short time.
// Only anonymous GETs are marked public: a signed-in request can return
// per-user data (e.g. a product's can_review), so it's kept private.
// `Vary: Authorization` stops a shared cache from serving one to the other.
const publicCache = (maxAge = 60) => (req, res, next) => {
  if (req.method === 'GET') {
    res.vary('Authorization');
    res.set('Cache-Control', req.headers.authorization
      ? 'private, no-cache'
      : `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 5}`);
  }
  next();
};

module.exports = { publicCache };
