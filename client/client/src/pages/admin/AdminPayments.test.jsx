import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminOrders from './AdminOrders';
import AdminReturns from './AdminReturns';
import api from '../../api/adminAxios';

vi.mock('../../api/adminAxios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ admin: { name: 'Admin' }, adminLogout: vi.fn() }) }));

const paidOrder = {
  id: 7, order_number: 'KRM7', customer_name: 'Jane', customer_email: 'jane@example.com', created_at: new Date().toISOString(),
  status: 'placed', payment_method: 'ONLINE', payment_status: 'paid', total_amount: 2000, refunded_amount: 0, refunds: [],
};
const show = (page) => render(<MemoryRouter>{page}</MemoryRouter>);
// The admin pages render a mobile and a desktop layout; tests use the first.
const first = (elements) => elements[0];

const listGet = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  listGet.mockReset();
  api.get.mockImplementation(url => url.endsWith('-count') ? Promise.resolve({ data: { count: 0 } }) : listGet(url));
});

it('shows cancellation requests and requires explicit approval before cancelling', async () => {
  listGet.mockResolvedValueOnce({ data: [{ ...paidOrder, cancellation_status: 'requested' }] })
    .mockResolvedValue({ data: [{ ...paidOrder, status: 'cancelled', cancellation_status: 'approved' }] });
  api.put.mockResolvedValue({ data: { message: 'Order cancelled' } });
  show(<AdminOrders />);
  expect(await screen.findByText('1 cancellation request(s) awaiting approval.')).toBeInTheDocument();
  expect(screen.getByLabelText('1 cancellation requests awaiting approval')).toHaveTextContent('1');
  expect(screen.queryByRole('combobox', { name: 'Status for KRM7' })).not.toBeInTheDocument();
  fireEvent.click(first(screen.getAllByRole('button', { name: 'Approve cancellation' })));
  expect(api.put).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Approve and cancel order' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/orders/admin/7/status', { status: 'cancelled' }));
  expect(await screen.findByText('KRM7: Order cancelled')).toBeInTheDocument();
  expect(screen.queryByLabelText('1 cancellation requests awaiting approval')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Approve cancellation' })).not.toBeInTheDocument();
});

it('filters the admin list to cancellation requests', async () => {
  listGet.mockResolvedValue({ data: [paidOrder, { ...paidOrder, id: 8, order_number: 'KRM8', cancellation_status: 'requested' }] });
  show(<AdminOrders />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review cancellation requests' }));
  expect(screen.queryByText('KRM7')).not.toBeInTheDocument();
  expect(screen.getAllByText('KRM8').length).toBeGreaterThan(0);
});

it('asks before cancelling a paid order, then reports the refund', async () => {
  listGet.mockResolvedValue({ data: [paidOrder] });
  api.put.mockResolvedValue({ data: { message: 'Order cancelled. Your refund of ₹2,000 has been started and usually arrives in 5–7 working days.' } });
  show(<AdminOrders />);

  fireEvent.change(first(await screen.findAllByRole('combobox', { name: 'Status for KRM7' })), { target: { value: 'cancelled' } });
  const dialog = screen.getByRole('alertdialog');
  expect(dialog).toHaveTextContent('₹2,000 is refunded to the customer’s original payment method');
  expect(api.put).not.toHaveBeenCalled();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel order' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/orders/admin/7/status', { status: 'cancelled' }));
  expect(await screen.findByText(/KRM7: Order cancelled. Your refund/)).toBeInTheDocument();
});

