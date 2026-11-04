const { publicCache } = require('../middleware/publicCache');

const run = (req) => {
  const headers = {};
  const res = { set: (k, v) => { headers[k] = v; }, vary: (k) => { headers.Vary = k; } };
  const next = jest.fn();
  publicCache(60)({ headers: {}, ...req }, res, next);
  return { headers, next };
};

describe('publicCache', () => {
  it('marks anonymous GETs as publicly cacheable and varies on Authorization', () => {
    const { headers, next } = run({ method: 'GET' });
    expect(headers['Cache-Control']).toBe('public, max-age=60, stale-while-revalidate=300');
    expect(headers.Vary).toBe('Authorization');
    expect(next).toHaveBeenCalled();
  });

  it('keeps signed-in GETs private, since they can include per-user data', () => {
    const { headers } = run({ method: 'GET', headers: { authorization: 'Bearer x' } });
    expect(headers['Cache-Control']).toBe('private, no-cache');
  });

  it('leaves writes untouched', () => {
    const { headers, next } = run({ method: 'POST' });
    expect(headers).toEqual({});
    expect(next).toHaveBeenCalled();
  });
});
