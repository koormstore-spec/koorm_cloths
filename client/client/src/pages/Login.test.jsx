import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Login from './Login';

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({
  requestLoginCode: async () => ({ message: 'Code sent' }),
  verifyLoginCode: async () => ({}),
}) }));

function Destination() {
  const location = useLocation();
  return <p>{location.pathname}{location.search}{location.hash}</p>;
}

it('preserves the return and exchange email destination after customer login', async () => {
  render(<MemoryRouter initialEntries={[{ pathname: '/login', state: { from: { pathname: '/orders/42', search: '?source=email', hash: '#returns' } } }]}>
    <Routes><Route path="/login" element={<Login />} /><Route path="/orders/:id" element={<Destination />} /></Routes>
  </MemoryRouter>);
  fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'jane@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send Login Code' }));
  fireEvent.change(await screen.findByPlaceholderText('6-digit code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
  expect(await screen.findByText('/orders/42?source=email#returns')).toBeInTheDocument();
});
