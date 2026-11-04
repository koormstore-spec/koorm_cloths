import axios from 'axios';

// Fully independent from api/axios.js — attaches the admin token, not the
// customer token, and never reads/writes koorm_user.
const adminApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

adminApi.interceptors.request.use((config) => {
  const stored = localStorage.getItem('koorm_admin');
  if (stored) {
    const admin = JSON.parse(stored);
    if (admin?.token) {
      config.headers.Authorization = `Bearer ${admin.token}`;
    }
  }
  return config;
});

// Admin logins expire after 7 days. When the server rejects the saved login,
// sign out and return to the login page instead of leaving every admin screen
// stuck on a generic load error. Login attempts themselves are left alone so a
// wrong password still shows its own message.
adminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || '';
    if (error.response?.status === 401 && !requestUrl.startsWith('/admin/auth/') && localStorage.getItem('koorm_admin')) {
      localStorage.removeItem('koorm_admin');
      window.location.assign('/admin/login?expired=1');
    }
    return Promise.reject(error);
  }
);

export default adminApi;
