import { createContext, useContext, useState } from 'react';
import adminApi from '../api/adminAxios';

const AdminAuthContext = createContext(null);

export const AdminAuthProvider = ({ children }) => {
  const [admin, setAdmin] = useState(() => {
    const stored = localStorage.getItem('koorm_admin');
    return stored ? JSON.parse(stored) : null;
  });

  const adminLogin = async (email, password) => {
    const { data } = await adminApi.post('/admin/auth/login', { email, password });
    localStorage.setItem('koorm_admin', JSON.stringify(data));
    setAdmin(data);
    return data;
  };

  const requestAdminSetupCode = async (email) => {
    const { data } = await adminApi.post('/admin/auth/request-setup-code', { email });
    return data;
  };

  const verifyAdminSetup = async (email, code, password) => {
    const { data } = await adminApi.post('/admin/auth/verify-setup', { email, code, password });
    localStorage.setItem('koorm_admin', JSON.stringify(data));
    setAdmin(data);
    return data;
  };

  const requestAdminPasswordReset = async (email) => {
    const { data } = await adminApi.post('/admin/auth/forgot-password', { email });
    return data;
  };

  const resetAdminPassword = async (email, code, password) => {
    const { data } = await adminApi.post('/admin/auth/reset-password', { email, code, password });
    localStorage.setItem('koorm_admin', JSON.stringify(data));
    setAdmin(data);
    return data;
  };

  const adminLogout = () => {
    localStorage.removeItem('koorm_admin');
    setAdmin(null);
  };

  return (
    <AdminAuthContext.Provider value={{ admin, adminLogin, requestAdminSetupCode, verifyAdminSetup, requestAdminPasswordReset, resetAdminPassword, adminLogout }}>
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => useContext(AdminAuthContext);