it('refunds part of a paid order from the orders page', async () => {
  listGet.mockResolvedValue({ data: [paidOrder] });
  api.post.mockResolvedValue({ data: { refund: { amount: 500, method: 'razorpay' } } });
  show(<AdminOrders />);

  fireEvent.click(first(await screen.findAllByRole('button', { name: 'Refund' })));
  const form = first(screen.getAllByRole('form', { name: 'Refund KRM7' }));
  fireEvent.change(within(form).getByLabelText('Amount (₹)'), { target: { value: '500' } });
  fireEvent.change(within(form).getByLabelText(/Reason/), { target: { value: 'Small stain' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Refund' }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/admin/7/refund', { amount: 500, reason: 'Small stain', reference: '' }));
  expect(await screen.findByText(/refund of ₹500 started/)).toBeInTheDocument();
});

it('will not refund more than the order total', async () => {
  listGet.mockResolvedValue({ data: [paidOrder] });
  show(<AdminOrders />);
  fireEvent.click(first(await screen.findAllByRole('button', { name: 'Refund' })));
  const form = first(screen.getAllByRole('form', { name: 'Refund KRM7' }));
  fireEvent.change(within(form).getByLabelText('Amount (₹)'), { target: { value: '2500' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Refund' }));
  expect(await within(form).findByRole('alert')).toHaveTextContent('Enter an amount between ₹1 and ₹2,000.');
  expect(api.post).not.toHaveBeenCalled();
});

it('does not offer a refund on an unpaid cash-on-delivery order', async () => {
  listGet.mockResolvedValue({ data: [{ ...paidOrder, payment_method: 'COD', payment_status: 'cod' }] });
  show(<AdminOrders />);
  await screen.findAllByText('KRM7');
  expect(screen.queryByRole('button', { name: 'Refund' })).not.toBeInTheDocument();
});

it('moves a return through approve and refund', async () => {
  const request = { id: 3, order_id: 7, order_number: 'KRM7', customer_name: 'Jane', customer_email: 'jane@example.com', reason: 'Size or fit issue', status: 'requested', created_at: new Date().toISOString(), total_amount: 2000, refunded_amount: 0, payment_method: 'ONLINE', payment_status: 'paid', items: [] };
  const returnResponses = vi.fn().mockResolvedValueOnce({ data: [request] }).mockResolvedValueOnce({ data: [{ ...request, status: 'approved' }] });
  listGet.mockImplementation(() => returnResponses());
  api.put.mockResolvedValue({ data: {} });
  show(<AdminReturns />);

  fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/returns/admin/3', { action: 'approve', admin_note: '' }));

  fireEvent.click(await screen.findByRole('button', { name: 'Refund' }));
  fireEvent.click(screen.getByRole('button', { name: 'Refund and close return' }));
  await waitFor(() => expect(api.put).toHaveBeenLastCalledWith('/returns/admin/3', { action: 'refund', admin_note: '', amount: 2000, reason: '', reference: '' }));
});

it.each(['Approve', 'Decline'])('updates the notification badge after the admin chooses %s for an exchange', async label => {
  const request = { id: 5, order_id: 7, order_number: 'KRM7', request_type: 'exchange', exchange_details: 'Size L', customer_name: 'Jane', reason: 'Size or fit issue', status: 'requested', created_at: new Date().toISOString(), items: [] };
  const status = label === 'Approve' ? 'approved' : 'rejected';
  listGet.mockResolvedValueOnce({ data: [request] }).mockResolvedValue({ data: [{ ...request, status }] });
  api.put.mockResolvedValue({ data: { status } });
  show(<AdminReturns />);
  expect(await screen.findByRole('link', { name: 'Review 1 pending return and exchange requests' })).toBeInTheDocument();
  expect(screen.getByText('Size L')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Refund' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: label }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/returns/admin/5', { action: label === 'Approve' ? 'approve' : 'reject', admin_note: '' }));
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Review 1 pending return and exchange requests' })).not.toBeInTheDocument());
  expect(screen.queryByRole('button', { name: 'Refund' })).not.toBeInTheDocument();
});

it('keeps an exchange pending and its badge visible if approval fails', async () => {
  listGet.mockResolvedValue({ data: [{ id: 5, order_id: 7, order_number: 'KRM7', request_type: 'exchange', status: 'requested', created_at: new Date().toISOString(), items: [] }] });
  api.put.mockRejectedValue({ response: { data: { message: 'Please try again.' } } });
  show(<AdminReturns />);
  fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Please try again.');
  expect(screen.getByRole('link', { name: 'Review 1 pending return and exchange requests' })).toBeInTheDocument();
});
