import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Checkout from './Checkout';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { payForOrder } from '../lib/razorpay';

vi.mock('../context/CartContext', () => ({ useCart: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../lib/razorpay', () => ({ payForOrder: vi.fn() }));

const item = { id: 4, name: 'Linen shirt', size: 'M', slug: 'linen-shirt', price: 1000, quantity: 2, stock: 3, images: [] };
const refreshCart = vi.fn();
let landed = null;
function OrderPage() { landed = useLocation(); return <p>Order page</p>; }
const show = () => render(<MemoryRouter initialEntries={['/checkout']}><Routes><Route path="/checkout" element={<Checkout />} /><Route path="/orders/:id" element={<OrderPage />} /></Routes></MemoryRouter>);
const fillAddress = () => {
  for (const [placeholder, value] of [['10-digit mobile number', '9876543210'], ['House no., building, street', '1 Road'], ['City', 'Pune'], ['State', 'Maharashtra'], ['6-digit pincode', '411001']]) {
    fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });
  }
};
const payment = { key_id: 'rzp_test', razorpay_order_id: 'order_1', amount: 200000 };
// Fills in the address and moves on to the payment step.
const toPaymentStep = async () => {
  fillAddress();
  fireEvent.click(screen.getByRole('button', { name: /Continue to payment/ }));
  return screen.findByRole('heading', { name: 'Payment' });
};

beforeEach(() => {
  vi.clearAllMocks();
  landed = null;
  useAuth.mockReturnValue({ user: { name: 'Jane' } });
  useCart.mockReturnValue({ cartItems: [item], cartTotal: 2000, refreshCart, updateQuantity: vi.fn(), removeFromCart: vi.fn() });
  api.get.mockImplementation(async url => ({ data: url === '/payments/config' ? { online: true } : { eligible: false } }));
});

it('asks for the address first, then shows pay now and cash on delivery as a separate step', async () => {
  show();
  expect(screen.queryByRole('radio', { name: /Pay now/ })).not.toBeInTheDocument();
  await toPaymentStep();
  expect(screen.getByText('Delivering to')).toBeInTheDocument();
  expect(screen.getByText('Pune, Maharashtra 411001')).toBeInTheDocument();
  expect(await screen.findByRole('radio', { name: /Pay now/ })).toBeChecked();
  expect(screen.getByRole('radio', { name: /Cash on delivery/ })).not.toBeChecked();
  expect(api.post).not.toHaveBeenCalled();
});

it('keeps the address when going back to change it', async () => {
  show();
  await toPaymentStep();
  fireEvent.click(screen.getByRole('button', { name: 'Change' }));
  expect(screen.getByPlaceholderText('City')).toHaveValue('Pune');
});

it('pays now through Razorpay without the browser sending an amount', async () => {
  api.post.mockResolvedValue({ data: { id: 42, payment } });
  payForOrder.mockResolvedValue({ status: 'placed', payment_status: 'paid' });
  show();
  await toPaymentStep();
  await screen.findByRole('radio', { name: /Pay now/ });
  fireEvent.click(screen.getByRole('button', { name: 'Pay ₹2,000 now' }));

  await waitFor(() => expect(landed?.pathname).toBe('/orders/42'));
  const body = api.post.mock.calls[0][1];
  expect(api.post.mock.calls[0][0]).toBe('/orders');
  expect(body).toMatchObject({ payment_method: 'ONLINE', shipping_city: 'Pune' });
  expect(Object.keys(body).some(key => /amount|total/i.test(key))).toBe(false);
  expect(payForOrder).toHaveBeenCalledWith(42, payment);
  expect(refreshCart).toHaveBeenCalled();
  expect(landed.state).toEqual({ justPlaced: true });
});

it('still shows the confirmation for a cash order when refreshing the bag fails', async () => {
  api.post.mockResolvedValue({ data: { id: 42 } });
  refreshCart.mockRejectedValueOnce(new Error('Network Error'));
  show();
  await toPaymentStep();
  fireEvent.click(await screen.findByRole('radio', { name: /Cash on delivery/ }));
  fireEvent.click(screen.getByRole('button', { name: /Place order/ }));

  await waitFor(() => expect(landed?.pathname).toBe('/orders/42'));
  expect(landed.state).toEqual({ justPlaced: true });
});

it('does not report a payment problem when only refreshing the bag fails after paying', async () => {
  api.post.mockResolvedValue({ data: { id: 42, payment } });
  payForOrder.mockResolvedValue({ status: 'placed', payment_status: 'paid' });
  refreshCart.mockRejectedValueOnce(new Error('Network Error'));
  show();
  await toPaymentStep();
  await screen.findByRole('radio', { name: /Pay now/ });
  fireEvent.click(screen.getByRole('button', { name: 'Pay ₹2,000 now' }));

  await waitFor(() => expect(landed?.pathname).toBe('/orders/42'));
  expect(landed.state).toEqual({ justPlaced: true });
});

it('goes to the order page to finish paying if the payment window is closed', async () => {
  api.post.mockResolvedValue({ data: { id: 42, payment } });
  payForOrder.mockRejectedValue(Object.assign(new Error('Payment was not completed.'), { dismissed: true }));
  show();
  await toPaymentStep();
  await screen.findByRole('radio', { name: /Pay now/ });
  fireEvent.click(screen.getByRole('button', { name: /now/ }));

  await waitFor(() => expect(landed?.pathname).toBe('/orders/42'));
  expect(landed.state).toEqual({ paymentIssue: 'Payment was not completed.', confirming: false });
});

it('places cash-on-delivery orders without opening Razorpay', async () => {
  api.post.mockResolvedValue({ data: { id: 43, payment_method: 'COD' } });
  show();
  await toPaymentStep();
  fireEvent.click(await screen.findByRole('radio', { name: /Cash on delivery/ }));
  expect(screen.getByText('Amount to pay on delivery')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Place order · Pay ₹2,000 on delivery/ }));

  await waitFor(() => expect(landed?.pathname).toBe('/orders/43'));
  expect(api.post).toHaveBeenCalledWith('/orders', expect.objectContaining({ payment_method: 'COD' }));
  expect(payForOrder).not.toHaveBeenCalled();
});

it('selects cash on delivery and disables pay now when online payment is not set up', async () => {
  api.get.mockImplementation(async url => ({ data: url === '/payments/config' ? { online: false } : { eligible: false } }));
  show();
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/payments/config'));
  await toPaymentStep();
  expect(await screen.findByText(/Online payment is unavailable right now/)).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Pay now/ })).toBeDisabled();
  expect(screen.getByRole('radio', { name: /Cash on delivery/ })).toBeChecked();
});

it('flags test mode so nobody mistakes a trial payment for a real one', async () => {
  api.get.mockImplementation(async url => ({ data: url === '/payments/config' ? { online: true, mode: 'test' } : { eligible: false } }));
  show();
  await toPaymentStep();
  expect(await screen.findByText(/Test mode: no real money is charged/)).toBeInTheDocument();
});

it('does not show the test notice with live keys', async () => {
  api.get.mockImplementation(async url => ({ data: url === '/payments/config' ? { online: true, mode: 'live' } : { eligible: false } }));
  show();
  await toPaymentStep();
  await screen.findByRole('radio', { name: /Pay now/ });
  expect(screen.queryByText(/Test mode/)).not.toBeInTheDocument();
});
