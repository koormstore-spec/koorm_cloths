import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProductDetail from './ProductDetail';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../context/CartContext', () => ({ useCart: vi.fn() }));
vi.mock('../components/ProductGallery', () => ({ default: () => null }));
const addToCart = vi.fn();
const product = { id: 2, name: 'Linen shirt', slug: 'linen-shirt', price: 2000, stock: 2, sizes: ['S', 'M'], images: [], reviews: [], related: [], can_review: false };
beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
  api.get.mockResolvedValue({ data: product });
  api.post.mockResolvedValue({ data: {} });
  addToCart.mockResolvedValue(undefined);
  useAuth.mockReturnValue({ user: { id: 1 } });
  useCart.mockReturnValue({ addToCart, wishlist: [], toggleWishlist: vi.fn() });
});
const openReviews = async () => {
  await screen.findByRole('heading', { name: 'Linen shirt' });
  fireEvent.click(screen.getByRole('button', { name: /Reviews/ }));
};
const show = () => render(<MemoryRouter initialEntries={['/product/linen-shirt']}><Routes><Route path="/product/:slug" element={<ProductDetail />} /><Route path="/login" element={<p>Login page</p>} /></Routes></MemoryRouter>);

it('shows "Product not found" only for an actual 404, not any failure', async () => {
  api.get.mockRejectedValue({ response: { status: 404 } });
  show();
  expect(await screen.findByText('Product not found.')).toBeInTheDocument();
});

it('shows a distinct, retryable message when the product fails to load for another reason (e.g. the server is down)', async () => {
  api.get.mockRejectedValueOnce(new Error('Network Error'));
  show();
  expect(await screen.findByText(/couldn't load this product/i)).toBeInTheDocument();
  expect(screen.queryByText('Product not found.')).not.toBeInTheDocument();

  api.get.mockResolvedValueOnce({ data: product });
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: 'Linen shirt' })).toBeInTheDocument();
});

it('shows a toast from either add button and adds only after a size is selected', async () => {
  show();
  await screen.findByRole('heading', { name: 'Linen shirt' });
  for (const button of screen.getAllByRole('button', { name: /Add to bag/ })) {
    fireEvent.click(button);
    expect(screen.getByRole('alert')).toHaveTextContent('Please select a size before adding to your bag.');
    expect(addToCart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss size reminder' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  }
  fireEvent.click(screen.getAllByRole('button', { name: /Add to bag/ })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'M', exact: true }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: /Add to bag/ })[0]);
  expect(addToCart).toHaveBeenCalledWith(2, 'M', 1);
  expect(await screen.findByText('Added to your bag.')).toBeInTheDocument();
});

it('shows the missing-size reminder to guests before redirecting to login', async () => {
  useAuth.mockReturnValue({ user: null });
  show();
  await screen.findByRole('heading', { name: 'Linen shirt' });
  fireEvent.click(screen.getAllByRole('button', { name: /Add to bag/ })[0]);
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'S', exact: true }));
  fireEvent.click(screen.getAllByRole('button', { name: /Add to bag/ })[0]);
  expect(await screen.findByText('Login page')).toBeInTheDocument();
  expect(addToCart).not.toHaveBeenCalled();
  expect(JSON.parse(sessionStorage.getItem('koorm_pending_cart_item'))).toEqual({ productId: 2, size: 'S', quantity: 1 });
  sessionStorage.clear();
});

it('stops incrementing quantity once it reaches available stock', async () => {
  show();
  await screen.findByRole('heading', { name: 'Linen shirt' });
  const increase = screen.getByRole('button', { name: 'Increase quantity' });
  fireEvent.click(increase); // product.stock is 2, so 1 -> 2 is allowed
  expect(screen.getByText('2')).toBeInTheDocument();
  expect(increase).toBeDisabled();
});

it('stops incrementing quantity at 4 even when stock allows more', async () => {
  api.get.mockResolvedValue({ data: { ...product, stock: 50 } });
  show();
  await screen.findByRole('heading', { name: 'Linen shirt' });
  const increase = screen.getByRole('button', { name: 'Increase quantity' });
  fireEvent.click(increase); // 1 -> 2
  fireEvent.click(increase); // 2 -> 3
  fireEvent.click(increase); // 3 -> 4, the cap
  expect(screen.getByText('4')).toBeInTheDocument();
  expect(increase).toBeDisabled();
});

it('shows the server\'s stock message when adding to the bag is rejected', async () => {
  addToCart.mockRejectedValueOnce({ response: { data: { message: 'Only 2 left in stock for Linen shirt' } } });
  show();
  await screen.findByRole('heading', { name: 'Linen shirt' });
  fireEvent.click(screen.getAllByRole('button', { name: /Add to bag/ })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'M', exact: true }));
  fireEvent.click(screen.getAllByRole('button', { name: /Add to bag/ })[0]);
  expect(await screen.findByText('Only 2 left in stock for Linen shirt')).toBeInTheDocument();
});

it('tells a signed-in customer who has not ordered the product that they cannot review it yet', async () => {
  api.get.mockResolvedValue({ data: { ...product, can_review: false } });
  show();
  await openReviews();
  expect(screen.getByText('You can write a review after ordering this product.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Post review' })).not.toBeInTheDocument();
});

it('lets a customer who has ordered the product post a review', async () => {
  api.get.mockResolvedValue({ data: { ...product, can_review: true } });
  show();
  await openReviews();
  fireEvent.change(screen.getByPlaceholderText('How did it feel?'), { target: { value: 'Great fit and fabric.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Post review' }));
  expect(api.post).toHaveBeenCalledWith('/reviews', { product_id: 2, rating: 5, comment: 'Great fit and fabric.' });
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
});

it('shows the server message when review submission is rejected (e.g. not a verified purchase)', async () => {
  api.get.mockResolvedValue({ data: { ...product, can_review: true } });
  api.post.mockRejectedValue({ response: { data: { message: 'You can only review products you have ordered.' } } });
  show();
  await openReviews();
  fireEvent.click(screen.getByRole('button', { name: 'Post review' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('You can only review products you have ordered.');
});

it('disables sold-out sizes and caps quantity at the selected size’s stock', async () => {
  api.get.mockResolvedValue({ data: { ...product, stock: 2, size_stock: { S: 0, M: 2 } } });
  show();
  await screen.findByRole('heading', { name: 'Linen shirt' });
  expect(screen.getByRole('button', { name: 'S, sold out' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'M', exact: true }));
  expect(screen.getByText('Only 2 left in size M')).toBeInTheDocument();
  const increase = screen.getByRole('button', { name: 'Increase quantity' });
  fireEvent.click(increase);
  expect(increase).toBeDisabled();
  fireEvent.click(screen.getAllByRole('button', { name: /Add to bag/ })[0]);
  expect(addToCart).toHaveBeenCalledWith(2, 'M', 2);
});
