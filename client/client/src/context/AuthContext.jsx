import { createContext, useContext, useState } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('koorm_user');
    return stored ? JSON.parse(stored) : null;
  });

  const setSession = (data) => {
    localStorage.setItem('koorm_user', JSON.stringify(data));
    setUser(data);
    return data;
  };

  // Step 1 of registration: submit details, get an emailed code.
  const register = async (name, email, phone) => {
    const { data } = await api.post('/auth/register', { name, email, phone });
    return data;
  };

  // Step 2 of registration: the code matching completes account creation
  // and logs the user in immediately.
  const verifyEmail = async (email, code) => {
    const { data } = await api.post('/auth/verify-email', { email, code });
    return setSession(data);
  };

  const resendVerificationCode = async (email) => {
    const { data } = await api.post('/auth/resend-verification', { email });
    return data;
  };

  // Step 1 of login: email a code to an already-verified account.
  const requestLoginCode = async (email) => {
    const { data } = await api.post('/auth/request-login-code', { email });
    return data;
  };

  // Step 2 of login: the matching code logs the user in.
  const verifyLoginCode = async (email, code) => {
    const { data } = await api.post('/auth/verify-login-code', { email, code });
    return setSession(data);
  };

  const logout = () => {
    localStorage.removeItem('koorm_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        register,
        verifyEmail,
        resendVerificationCode,
        requestLoginCode,
        verifyLoginCode,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
