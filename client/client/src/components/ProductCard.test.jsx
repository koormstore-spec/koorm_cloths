import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProductCard from './ProductCard';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';

vi.mock('../context/CartContext', () => ({ useCart: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

const baseProduct = {
  id: 1,
  slug: 'linen-shirt-rust-red',
  name: 'Linen Shirt - Rust Red',
  brand: 'Koorm',
  price: 2499,
  discount_price: null,
  images: ['/images/products/1/1.jpg'],
  sizes: ['S', 'M', 'L'],
  rating: 4.5,
  num_reviews: 32,
  created_at: '2020-01-01T00:00:00.000Z', // old, so "New" badge should never show
};

const renderCard = (product, { user = null, toggleWishlist = vi.fn(), addToCart = vi.fn(), wishlist = [] } = {}) => {
  useCart.mockReturnValue({ wishlist, toggleWishlist, addToCart });
  useAuth.mockReturnValue({ user });
  return render(
    <MemoryRouter>
      <ProductCard product={product} />
    </MemoryRouter>
  );
};

describe('ProductCard', () => {
  it('shows unavailable stock and prevents quick add for zero inventory', () => {
    renderCard({ ...baseProduct, stock: 0 });
    expect(screen.getByText('Currently unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Quick add')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: `View ${baseProduct.name}` })).toBeInTheDocument();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the product name, brand, and price', () => {
    renderCard(baseProduct);
    expect(screen.getByText('Linen Shirt - Rust Red')).toBeInTheDocument();
    expect(screen.getByText('Koorm')).toBeInTheDocument();
    expect(screen.getByText('₹2,499')).toBeInTheDocument();
  });

  it('keeps sale prices without a percentage badge', () => {
    renderCard({ ...baseProduct, price: 2000, discount_price: 1500 });
    expect(screen.queryByText('-25%')).not.toBeInTheDocument();
    expect(screen.getByText('₹1,500')).toBeInTheDocument();
    expect(screen.getByText('₹2,000')).toBeInTheDocument(); // struck-through original price
  });

  it('shows no sale badge and no struck-through price when there is no discount', () => {
    renderCard(baseProduct);
    expect(screen.queryByText(/^-\d+%$/)).not.toBeInTheDocument();
  });

  it('shows a "New" badge for a recently added product with no discount', () => {
    const recent = new Date().toISOString();
    renderCard({ ...baseProduct, created_at: recent });
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('shows New on recent products without a sale percentage badge', () => {
    const recent = new Date().toISOString();
    renderCard({ ...baseProduct, created_at: recent, price: 2000, discount_price: 1500 });
    expect(screen.queryByText('-25%')).not.toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('does not render a wishlist button for a logged-out visitor', () => {
    renderCard(baseProduct, { user: null });
    expect(screen.queryByLabelText('Toggle wishlist')).not.toBeInTheDocument();
  });

  it('renders a wishlist button for a logged-in user and toggles it on click', () => {
    const toggleWishlist = vi.fn();
    renderCard(baseProduct, { user: { id: 1, name: 'Jane' }, toggleWishlist });

    const button = screen.getByLabelText('Toggle wishlist');
    fireEvent.click(button);

    expect(toggleWishlist).toHaveBeenCalledWith(1);
  });

  it('does not render the quick-add size overlay when the product has no sizes', () => {
    renderCard({ ...baseProduct, sizes: [] }, { user: { id: 1, name: 'Jane' } });
    expect(screen.queryByText('S')).not.toBeInTheDocument();
  });

  it('shows the server\'s specific stock message when a quick add fails', async () => {
    const addToCart = vi.fn().mockRejectedValue({ response: { data: { message: 'Only 1 left in stock for Linen Shirt - Rust Red' } } });
    renderCard(baseProduct, { user: { id: 1, name: 'Jane' }, addToCart });
    fireEvent.click(screen.getByText('S'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only 1 left in stock for Linen Shirt - Rust Red');
  });

  it('shows an added-to-bag toast after a successful quick add', async () => {
    renderCard(baseProduct, { user: { id: 1, name: 'Jane' }, addToCart: vi.fn().mockResolvedValue(undefined) });
    fireEvent.click(screen.getByText('S'));
    expect(await screen.findByText('Added to your bag.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View bag' })).toHaveAttribute('href', '/cart');
  });

  it('links to the product detail page by slug', () => {
    renderCard(baseProduct);
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/product/linen-shirt-rust-red');
  });
});
