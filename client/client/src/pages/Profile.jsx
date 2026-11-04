import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Loader from '../components/Loader';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '../lib/orderStatus';


export default function Profile() {
  const { user, logout } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/orders').then(({ data }) => setOrders(data)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="container-x py-10 fade-in">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h1 className="section-title">My Account</h1>
          <p className="text-muted text-sm mt-2">{user.name} · {user.email}</p>
        </div>
        <button onClick={logout} className="btn-outline">Logout</button>
      </div>

      <h2 className="font-serif text-xl mb-4">Order History</h2>
      <p className="mb-5 text-sm text-muted">Need a different size or want to return an item? Open Return or Exchange on a delivered order. Requests are available within 30 days of delivery and require admin approval.</p>
      {loading ? (
        <Loader />
      ) : orders.length === 0 ? (
        <div className="text-center py-16 border border-sand">
          <p className="text-muted mb-4">You haven't placed any orders yet.</p>
          <Link to="/shop" className="btn-primary">Start Shopping</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const itemCount = order.items.reduce((total, item) => total + Number(item.quantity), 0);

            return (
              <article
                key={order.id}
                className="block border border-sand p-5 hover:border-ink transition"
              >
                <Link to={`/orders/${order.id}`} className="block" aria-label={`View order ${order.order_number}`}>
                <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <p className="font-medium">{order.order_number}</p>
                    <p className="text-sm text-muted">
                      {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}{itemCount} item{itemCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <span className={`text-xs px-3 py-1 rounded-full ${ORDER_STATUS_COLORS[order.status] || ''}`}>
                      {order.cancellation_status === 'requested' ? 'Cancellation requested' : ORDER_STATUS_LABELS[order.status] || order.status}
                    </span>
                    <p className="font-semibold">₹{Number(order.total_amount).toLocaleString('en-IN')}</p>
                  </div>
                </div>
                <ul className="mt-5 grid gap-4 border-t border-sand pt-5 sm:grid-cols-2 lg:grid-cols-3">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex min-w-0 items-center gap-4">
                      <div className="h-24 w-20 shrink-0 overflow-hidden bg-sand/40">
                        {item.product_image ? (
                          <img
                            src={item.product_image}
                            alt={item.product_name}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full items-center justify-center px-2 text-center text-xs text-muted">
                            No image
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="product-name text-sm font-medium">{item.product_name}</p>
                        {item.size && <p className="mt-1 text-xs text-muted">Size: {item.size}</p>}
                        <p className="mt-1 text-sm font-medium">Qty: {item.quantity}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                </Link>
                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-sand pt-4">
                  <Link to={`/orders/${order.id}`} className="btn-outline">View order</Link>
                  {order.status === 'delivered'
                    ? <Link to={`/orders/${order.id}#returns`} className="btn-primary">Return or Exchange</Link>
                    : order.status !== 'cancelled' && <p className="text-xs text-muted">Return and exchange options become available after delivery.</p>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
