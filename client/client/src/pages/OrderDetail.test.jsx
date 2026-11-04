import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import OrderDetail from './OrderDetail';
import api from '../api/axios';
import { payForOrder } from '../lib/razorpay';

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock('../lib/razorpay', () => ({ payForOrder: vi.fn() }));

const base = {
  id: 42, order_number: 'KRM42', status: 'placed', payment_method: 'ONLINE', payment_status: 'paid',
  total_amount: 2000, refunded_amount: 0, items_total: 2000, shipping_fee: 0, discount_amount: 0,
  created_at: new Date().toISOString(), delivered_at: null, items: [{ id: 1, product_name: 'Linen shirt', size: 'M', quantity: 2, price: 1000 }],
  refunds: [], returns: [], shipping_name: 'Jane', shipping_phone: '9876543210', shipping_address_line1: '1 Road',
  shipping_city: 'Pune', shipping_state: 'Maharashtra', shipping_pincode: '411001',
};
const show = (state) => render(<MemoryRouter initialEntries={[{ pathname: '/orders/42', state }]}><Routes><Route path="/orders/:id" element={<OrderDetail />} /></Routes></MemoryRouter>);

beforeEach(() => vi.clearAllMocks());

it('hides payment and duplicate cancellation actions while awaiting approval', async () => {
  api.get.mockResolvedValue({ data: { ...base, status: 'pending_payment', payment_status: 'pending', cancellation_status: 'requested' } });
  show();
  expect(await screen.findByText('Cancellation requested')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Complete payment/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Request Cancellation' })).not.toBeInTheDocument();
});

it('lets the customer complete payment for an order still awaiting it', async () => {
  api.get.mockResolvedValueOnce({ data: { ...base, status: 'pending_payment', payment_status: 'pending' } })
    .mockResolvedValueOnce({ data: base });
  api.post.mockResolvedValue({ data: { razorpay_order_id: 'order_1' } });
  payForOrder.mockResolvedValue({});
  show({ paymentIssue: 'Payment was not completed.' });

  expect(await screen.findByText('Your order is waiting for payment.')).toBeInTheDocument();
  expect(screen.getByText(/Payment was not completed\./)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Complete payment of ₹2,000' }));

  await waitFor(() => expect(payForOrder).toHaveBeenCalledWith(42, { razorpay_order_id: 'order_1' }));
  expect(api.post).toHaveBeenCalledWith('/payments/orders/42/retry');
  expect(await screen.findByText(/Payment received and order confirmed/)).toBeInTheDocument();
});

it('requests cancellation and shows pending approval without claiming a refund', async () => {
  api.get.mockResolvedValueOnce({ data: base }).mockResolvedValue({ data: { ...base, cancellation_status: 'requested' } });
  api.put.mockResolvedValue({ data: { message: 'Cancellation requested. Your order will be cancelled after admin approval.' } });
  show();
  expect(await screen.findByText(/After admin approval/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Request Cancellation' }));
  expect(await screen.findByText('Cancellation requested')).toBeInTheDocument();
  expect(api.put).toHaveBeenCalledWith('/orders/42/cancel');
  expect(screen.queryByRole('button', { name: 'Request Cancellation' })).not.toBeInTheDocument();
  expect(screen.queryByText(/refund.*has been started/)).not.toBeInTheDocument();
});

it('shows why a cancellation failed instead of failing silently', async () => {
  api.get.mockResolvedValue({ data: base });
  api.put.mockRejectedValue({ response: { data: { message: 'Cannot cancel an order that is shipped' } } });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Request Cancellation' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Cannot cancel an order that is shipped');
});

it('lets the customer request a return for a recently delivered order', async () => {
  const delivered = { ...base, status: 'delivered', delivered_at: new Date().toISOString() };
  api.get.mockResolvedValueOnce({ data: delivered })
    .mockResolvedValueOnce({ data: { ...delivered, returns: [{ id: 1, reason: 'Size or fit issue', status: 'requested', created_at: new Date().toISOString() }] } });
  api.post.mockResolvedValue({ data: {} });
  show();

  fireEvent.click(await screen.findByRole('button', { name: 'Request a return' }));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Size or fit issue' } });
  expect(screen.getByText(/Photos are not required for size or fit issues/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Send return request' }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/returns', { order_id: 42, reason: 'Size or fit issue', note: '', request_type: 'return' }));
  expect(await screen.findByText('Return requested')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Request a return' })).not.toBeInTheDocument();
});

it('does not offer returns after the 30-day window', async () => {
  api.get.mockResolvedValue({ data: { ...base, status: 'delivered', delivered_at: new Date(Date.now() - 31 * 86400000).toISOString() } });
  show();
  await screen.findByText('KRM42');
  expect(screen.queryByRole('button', { name: 'Request a return' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Request an exchange' })).not.toBeInTheDocument();
});

it.each(['return', 'exchange'])('requires a damage photo before sending a %s and supports removing and reselecting it', async requestType => {
  api.get.mockResolvedValue({ data: { ...base, status: 'delivered', delivered_at: new Date().toISOString() } });
  api.post.mockResolvedValue({ data: {} });
  show();
  fireEvent.click(await screen.findByRole('button', { name: requestType === 'return' ? 'Request a return' : 'Request an exchange' }));
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Damaged or defective' } });
  if (requestType === 'exchange') fireEvent.change(screen.getByLabelText('Requested replacement'), { target: { value: 'Same shirt, undamaged' } });
  const send = screen.getByRole('button', { name: `Send ${requestType} request` });
  fireEvent.click(send);
  expect(await screen.findByRole('alert')).toHaveTextContent('Upload at least one photo');
  expect(api.post).not.toHaveBeenCalled();
  const photo = new File(['photo bytes'], 'clothing.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Clothing photos (required)'), { target: { files: [photo] } });
  expect(await screen.findByAltText('Selected clothing photo 1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));
  fireEvent.click(send);
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Clothing photos (required)'), { target: { files: [photo] } });
  await screen.findByAltText('Selected clothing photo 1');
  fireEvent.click(send);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/returns', expect.objectContaining({ reason: 'Damaged or defective', request_type: requestType, images: ['data:image/png;base64,cGhvdG8gYnl0ZXM='] })));
});

it('rejects unsupported files and allows switching a damage request to a size issue without photos', async () => {
  api.get.mockResolvedValue({ data: { ...base, status: 'delivered', delivered_at: new Date().toISOString() } });
  api.post.mockResolvedValue({ data: {} });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Request a return' }));
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Damaged or defective' } });
  fireEvent.change(screen.getByLabelText('Clothing photos (required)'), { target: { files: [new File(['pdf'], 'file.pdf', { type: 'application/pdf' })] } });
  expect(await screen.findByRole('alert')).toHaveTextContent('JPG, PNG or WebP');
  expect(screen.queryByAltText('Selected clothing photo 1')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Size or fit issue' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send return request' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/returns', { order_id: 42, reason: 'Size or fit issue', note: '', request_type: 'return' }));
});

it('submits replacement details for an exchange and shows pending admin approval', async () => {
  const delivered = { ...base, status: 'delivered', delivered_at: new Date().toISOString() };
  api.get.mockResolvedValueOnce({ data: delivered }).mockResolvedValue({ data: { ...delivered, returns: [{ id: 2, request_type: 'exchange', exchange_details: 'Size L', reason: 'Size or fit issue', status: 'requested', created_at: new Date().toISOString() }] } });
  api.post.mockResolvedValue({ data: {} });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Request an exchange' }));
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Size or fit issue' } });
  fireEvent.change(screen.getByLabelText('Requested replacement'), { target: { value: 'Size L' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send exchange request' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/returns', { order_id: 42, reason: 'Size or fit issue', note: '', request_type: 'exchange', exchange_details: 'Size L' }));
  expect(await screen.findByText('Exchange requested')).toBeInTheDocument();
  expect(screen.getByText('Awaiting admin approval. We will email you after review.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Request an exchange' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Request a return' })).not.toBeInTheDocument();
});

it('does not offer returns or exchanges before delivery', async () => {
  api.get.mockResolvedValue({ data: { ...base, status: 'shipped' } });
  show();
  await screen.findByText('KRM42');
  expect(screen.queryByRole('button', { name: 'Request an exchange' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Request a return' })).not.toBeInTheDocument();
});

it.each(['shipped', 'delivered'])('opens the email-linked request section for a %s order without submitting anything', async status => {
  api.get.mockResolvedValue({ data: { ...base, status, delivered_at: status === 'delivered' ? new Date().toISOString() : null } });
  render(<MemoryRouter initialEntries={['/orders/42#returns']}><Routes><Route path="/orders/:id" element={<OrderDetail />} /></Routes></MemoryRouter>);
  const section = await screen.findByRole('region', { name: 'Returns & exchanges' });
  expect(section).toHaveAttribute('id', 'returns');
  await waitFor(() => expect(section).toHaveFocus());
  if (status === 'shipped') expect(section).toHaveTextContent('after your order is delivered');
  else expect(screen.getByRole('button', { name: 'Request an exchange' })).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

it('counts the return window from delivery even if the order was placed months ago', async () => {
  api.get.mockResolvedValue({ data: { ...base, status: 'delivered', created_at: new Date(Date.now() - 60 * 86400000).toISOString(), delivered_at: new Date().toISOString() } });
  show();
  expect(await screen.findByRole('button', { name: 'Request a return' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Request an exchange' })).toBeInTheDocument();
});

it('asks support to confirm a missing delivery date instead of using the purchase date', async () => {
  api.get.mockResolvedValue({ data: { ...base, status: 'delivered', delivered_at: null } });
  show();
  expect(await screen.findByRole('link', { name: 'contact support' })).toHaveAttribute('href', '/contact');
  expect(screen.queryByRole('button', { name: 'Request a return' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Request an exchange' })).not.toBeInTheDocument();
});

it('lists refunds on the order', async () => {
  api.get.mockResolvedValue({ data: { ...base, status: 'cancelled', payment_status: 'refunded', refunded_amount: 2000, refunds: [{ id: 1, amount: 2000, method: 'razorpay', status: 'pending', created_at: new Date().toISOString() }] } });
  show();
  expect(await screen.findByText(/₹2,000 · to your original payment method/)).toBeInTheDocument();
  expect(screen.getByText('Processing (5–7 working days)')).toBeInTheDocument();
});
