import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuickView from './QuickView';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
vi.mock('../context/CartContext', () => ({ useCart: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
const product = { id: 7, slug: 'linen-shirt', name: 'Linen shirt', price: 2000, stock: 5, images: ['/one.jpg', '/two.jpg'], sizes: ['S', 'M'], colors: ['Blue'] };
let addToCart;
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  addToCart = vi.fn().mockResolvedValue(undefined);
  useCart.mockReturnValue({ addToCart });
  useAuth.mockReturnValue({ user: { id: 1 } });
});
afterEach(cleanup);
const show = (overrides = {}) => render(<MemoryRouter><QuickView product={{ ...product, ...overrides }} onClose={vi.fn()} /></MemoryRouter>);
it('requires a size, then adds the selected product and reports success', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Please select a size');
  expect(addToCart).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'M', exact: true }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
  expect(addToCart).toHaveBeenCalledWith(7, 'M', 1);
  expect(await screen.findByText('Added to your bag.')).toBeInTheDocument();
});
it('prevents adding unavailable inventory', () => {
  show({ stock: 0 });
  expect(screen.getByRole('button', { name: 'Sold out' })).toBeDisabled();
  expect(addToCart).not.toHaveBeenCalled();
});
it('cycles photographs and restores scrolling on unmount', () => {
  const { unmount } = show();
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.click(screen.getByRole('button', { name: 'Next photograph' }));
  expect(screen.getByRole('img')).toHaveAttribute('src', '/two.jpg');
  fireEvent.click(screen.getByRole('button', { name: 'Next photograph' }));
  expect(screen.getByRole('img')).toHaveAttribute('src', '/one.jpg');
  unmount();
  expect(document.body.style.overflow).not.toBe('hidden');
});
it('reports a failed cart request and permits retry', async () => {
  addToCart.mockRejectedValueOnce(new Error('offline'));
  show();
  fireEvent.click(screen.getByRole('button', { name: 'S', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
  expect(await screen.findByText('Could not add this item. Please try again.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add to cart' })).toBeEnabled();
});
it('shows the server\'s specific stock message instead of a generic error', async () => {
  addToCart.mockRejectedValueOnce({ response: { data: { message: 'Only 1 left in stock for Linen shirt' } } });
  show();
  fireEvent.click(screen.getByRole('button', { name: 'S', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
  expect(await screen.findByText('Only 1 left in stock for Linen shirt')).toBeInTheDocument();
});
