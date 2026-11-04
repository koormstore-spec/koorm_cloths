import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import adminApi from './adminAxios';

const assign = vi.fn();
const reject = status => config => Promise.reject({ config, response: { status } });

beforeEach(() => {
  localStorage.setItem('koorm_admin', JSON.stringify({ token: 'old-token' }));
  Object.defineProperty(window, 'location', { configurable: true, value: { assign } });
});
afterEach(() => { localStorage.clear(); assign.mockClear(); });

it('signs out and returns to the login page when the saved admin login is rejected', async () => {
  adminApi.defaults.adapter = reject(401);
  await expect(adminApi.get('/admin/stats')).rejects.toBeTruthy();
  expect(localStorage.getItem('koorm_admin')).toBeNull();
  expect(assign).toHaveBeenCalledWith('/admin/login?expired=1');
});

it('leaves a wrong-password response on the login screen alone', async () => {
  adminApi.defaults.adapter = reject(401);
  await expect(adminApi.post('/admin/auth/login', {})).rejects.toBeTruthy();
  expect(localStorage.getItem('koorm_admin')).not.toBeNull();
  expect(assign).not.toHaveBeenCalled();
});

it('keeps the login for other failures such as a server error', async () => {
  adminApi.defaults.adapter = reject(500);
  await expect(adminApi.get('/admin/stats')).rejects.toBeTruthy();
  expect(localStorage.getItem('koorm_admin')).not.toBeNull();
  expect(assign).not.toHaveBeenCalled();
});
