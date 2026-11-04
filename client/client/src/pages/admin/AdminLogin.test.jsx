import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import AdminLogin from './AdminLogin';
import { useAdminAuth } from '../../context/AdminAuthContext';

vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: vi.fn() }));
const auth = { adminLogin: vi.fn(), requestAdminSetupCode: vi.fn(), verifyAdminSetup: vi.fn(), requestAdminPasswordReset: vi.fn(), resetAdminPassword: vi.fn() };
let path = '';
function Spy() { const location = useLocation(); path = location.pathname + location.search; return null; }
const show = (state) => render(<MemoryRouter initialEntries={[{ pathname: '/admin/login', state }]}><AdminLogin /><Spy /></MemoryRouter>);

beforeEach(() => {
  vi.resetAllMocks();
  useAdminAuth.mockReturnValue(auth);
});

it('returns to the cancellation review link after admin login', async () => {
  auth.adminLogin.mockResolvedValue({});
  show({ from: { pathname: '/admin/orders', search: '?search=KRM7' } });
  fireEvent.change(screen.getByLabelText(/Admin email/), { target: { value: 'admin@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'admin-password' } });
  fireEvent.click(screen.getByRole('button', { name: /Sign in to workspace/ }));
  await waitFor(() => expect(path).toBe('/admin/orders?search=KRM7'));
});

it('lets an admin who forgot their password get a code, then set a new password and sign in', async () => {
  auth.requestAdminPasswordReset.mockResolvedValue({ message: 'A password reset code has been sent to the admin email address.' });
  auth.resetAdminPassword.mockResolvedValue({});
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  fireEvent.change(screen.getByLabelText(/Admin email/), { target: { value: 'koormstore@gmail.com' } });
  fireEvent.click(screen.getByRole('button', { name: /Email reset code/ }));
  expect(await screen.findByText(/reset code has been sent/)).toBeInTheDocument();
  expect(auth.requestAdminPasswordReset).toHaveBeenCalledWith('koormstore@gmail.com');

  fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'brand-new-pass' } });
  fireEvent.click(screen.getByRole('button', { name: /Save new password/ }));
  await waitFor(() => expect(auth.resetAdminPassword).toHaveBeenCalledWith('koormstore@gmail.com', '123456', 'brand-new-pass'));
  await waitFor(() => expect(path).toBe('/admin'));
});

it('shows the server message when the reset code is wrong', async () => {
  auth.requestAdminPasswordReset.mockResolvedValue({ message: 'sent' });
  auth.resetAdminPassword.mockRejectedValue({ response: { data: { message: 'Invalid or expired verification code' } } });
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  fireEvent.change(screen.getByLabelText(/Admin email/), { target: { value: 'koormstore@gmail.com' } });
  fireEvent.click(screen.getByRole('button', { name: /Email reset code/ }));
  await screen.findByPlaceholderText('6-digit code');
  fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '000000' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'brand-new-pass' } });
  fireEvent.click(screen.getByRole('button', { name: /Save new password/ }));
  expect(await screen.findByText('Invalid or expired verification code')).toBeInTheDocument();
  expect(path).toBe('/admin/login');
});

it('can go back to sign in from the reset screen', () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
  expect(screen.getByRole('button', { name: /Sign in to workspace/ })).toBeInTheDocument();
});
