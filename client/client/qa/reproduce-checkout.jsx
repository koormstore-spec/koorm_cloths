import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import Checkout from '../src/pages/Checkout';
import { useCart } from '../src/context/CartContext';
import { useAuth } from '../src/context/AuthContext';
import api from '../src/api/axios';

vi.mock('../src/context/CartContext', () => ({ useCart: vi.fn() }));
vi.mock('../src/context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../src/api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../src/hooks/useCoupon', () => ({ default: () => ({ discountAmount: 0, applyingCoupon: false }) }));
vi.mock('../src/components/CouponCode', () => ({ default: () => null }));
vi.mock('../src/lib/razorpay', () => ({ payForOrder: vi.fn() }));

it('REPRODUCES B09: a failed cart refresh strands a successfully placed COD order', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const refreshCart = vi.fn().mockRejectedValue(new Error('cart unavailable'));
  useAuth.mockReturnValue({ user: { id: 1, name: 'QA', phone: '9876543210' } });
  useCart.mockReturnValue({
    cartItems: [{ id: 1, product_id: 9, name: 'QA Shirt', size: 'M', slug: 'qa-shirt', quantity: 1, stock: 10, price: 2500, images: [] }],
    cartTotal: 2500, refreshCart,
  });
  api.get.mockResolvedValue({ data: { online: false } });
  api.post.mockResolvedValue({ data: { id: 42, payment_method: 'COD' } });
  render(<MemoryRouter initialEntries={['/checkout']}><Routes>
    <Route path="/checkout" element={<Checkout />} />
    <Route path="/orders/:id" element={<p>Order confirmation</p>} />
  </Routes></MemoryRouter>);
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/payments/config'));
  for (const [placeholder, value] of [['House no., building, street', '1 Test Road'], ['City', 'Pune'], ['State', 'Maharashtra'], ['6-digit pincode', '411001']]) {
    fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });
  }
  fireEvent.click(screen.getByRole('button', { name: /Continue to payment/ }));
  const submit = await screen.findByRole('button', { name: /Place order/ });
  await waitFor(() => expect(submit).toBeEnabled());

  // Invoke the mounted form's actual React handler and await its rejected
  // promise, so the reproduction does not leak an unhandled rejection into
  // the runner. In the browser React does not await async event handlers.
  const form = submit.closest('form');
  const propsKey = Object.keys(form).find(key => key.startsWith('__reactProps$'));
  await act(async () => {
    await expect(form[propsKey].onSubmit({ preventDefault() {} })).rejects.toThrow('cart unavailable');
  });
  expect(api.post).toHaveBeenCalledWith('/orders', expect.objectContaining({ payment_method: 'COD' }));
  expect(refreshCart).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Order confirmation')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Placing your order/ })).toBeDisabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  vi.restoreAllMocks();
});
