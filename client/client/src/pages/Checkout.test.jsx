import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Checkout from './Checkout';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

vi.mock('../context/CartContext', () => ({ useCart: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const update = vi.fn();
const remove = vi.fn();
const item = { id: 4, name: 'Linen shirt', size: 'M', slug: 'linen-shirt', price: 1000, quantity: 2, stock: 3, images: [] };
function Harness({ initial = [item] }) {
  const [items, setItems] = useState(initial);
  useCart.mockReturnValue({ cartItems: items, cartTotal: items.reduce((sum, i) => sum + i.price * i.quantity, 0), refreshCart: vi.fn(),
    updateQuantity: async (id, quantity) => { await update(id, quantity); setItems(current => current.map(i => i.id === id ? { ...i, quantity } : i)); },
    removeFromCart: async id => { await remove(id); setItems(current => current.filter(i => i.id !== id)); },
  });
  return <Checkout />;
}
const show = initial => render(<MemoryRouter><Harness initial={initial} /></MemoryRouter>);
const decrease = () => screen.getByRole('button', { name: 'Decrease quantity for Linen shirt, size M' });
const increase = () => screen.getByRole('button', { name: 'Increase quantity for Linen shirt, size M' });
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { eligible: false } });
  update.mockResolvedValue(undefined);
  remove.mockResolvedValue(undefined);
  useAuth.mockReturnValue({ user: { name: 'Test customer' } });
  api.post.mockResolvedValue({ data: { code: 'FIRST30', discount_amount: 600 } });
});
it('prefills an eligible coupon when opening checkout directly', async () => {
  useAuth.mockReturnValue({ user: { id: 1, name: 'Test customer' } });
  api.get.mockResolvedValue({ data: { eligible: true } });
  show();
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Apply coupon code' })).toHaveValue('FIRST30'));
  expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Coupon FIRST30 applied');
});
it('reduces quantity, updates delivery and total, and prevents going below one', async () => {
  show();
  fireEvent.click(decrease());
  await waitFor(() => expect(decrease()).toBeDisabled());
  expect(update).toHaveBeenCalledWith(4, 1);
  expect(screen.getByText('₹1,099')).toBeInTheDocument();
  fireEvent.click(increase());
  await waitFor(() => expect(decrease()).toBeEnabled());
  expect(screen.getByText('Complimentary')).toBeInTheDocument();
});
it('disables increases at stock limit and can reduce stale quantities to available stock', async () => {
  show([{ ...item, quantity: 17, stock: 2 }]);
  expect(increase()).toBeDisabled();
  fireEvent.click(decrease());
  await waitFor(() => expect(update).toHaveBeenCalledWith(4, 2));
});
it('removes the selected size and shows an empty bag after the last removal', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Remove Linen shirt, size M' }));
  expect(await screen.findByText('Your bag is empty.')).toBeInTheDocument();
  expect(remove).toHaveBeenCalledWith(4);
});
it('shows failed edits without changing the bag and blocks checkout while saving', async () => {
  let reject;
  update.mockReturnValueOnce(new Promise((_, r) => { reject = r; }));
  show();
  fireEvent.click(decrease());
  expect(screen.getByRole('button', { name: /Continue to payment/ })).toBeDisabled();
  expect(increase()).toBeDisabled();
  reject({ response: { data: { message: 'Please try again.' } } });
  expect(await screen.findByRole('alert')).toHaveTextContent('Please try again.');
  expect(screen.getByLabelText('Quantity for Linen shirt, size M')).toHaveTextContent('2');
  expect(decrease()).toBeEnabled();
});
it('clears a previously computed coupon when quantities change', async () => {
  show();
  fireEvent.change(screen.getByPlaceholderText('Coupon code'), { target: { value: 'FIRST30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  await screen.findByText('Coupon discount');
  fireEvent.click(decrease());
  await waitFor(() => expect(screen.queryByText('Coupon discount')).not.toBeInTheDocument());
  expect(screen.getByText(/please re-apply your coupon/)).toBeInTheDocument();
});
