import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import { PrivateRoute, AdminRoute } from './components/PrivateRoute';

import Home from './pages/Home';
import Shop from './pages/Shop';
import About from './pages/About';
import Contact from './pages/Contact';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import Profile from './pages/Profile';
import OrderDetail from './pages/OrderDetail';
import Wishlist from './pages/Wishlist';
import NotFound from './pages/NotFound';

import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminProducts from './pages/admin/AdminProducts';
import AdminProductForm from './pages/admin/AdminProductForm';
import AdminOrders from './pages/admin/AdminOrders';
import AdminCoupons from './pages/admin/AdminCoupons';
import AdminCouponForm from './pages/admin/AdminCouponForm';
import AdminReviews from './pages/admin/AdminReviews';
import AdminReturns from './pages/admin/AdminReturns';
import AdminPaymentsPage from './pages/admin/AdminPaymentsPage';

function App() {
  const { pathname, hash } = useLocation();
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');

  // React Router never scrolls on navigation by itself, so a link clicked
  // from the bottom of a long page (the footer, most often) would otherwise
  // land on the new page still scrolled to that same position. Jump to the
  // linked anchor when there is one (e.g. the footer's #returns link),
  // otherwise to the top of the new page.
  useEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return (
    <div className={`${isAdmin ? '' : 'storefront'} flex flex-col min-h-screen ${pathname.startsWith('/product/') ? 'product-detail-page pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0' : ''}`}>
      {!isAdmin && <Navbar />}
      <main className="min-w-0 flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/product/:slug" element={<ProductDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />

          <Route element={<PrivateRoute />}>
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/orders/:id" element={<OrderDetail />} />
            <Route path="/wishlist" element={<Wishlist />} />
          </Route>

          <Route path="/admin/login" element={<AdminLogin />} />
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/products" element={<AdminProducts />} />
            <Route path="/admin/products/new" element={<AdminProductForm />} />
            <Route path="/admin/products/:id/edit" element={<AdminProductForm />} />
            <Route path="/admin/orders" element={<AdminOrders />} />
            <Route path="/admin/returns" element={<AdminReturns />} />
            <Route path="/admin/payments" element={<AdminPaymentsPage />} />
            <Route path="/admin/coupons" element={<AdminCoupons />} />
            <Route path="/admin/coupons/new" element={<AdminCouponForm />} />
            <Route path="/admin/coupons/:id/edit" element={<AdminCouponForm />} />
            <Route path="/admin/reviews" element={<AdminReviews />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      {!isAdmin && <Footer />}
    </div>
  );
}

export default App;
