import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Cart from './Cart';
import Checkout from './Checkout';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../context/CartContext', () => ({ useCart: vi.fn() }));
vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const baseItem = { id: 1, product_id: 9, slug: 'linen-shirt', name: 'Linen shirt', brand: 'Koorm', size: 'M', price: 2000, discount_price: null, images: [], quantity: 1, stock: 5 };

let updateQuantity;
let removeFromCart;

const cartView = () => <MemoryRouter initialEntries={['/cart']}><Routes><Route path="/cart" element={<Cart />} /><Route path="/checkout" element={<Checkout />} /><Route path="/orders/:id" element={<p>Order placed</p>} /></Routes></MemoryRouter>;

const setup = (items) => {
  updateQuantity = vi.fn().mockResolvedValue(undefined);
  removeFromCart = vi.fn().mockResolvedValue(undefined);
  useAuth.mockReturnValue({ user: { id: 1 } });
  useCart.mockReturnValue({ cartItems: items, loading: false, cartTotal: items.reduce((s, i) => s + i.price * i.quantity, 0), updateQuantity, removeFromCart, refreshCart: vi.fn().mockResolvedValue(undefined) });
  return render(cartView());
};

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { eligible: false } });
  api.post.mockResolvedValue({ data: { code: 'SAVE20', discount_amount: 400 } });
});

