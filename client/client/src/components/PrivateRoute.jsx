import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAdminAuth } from '../context/AdminAuthContext';

export const PrivateRoute = () => {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <Outlet />;
};

export const AdminRoute = () => {
  const { admin } = useAdminAuth();
  if (!admin) {
    return <Navigate to="/admin/login" replace />;
  }
  return <Outlet />;
};
