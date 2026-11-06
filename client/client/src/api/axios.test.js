import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from './axios';
import { SESSION_EXPIRED_EVENT } from '../lib/sessionEvents';

const reject = status => config => Promise.reject({ config, response: { status, data: { message: 'Not authorized, token failed' } } });
const signedOut = vi.fn();

beforeEach(() => {
  localStorage.setItem('koorm_user', JSON.stringify({ token: 'old-token' }));
  window.addEventListener(SESSION_EXPIRED_EVENT, signedOut);
});
afterEach(() => {
  localStorage.clear();
  signedOut.mockClear();
  window.removeEventListener(SESSION_EXPIRED_EVENT, signedOut);
});

it('signs the customer out and explains why when the saved login is rejected', async () => {
  api.defaults.adapter = reject(401);
  const error = await api.post('/cart', {}).catch(err => err);
  expect(localStorage.getItem('koorm_user')).toBeNull();
  expect(signedOut).toHaveBeenCalledTimes(1);
  expect(error.response.data.message).toBe('Your login has ended. Please log in again.');
});

it('leaves a rejected code on the login screens alone', async () => {
  api.defaults.adapter = reject(401);
  await expect(api.post('/auth/verify-login-code', {})).rejects.toBeTruthy();
  expect(localStorage.getItem('koorm_user')).not.toBeNull();
  expect(signedOut).not.toHaveBeenCalled();
});

it('keeps the login for other failures such as a server error', async () => {
  api.defaults.adapter = reject(503);
  await expect(api.get('/cart')).rejects.toBeTruthy();
  expect(localStorage.getItem('koorm_user')).not.toBeNull();
  expect(signedOut).not.toHaveBeenCalled();
});

it('does not sign out a newer login when an older request fails late', async () => {
  api.defaults.adapter = config => {
    localStorage.setItem('koorm_user', JSON.stringify({ token: 'new-token' }));
    return reject(401)(config);
  };
  await expect(api.get('/cart')).rejects.toBeTruthy();
  expect(JSON.parse(localStorage.getItem('koorm_user')).token).toBe('new-token');
  expect(signedOut).not.toHaveBeenCalled();
});
