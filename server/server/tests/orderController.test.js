jest.mock('../config/db', () => ({
  pool: { query: jest.fn(), getConnection: jest.fn() },
}));
jest.mock('../utils/email', () => ({
  sendOrderConfirmationToCustomer: jest.fn().mockResolvedValue({ sent: true }),
  sendOrderNotificationToAdmin: jest.fn().mockResolvedValue({ sent: true }),
  sendOrderCancellationToAdmin: jest.fn().mockResolvedValue({ sent: true }),
  sendCancellationRequestToAdmin: jest.fn().mockResolvedValue({ sent: true }),
  sendOrderStatusUpdateToCustomer: jest.fn().mockResolvedValue({ sent: true }),
}));

const { pool } = require('../config/db');
const {
  sendOrderConfirmationToCustomer,
  sendOrderNotificationToAdmin,
  sendOrderCancellationToAdmin,
  sendCancellationRequestToAdmin,
  sendOrderStatusUpdateToCustomer,
} = require('../utils/email');
const { createOrder, cancelOrder, updateOrderStatus } = require('../controllers/orderController');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// The controller's email dispatch for cancelOrder/updateOrderStatus runs in a
// detached async IIFE (fire-and-forget after the response). Flushing the
// microtask queue via a macrotask tick lets that chain finish before we assert.
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const makeConnection = () => ({
  query: jest.fn(),
  beginTransaction: jest.fn().mockResolvedValue(),
  commit: jest.fn().mockResolvedValue(),
  rollback: jest.fn().mockResolvedValue(),
  release: jest.fn(),
});

