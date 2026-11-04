import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CartProvider, useCart } from './CartContext';
import { useAuth } from './AuthContext';
import api from '../api/axios';

vi.mock('./AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

// A tiny consumer so we can read the context's computed values in tests.
function CartProbe() {
  const { cartItems, cartCount, cartTotal, wishlist, toggleWishlist } = useCart();
  return (
    <div>
      <span data-testid="count">{cartCount}</span>
      <span data-testid="total">{cartTotal}</span>
      <span data-testid="items-length">{cartItems.length}</span>
      <button onClick={() => toggleWishlist(5)}>toggle-5</button>
      <span data-testid="wishlist-length">{wishlist.length}</span>
    </div>
  );
}

const renderWithProvider = () =>
  render(
    <CartProvider>
      <CartProbe />
    </CartProvider>
  );

describe('CartContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never fetches the cart for a logged-out visitor', async () => {
    useAuth.mockReturnValue({ user: null });
    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId('items-length')).toHaveTextContent('0'));
    expect(api.get).not.toHaveBeenCalledWith('/cart');
  });

  it('computes cartCount as the sum of quantities', async () => {
    useAuth.mockReturnValue({ user: { id: 1 } });
    api.get.mockImplementation((url) => {
      if (url === '/cart') {
        return Promise.resolve({
          data: [
            { id: 1, price: 100, discount_price: null, quantity: 2 },
            { id: 2, price: 200, discount_price: null, quantity: 3 },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('5'));
  });

  it('computes cartTotal using discount_price when present, falling back to price otherwise', async () => {
    useAuth.mockReturnValue({ user: { id: 1 } });
    api.get.mockImplementation((url) => {
      if (url === '/cart') {
        return Promise.resolve({
          data: [
            { id: 1, price: 1000, discount_price: 800, quantity: 2 }, // discounted: 800*2 = 1600
            { id: 2, price: 500, discount_price: null, quantity: 1 }, // no discount: 500*1 = 500
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('2100'));
  });

  it('adds to wishlist via POST when the product is not already in it', async () => {
    useAuth.mockReturnValue({ user: { id: 1 } });
    api.get.mockResolvedValue({ data: [] });
    api.post.mockResolvedValue({ data: {} });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId('items-length')).toHaveTextContent('0'));

    fireEvent.click(screen.getByText('toggle-5'));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/wishlist', { product_id: 5 }));
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('removes from wishlist via DELETE when the product is already in it', async () => {
    useAuth.mockReturnValue({ user: { id: 1 } });
    api.get.mockImplementation((url) => {
      if (url === '/wishlist') return Promise.resolve({ data: [{ id: 5 }] });
      return Promise.resolve({ data: [] });
    });
    api.delete.mockResolvedValue({ data: {} });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId('wishlist-length')).toHaveTextContent('1'));

    fireEvent.click(screen.getByText('toggle-5'));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/wishlist/5'));
    expect(api.post).not.toHaveBeenCalled();
  });
});