it('shows an out-of-stock badge and disables increasing quantity when stock has hit zero', () => {
  setup([{ ...baseItem, stock: 0 }]);
  expect(screen.getByText('Out of stock')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled();
});

it('shows an insufficient-stock badge when the cart quantity exceeds what is left', () => {
  setup([{ ...baseItem, quantity: 3, stock: 2 }]);
  expect(screen.getByText('Only 2 left in stock')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled();
});

it('disables increasing quantity once it reaches the stock limit, without showing the shortfall badge', () => {
  setup([{ ...baseItem, quantity: 2, stock: 2 }]);
  expect(screen.queryByText(/left in stock/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled();
});

it('increases quantity when stock allows it', () => {
  setup([{ ...baseItem, quantity: 1, stock: 5 }]);
  fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
  expect(updateQuantity).toHaveBeenCalledWith(1, 2);
});

it('disables increasing quantity and shows the limit badge once a product reaches the 4-item cap, even with stock to spare', () => {
  setup([{ ...baseItem, quantity: 4, stock: 50 }]);
  expect(screen.getByText('Limit of 4 per product reached')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled();
});

it('caps the total across different sizes of the same product at 4', () => {
  setup([
    { ...baseItem, id: 1, size: 'M', quantity: 3, stock: 50 },
    { ...baseItem, id: 2, size: 'L', quantity: 1, stock: 50 },
  ]);
  const limitMessages = screen.getAllByText('Limit of 4 per product reached');
  expect(limitMessages).toHaveLength(2);
  for (const button of screen.getAllByRole('button', { name: 'Increase quantity' })) {
    expect(button).toBeDisabled();
  }
});

it('does not cap a different product even if combined with this one it would exceed 4', () => {
  setup([
    { ...baseItem, id: 1, product_id: 9, quantity: 3, stock: 50 },
    { ...baseItem, id: 2, product_id: 10, size: 'L', quantity: 3, stock: 50 },
  ]);
  expect(screen.queryByText('Limit of 4 per product reached')).not.toBeInTheDocument();
  for (const button of screen.getAllByRole('button', { name: 'Increase quantity' })) {
    expect(button).toBeEnabled();
  }
});

it('shows the server\'s stock message when increasing quantity is rejected', async () => {
  updateQuantity = vi.fn().mockRejectedValue({ response: { data: { message: 'Only 1 left in stock for Linen shirt' } } });
  useAuth.mockReturnValue({ user: { id: 1 } });
  useCart.mockReturnValue({ cartItems: [{ ...baseItem, quantity: 1, stock: 5 }], loading: false, cartTotal: 2000, updateQuantity, removeFromCart: vi.fn() });
  render(<MemoryRouter><Cart /></MemoryRouter>);

  fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));

  expect(await screen.findByText('Only 1 left in stock for Linen shirt')).toBeInTheDocument();
});

const enterCoupon = (code = 'save20') => {
  fireEvent.change(screen.getByRole('textbox', { name: 'Apply coupon code' }), { target: { value: code } });
  fireEvent.submit(screen.getByRole('form', { name: 'Apply coupon code' }));
};

it('prefills FIRST30 for an eligible customer and carries it into checkout after Apply', async () => {
  api.get.mockResolvedValue({ data: { eligible: true } });
  api.post.mockResolvedValue({ data: { code: 'FIRST30', discount_amount: 600 } });
  setup([baseItem]);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Apply coupon code' })).toHaveValue('FIRST30'));
  expect(screen.queryByText('Coupon discount')).not.toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Coupon FIRST30 applied');
  expect(screen.getByText('₹1,400')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Secure checkout/ }));
  expect(await screen.findByRole('status')).toHaveTextContent('Coupon FIRST30 applied');
  expect(api.post).toHaveBeenNthCalledWith(2, '/coupons/validate', { code: 'FIRST30' });
  expect(screen.getByText('₹1,400')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove', exact: true }));
  expect(screen.queryByText('Coupon discount')).not.toBeInTheDocument();
});

it('applies a normalized coupon, updates the total, and can remove the discount', async () => {
  setup([baseItem]);
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  enterCoupon(' save20 ');
  expect(await screen.findByRole('status')).toHaveTextContent('Coupon SAVE20 applied');
  expect(api.post).toHaveBeenCalledWith('/coupons/validate', { code: 'SAVE20' });
  expect(screen.getByText('−₹400')).toBeInTheDocument();
  expect(screen.getByText('₹1,600')).toBeInTheDocument();
  expect(screen.getByText('Complimentary')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Remove', exact: true }));
  expect(screen.queryByText('Coupon discount')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Apply coupon code' })).toHaveValue('');
  expect(within(screen.getByRole('complementary')).getAllByText('₹2,000')).toHaveLength(2);
});

it('shows validation errors without discounting the order', async () => {
  api.post.mockRejectedValueOnce({ response: { data: { message: 'This coupon has expired' } } });
  setup([baseItem]);
  enterCoupon('EXPIRED');
  expect(await screen.findByRole('alert')).toHaveTextContent('This coupon has expired');
  expect(screen.getByRole('textbox', { name: 'Apply coupon code' })).toHaveAttribute('aria-invalid', 'true');
  expect(screen.queryByText('Coupon discount')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Secure checkout/ })).toBeEnabled();
});

it('disables duplicate submissions and checkout while validating a coupon', async () => {
  let resolve;
  api.post.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  setup([baseItem]);
  enterCoupon();
  expect(screen.getByRole('button', { name: 'Checking...' })).toBeDisabled();
  expect(screen.getByRole('button', { name: /Secure checkout/ })).toBeDisabled();
  await act(async () => resolve({ data: { code: 'SAVE20', discount_amount: 400 } }));
  expect(screen.getByRole('button', { name: /Secure checkout/ })).toBeEnabled();
});

it('clears the coupon if bag contents change even when the subtotal stays the same', async () => {
  const { rerender } = setup([baseItem]);
  enterCoupon();
  await screen.findByText('Coupon discount');
  useCart.mockReturnValue({ ...useCart(), cartItems: [{ ...baseItem, id: 2, size: 'L' }] });
  rerender(cartView());
  expect(screen.queryByText('Coupon discount')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Your bag changed — please re-apply your coupon.');
  expect(screen.getByRole('textbox', { name: 'Apply coupon code' })).toHaveValue('SAVE20');
});

it('ignores an old validation response after the bag changes', async () => {
  let resolve;
  api.post.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  const { rerender } = setup([baseItem]);
  enterCoupon();
  useCart.mockReturnValue({ ...useCart(), cartItems: [{ ...baseItem, quantity: 2 }], cartTotal: 4000 });
  rerender(cartView());
  await act(async () => resolve({ data: { code: 'SAVE20', discount_amount: 400 } }));
  expect(screen.queryByText('Coupon discount')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('please re-apply your coupon');
  expect(screen.getByRole('button', { name: /Secure checkout/ })).toBeEnabled();
});

it('carries the code into checkout, revalidates it, and includes it when ordering', async () => {
  setup([baseItem]);
  enterCoupon();
  await screen.findByText('Coupon discount');
  fireEvent.click(screen.getByRole('button', { name: /Secure checkout/ }));
  expect(await screen.findByRole('status')).toHaveTextContent('Coupon SAVE20 applied');
  expect(api.post).toHaveBeenNthCalledWith(2, '/coupons/validate', { code: 'SAVE20' });
  expect(screen.getByText('₹1,600')).toBeInTheDocument();
  api.post.mockResolvedValueOnce({ data: { id: 42 } });
  fireEvent.submit(screen.getByRole('button', { name: /Continue to payment/ }).closest('form'));
  fireEvent.submit((await screen.findByRole('button', { name: /Place order|now/ })).closest('form'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders', expect.objectContaining({ coupon_code: 'SAVE20' })));
  expect(await screen.findByText('Order placed')).toBeInTheDocument();
});