describe('createOrder', () => {
  it('rejects when the shipping address is incomplete', async () => {
    const connection = makeConnection();
    pool.getConnection.mockResolvedValueOnce(connection);
    const req = { user: { id: 1 }, body: { shipping_name: 'Jane' } };
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(connection.release).toHaveBeenCalled();
    expect(connection.query).not.toHaveBeenCalled();
  });

  it('rejects when the cart is empty', async () => {
    const connection = makeConnection();
    connection.query.mockResolvedValueOnce([[]]); // cart lookup -> empty
    pool.getConnection.mockResolvedValueOnce(connection);
    const req = { user: { id: 1 }, body: fullShippingBody() };
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Your cart is empty' });
  });

  it('rejects when a cart item exceeds available stock, naming how many are left', async () => {
    const connection = makeConnection();
    connection.query.mockResolvedValueOnce([[
      { id: 1, size: 'M', quantity: 5, product_id: 9, name: 'Linen Shirt', images: '[]', price: 1899, stock: 2 },
    ]]);
    pool.getConnection.mockResolvedValueOnce(connection);
    const req = { user: { id: 1 }, body: fullShippingBody() };
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Only 2 left in stock for Linen Shirt' });
    expect(connection.beginTransaction).not.toHaveBeenCalled();
  });

  it('checks a per-size product against that size, counting two lines of the same size together', async () => {
    const connection = makeConnection();
    connection.query.mockResolvedValueOnce([[
      { id: 1, size: 'M', quantity: 1, product_id: 9, name: 'Linen Shirt', images: '[]', price: 1899, stock: 1, size_tracked: 1 },
      { id: 2, size: 'L', quantity: 3, product_id: 9, name: 'Linen Shirt', images: '[]', price: 1899, stock: 2, size_tracked: 1 },
    ]]);
    pool.getConnection.mockResolvedValueOnce(connection);
    const res = mockRes();

    await createOrder({ user: { id: 1 }, body: fullShippingBody() }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Only 2 left in stock for Linen Shirt (size L)' });
    expect(connection.beginTransaction).not.toHaveBeenCalled();
  });

  it('rejects with an out-of-stock message (not "insufficient") when stock has hit zero', async () => {
    const connection = makeConnection();
    connection.query.mockResolvedValueOnce([[
      { id: 1, size: 'M', quantity: 1, product_id: 9, name: 'Linen Shirt', images: '[]', price: 1899, stock: 0 },
    ]]);
    pool.getConnection.mockResolvedValueOnce(connection);
    const req = { user: { id: 1 }, body: fullShippingBody() };
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Linen Shirt is out of stock' });
    expect(connection.beginTransaction).not.toHaveBeenCalled();
  });

  it('places the order, commits, and notifies both customer and admin by email', async () => {
    const connection = makeConnection();
    connection.query
      .mockResolvedValueOnce([[
        { id: 1, size: 'M', quantity: 2, product_id: 9, name: 'Linen Shirt', images: '["/img.jpg"]', price: 500, stock: 10 },
      ]]) // cart lookup
      .mockResolvedValueOnce([[{ id: 1 }]]) // lock customer for first-order eligibility
      .mockResolvedValueOnce([[{ id: 9, stock: 10 }]]) // lock products, re-check stock
      .mockResolvedValueOnce([[]]) // per-size stock (none: shared stock)
      .mockResolvedValueOnce([{ insertId: 55 }]) // INSERT order
      .mockResolvedValueOnce([{}]) // INSERT order_items
      .mockResolvedValueOnce([{}]) // UPDATE size stock
      .mockResolvedValueOnce([{}]) // UPDATE stock
      .mockResolvedValueOnce([{}]); // DELETE cart_items
    pool.getConnection.mockResolvedValueOnce(connection);
    const req = { user: { id: 1, name: 'Jane', email: 'jane@example.com' }, body: fullShippingBody() };
    const res = mockRes();

    await createOrder(req, res);

    expect(connection.commit).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    const payload = res.json.mock.calls[0][0];
    expect(payload.items_total).toBe(1000); // 500 * 2, below the 1999 free-shipping threshold
    expect(payload.shipping_fee).toBe(99);
    expect(payload.total_amount).toBe(1099);

    expect(sendOrderConfirmationToCustomer).toHaveBeenCalledTimes(1);
    expect(sendOrderNotificationToAdmin).toHaveBeenCalledTimes(1);
    const emailArg = sendOrderConfirmationToCustomer.mock.calls[0][0];
    expect(emailArg.id).toBe(payload.id);
    expect(emailArg.customerEmail).toBe('jane@example.com');
    expect(emailArg.order_number).toBe(payload.order_number);
    expect(emailArg.items[0]).toMatchObject({ product_name: 'Linen Shirt', product_image: '/img.jpg', size: 'M', quantity: 2 });
    expect(sendOrderNotificationToAdmin.mock.calls[0][0].items).toEqual(emailArg.items);
  });

  it('waives shipping once the order total meets the free-shipping threshold', async () => {
    const connection = makeConnection();
    connection.query
      .mockResolvedValueOnce([[
        { id: 1, size: 'M', quantity: 1, product_id: 9, name: 'Linen Shirt', images: '[]', price: 2500, stock: 10 },
      ]])
      .mockResolvedValueOnce([[{ id: 1 }]]) // lock customer for first-order eligibility
      .mockResolvedValueOnce([[{ id: 9, stock: 10 }]]) // lock products, re-check stock
      .mockResolvedValueOnce([[]]) // per-size stock (none: shared stock)
      .mockResolvedValueOnce([{ insertId: 56 }])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}]);
    pool.getConnection.mockResolvedValueOnce(connection);
    const req = { user: { id: 1, name: 'Jane', email: 'jane@example.com' }, body: fullShippingBody() };
    const res = mockRes();

    await createOrder(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.shipping_fee).toBe(0);
    expect(payload.total_amount).toBe(2500);
  });

  it('rejects an unknown coupon code without touching the transaction', async () => {
    const connection = makeConnection();
    connection.query
      .mockResolvedValueOnce([[
        { id: 1, size: 'M', quantity: 2, product_id: 9, name: 'Linen Shirt', images: '[]', price: 500, stock: 10 },
      ]]) // cart lookup
      .mockResolvedValueOnce([[]]); // coupon lookup -> not found
    pool.getConnection.mockResolvedValueOnce(connection);
    const req = { user: { id: 1, name: 'Jane', email: 'jane@example.com' }, body: { ...fullShippingBody(), coupon_code: 'NOPE' } };
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid coupon code' });
    expect(connection.beginTransaction).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalled();
  });

  it('applies a valid coupon, reduces the total, and increments its usage count', async () => {
    const connection = makeConnection();
    connection.query
      .mockResolvedValueOnce([[
        { id: 1, size: 'M', quantity: 2, product_id: 9, name: 'Linen Shirt', images: '[]', price: 500, stock: 10 },
      ]]) // cart lookup -> itemsTotal 1000
      .mockResolvedValueOnce([[{
        id: 7, code: 'SAVE10', discount_type: 'percent', discount_value: 10,
        min_order_amount: 0, max_discount_amount: null, usage_limit: null,
        used_count: 0, expires_at: null, is_active: 1,
      }]]) // coupon lookup
      .mockResolvedValueOnce([[{ id: 1 }]]) // lock customer for first-order eligibility
      .mockResolvedValueOnce([[{ id: 9, stock: 10 }]]) // lock products, re-check stock
      .mockResolvedValueOnce([[]]) // per-size stock (none: shared stock)
      .mockResolvedValueOnce([{ insertId: 60 }]) // INSERT order
      .mockResolvedValueOnce([{}]) // INSERT order_items
      .mockResolvedValueOnce([{}]) // UPDATE size stock
      .mockResolvedValueOnce([{}]) // UPDATE stock
      .mockResolvedValueOnce([{}]) // DELETE cart_items
      .mockResolvedValueOnce([{}]); // UPDATE coupons used_count
    pool.getConnection.mockResolvedValueOnce(connection);
    const req = { user: { id: 1, name: 'Jane', email: 'jane@example.com' }, body: { ...fullShippingBody(), coupon_code: 'save10' } };
    const res = mockRes();

    await createOrder(req, res);

    expect(connection.commit).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.items_total).toBe(1000);
    expect(payload.discount_amount).toBe(100);
    expect(payload.coupon_code).toBe('SAVE10');
    expect(payload.total_amount).toBe(999); // 1000 - 100 discount + 99 shipping

    const usageUpdateCall = connection.query.mock.calls.find(([sql]) => sql.includes('used_count = used_count + 1'));
    expect(usageUpdateCall[0]).toContain('used_count = used_count + 1');
    expect(usageUpdateCall[1]).toEqual([7]);
  });

  it('rolls back the transaction if something fails after it has begun', async () => {
    const connection = makeConnection();
    connection.query
      .mockResolvedValueOnce([[
        { id: 1, size: 'M', quantity: 1, product_id: 9, name: 'Linen Shirt', images: '[]', price: 1000, stock: 10 },
      ]])
      .mockRejectedValueOnce(new Error('db exploded')); // INSERT order fails
    pool.getConnection.mockResolvedValueOnce(connection);
    const req = { user: { id: 1, name: 'Jane', email: 'jane@example.com' }, body: fullShippingBody() };
    const res = mockRes();

    await createOrder(req, res);

    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('cancelOrder', () => {
  const baseOrder = {
    id: 3,
    user_id: 1,
    order_number: 'KRM123456',
    status: 'placed',
    payment_method: 'COD',
    payment_status: 'cod',
    coupon_code: null,
    total_amount: 1998,
    refunded_amount: 0,
    shipping_name: 'Jane',
    shipping_city: 'Pune',
    shipping_state: 'Maharashtra',
    shipping_pincode: '411001',
  };
  const cancelConnection = (order) => {
    const connection = makeConnection();
    connection.query.mockImplementation(async (sql) => (sql.includes('SELECT * FROM orders') ? [order ? [order] : []] : [{}]));
    pool.getConnection.mockResolvedValueOnce(connection);
    return connection;
  };
  const req = () => ({ params: { id: 3 }, user: { id: 1, name: 'Jane', email: 'jane@example.com' } });

  it('returns 404 when the order does not belong to the requesting user', async () => {
    const connection = cancelConnection(null);
    const res = mockRes();

    await cancelOrder(req(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.query.mock.calls[0][1]).toEqual([3, 1]); // limited to the customer's own order
  });

  it('refuses to cancel an order that has already shipped', async () => {
    cancelConnection({ ...baseOrder, status: 'shipped' });
    const res = mockRes();

    await cancelOrder(req(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Cannot cancel an order that is shipped' });
  });

  it('requests cancellation and notifies the admin without cancelling or restocking', async () => {
    const connection = cancelConnection(baseOrder);
    pool.query
      .mockResolvedValueOnce([[{ ...baseOrder, customer_name: 'Jane', customer_email: 'jane@example.com' }]]) // order + customer for email
      .mockResolvedValueOnce([[{ product_name: 'Linen Shirt', size: 'M', quantity: 1, price: 1899 }]]); // order_items
    const res = mockRes();

    await cancelOrder(req(), res);
    await flushPromises();

    expect(res.json).toHaveBeenCalledWith({ message: 'Cancellation requested. Your order will be cancelled after admin approval.', cancellation_status: 'requested' });
    expect(connection.commit).toHaveBeenCalled();
    const updates = connection.query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE'));
    expect(updates).toHaveLength(1);
    expect(updates[0][0]).toContain("SET cancellation_status = 'requested'");
    expect(sendOrderStatusUpdateToCustomer).not.toHaveBeenCalled();
    expect(sendOrderCancellationToAdmin).not.toHaveBeenCalled();
    expect(sendCancellationRequestToAdmin).toHaveBeenCalledTimes(1);
    const adminArg = sendCancellationRequestToAdmin.mock.calls[0][0];
    expect(adminArg.order_number).toBe('KRM123456');
    expect(adminArg.customerEmail).toBe('jane@example.com');
  });

  it('keeps the coupon counted while cancellation awaits approval', async () => {
    const connection = cancelConnection({ ...baseOrder, coupon_code: 'SAVE10' });
    pool.query.mockResolvedValue([[]]);
    await cancelOrder(req(), mockRes());
    const couponCall = connection.query.mock.calls.find(([sql]) => sql.includes('used_count - 1'));
    expect(couponCall).toBeUndefined();
  });

  it('does not email the admin again for a duplicate cancellation request', async () => {
    const connection = cancelConnection({ ...baseOrder, cancellation_status: 'requested' });
    await cancelOrder(req(), mockRes());
    await flushPromises();
    expect(connection.query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE'))).toHaveLength(0);
    expect(sendCancellationRequestToAdmin).not.toHaveBeenCalled();
  });
});

describe('updateOrderStatus (admin)', () => {
  it('blocks shipping while cancellation is awaiting approval', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 3, status: 'processing', cancellation_status: 'requested' }]]);
    const res = mockRes();
    await updateOrderStatus({ params: { id: 3 }, body: { status: 'shipped' } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('rejects a shipping update if a cancellation request arrived after the initial read', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 3, status: 'processing', cancellation_status: 'none' }]])
      .mockResolvedValueOnce([{ affectedRows: 0 }]);
    const res = mockRes();
    await updateOrderStatus({ params: { id: 3 }, body: { status: 'shipped' } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(pool.query.mock.calls[1][0]).toContain("AND cancellation_status <> 'requested'");
    expect(sendOrderStatusUpdateToCustomer).not.toHaveBeenCalled();
  });

  it('approves a request, restocks the order and emails cancellation confirmation to the customer', async () => {
    const order = { id: 3, status: 'processing', cancellation_status: 'requested', payment_status: 'cod', customer_name: 'Jane', customer_email: 'jane@example.com' };
    const connection = makeConnection();
    connection.query.mockImplementation(async sql => sql.startsWith('SELECT') ? [[order]] : [{ affectedRows: 1 }]);
    pool.getConnection.mockResolvedValueOnce(connection);
    pool.query.mockResolvedValueOnce([[order]])
      .mockResolvedValueOnce([[{ ...order, status: 'cancelled', cancellation_status: 'approved' }]])
      .mockResolvedValueOnce([[]]);
    const res = mockRes();
    await updateOrderStatus({ params: { id: 3 }, body: { status: 'cancelled' } }, res);
    await flushPromises();
    expect(res.json).toHaveBeenCalledWith({ message: 'Order cancelled', refund: null, refundError: null });
    expect(connection.commit).toHaveBeenCalled();
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('p.stock + oi.quantity'))).toBe(true);
    expect(sendOrderStatusUpdateToCustomer).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled', customerEmail: 'jane@example.com' }));
  });

  it('rejects an invalid status value', async () => {
    const req = { params: { id: 3 }, body: { status: 'not-a-real-status' } };
    const res = mockRes();

    await updateOrderStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('updates the status and emails the customer', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 3, status: 'processing' }]]) // current status
      .mockResolvedValueOnce([{}]) // UPDATE orders
      .mockResolvedValueOnce([[{
        order_number: 'KRM123456',
        customer_name: 'Jane',
        customer_email: 'jane@example.com',
        total_amount: 1998,
        shipping_name: 'Jane',
        shipping_city: 'Pune',
        shipping_state: 'Maharashtra',
        shipping_pincode: '411001',
      }]]) // order + customer lookup
      .mockResolvedValueOnce([[]]); // order_items
    const req = { params: { id: 3 }, body: { status: 'shipped' } };
    const res = mockRes();

    await updateOrderStatus(req, res);
    await flushPromises();

    expect(res.json).toHaveBeenCalledWith({ message: 'Order status updated' });
    expect(sendOrderStatusUpdateToCustomer).toHaveBeenCalledTimes(1);
    expect(sendOrderStatusUpdateToCustomer.mock.calls[0][0]).toMatchObject({
      status: 'shipped',
      customerEmail: 'jane@example.com',
      order_number: 'KRM123456',
    });
  });
});

function fullShippingBody() {
  return {
    shipping_name: 'Jane',
    shipping_phone: '9998887777',
    shipping_address_line1: '1 Main St',
    shipping_city: 'Pune',
    shipping_state: 'Maharashtra',
    shipping_pincode: '411001',
  };
}
