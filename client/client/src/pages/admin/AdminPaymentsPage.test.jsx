import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminPaymentsPage from './AdminPaymentsPage';
import api from '../../api/adminAxios';
import { paymentMethodLabel } from '../../lib/paymentDetails';

vi.mock('../../api/adminAxios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ admin: { name: 'Admin' }, adminLogout: vi.fn() }) }));

const upiPayment = {
  id: 7, order_number: 'KRM7', customer_name: 'Jane Doe', customer_email: 'jane@example.com', shipping_phone: '9876543210',
  shipping_city: 'Pune', shipping_state: 'Maharashtra', payment_status: 'paid', total_amount: '1400.00', refunded_amount: '0.00',
  razorpay_order_id: 'order_7', razorpay_payment_id: 'pay_7', paid_at: '2026-10-30T10:00:00Z', created_at: '2026-10-30T09:58:00Z', refunds: [],
  payment_details: { method: 'upi', vpa: 'jane@okhdfcbank', contact: '+919876543210', fee: 33.04, tax: 5.04, reference: { rrn: '330012345678', upi_transaction_id: 'UPI777' } },
};
const cardPayment = {
  ...upiPayment, id: 8, order_number: 'KRM8', customer_name: 'Ravi', customer_email: 'ravi@example.com', razorpay_payment_id: 'pay_8',
  payment_status: 'partially_refunded', refunded_amount: '200.00',
  refunds: [{ id: 1, amount: '200.00', status: 'processed', reason: 'Item returned', created_at: '2026-10-31T10:00:00Z' }],
  payment_details: { method: 'card', card: { name: 'Ravi K', network: 'Visa', type: 'credit', issuer: 'HDFC', last4: '4242' }, reference: {} },
};
const response = (overrides = {}) => ({ data: { mode: 'test', online: true, summary: { count: 2, collected: 2800, refunded: 200, fees: 33.04, net: 2566.96 }, payments: [upiPayment, cardPayment], ...overrides } });
const show = () => render(<MemoryRouter initialEntries={['/admin/payments']}><AdminPaymentsPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(url => url === '/admin/payments' ? Promise.resolve(response()) : Promise.resolve({ data: { count: 0 } }));
});

it('summarises collections and lists how each customer paid', async () => {
  show();
  expect(await screen.findByText('₹2,800')).toBeInTheDocument();
  expect(screen.getByText('₹2,566.96')).toBeInTheDocument();
  expect(screen.getByText('UPI · jane@okhdfcbank')).toBeInTheDocument();
  expect(screen.getByText('Visa credit •••• 4242')).toBeInTheDocument();
  expect(screen.getByText('Razorpay test mode')).toBeInTheDocument();
});

it('opens the payer account and bank reference for a payment', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Show payment details for KRM7' }));
  expect(screen.getByText('330012345678')).toBeInTheDocument();
  expect(screen.getByText('UPI777')).toBeInTheDocument();
  expect(screen.getByText('+919876543210')).toBeInTheDocument();
  expect(screen.getByText('₹1,366.96')).toBeInTheDocument(); // net of the Razorpay fee
  expect(screen.getByRole('link', { name: /Open in Razorpay/ })).toHaveAttribute('href', 'https://dashboard.razorpay.com/app/payments/pay_7');
});

it('shows card details and refunds', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Show payment details for KRM8' }));
  expect(screen.getByText('•••• •••• •••• 4242')).toBeInTheDocument();
  expect(screen.getByText('HDFC Bank')).toBeInTheDocument();
  expect(screen.getByText('Ravi K')).toBeInTheDocument();
  expect(screen.getByText('Item returned', { exact: false })).toBeInTheDocument();
});

it('finds a payment by UPI ID', async () => {
  show();
  await screen.findByText('KRM7');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'okhdfc' } });
  expect(screen.getByText('KRM7')).toBeInTheDocument();
  expect(screen.queryByText('KRM8')).not.toBeInTheDocument();
});

it('fetches details from Razorpay for a payment that has none saved', async () => {
  api.get.mockImplementation(url => url === '/admin/payments'
    ? Promise.resolve(response({ payments: [{ ...upiPayment, payment_details: null }] }))
    : Promise.resolve({ data: { count: 0 } }));
  api.post.mockResolvedValue({ data: { id: 7, payment_details: upiPayment.payment_details } });
  show();
  expect(await screen.findByText('Details not fetched')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show payment details for KRM7' }));
  fireEvent.click(screen.getByRole('button', { name: 'Fetch latest from Razorpay' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/payments/7/refresh'));
  expect(await screen.findByText('KRM7: payment details updated from Razorpay.')).toBeInTheDocument();
  expect(screen.getAllByText('UPI · jane@okhdfcbank').length).toBeGreaterThan(0);
});

it('describes each payment method in one line', () => {
  expect(paymentMethodLabel({ method: 'netbanking', bank: 'SBIN' })).toBe('Net banking · State Bank of India');
  expect(paymentMethodLabel({ method: 'wallet', wallet: 'paytm' })).toBe('Wallet · Paytm');
  expect(paymentMethodLabel(null)).toBeNull();
});
