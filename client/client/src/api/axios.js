import axios from 'axios';
import { SESSION_EXPIRED_EVENT } from '../lib/sessionEvents';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('koorm_user');
  if (stored) {
    const user = JSON.parse(stored);
    if (user?.token) {
      config.headers.Authorization = `Bearer ${user.token}`;
    }
  }
  return config;
});

// A saved login stops working once it expires or the server's secret changes.
// Sign the visitor out so they become a guest and can log in again, rather than
// looking signed in while every bag and wishlist action fails. Wrong codes on the
// login screens are left alone, and so is a late reply to an older login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || '';
    const stored = localStorage.getItem('koorm_user');
    if (error.response?.status === 401 && stored && !requestUrl.startsWith('/auth/')) {
      const sentHeader = error.config?.headers?.Authorization;
      if (sentHeader === `Bearer ${JSON.parse(stored)?.token}`) {
        localStorage.removeItem('koorm_user');
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
        error.response.data = { ...error.response.data, message: 'Your login has ended. Please log in again.' };
      }
    }
    return Promise.reject(error);
  }
);

export default api;
