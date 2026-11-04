import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../api/axios';
import HomeProducts from './HomeProducts';

vi.mock('../api/axios', () => ({ default: { get: vi.fn() } }));
vi.mock('./ProductCard', () => ({ default: ({ product }) => <article>{product.name}</article> }));

let observers;
const product = id => ({ id, name: `Shirt ${id}` });
const response = (ids, pages = 2, total = 3) => ({ data: { products: ids.map(product), pages, total } });
const renderProducts = () => render(<MemoryRouter><HomeProducts /></MemoryRouter>);
const intersect = () => observers.at(-1).callback([{ isIntersecting: true }]);

beforeEach(() => {
  vi.resetAllMocks();
  observers = [];
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback) {
      this.callback = callback;
      this.observe = vi.fn();
      this.disconnect = vi.fn();
      observers.push(this);
    }
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HomeProducts', () => {
  it('appends products on scroll, deduplicates overlaps, and stops at the last page', async () => {
    api.get.mockResolvedValueOnce(response([1, 2])).mockResolvedValueOnce(response([2, 3]));
    renderProducts();
    await screen.findByText('Shirt 1');
    expect(api.get.mock.calls[0][1].params).toEqual({ page: 1, limit: 12, sort: 'newest' });
    await waitFor(() => expect(observers).toHaveLength(1));
    act(intersect);
    await screen.findByText('Shirt 3');
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByText('Showing 3 of 3 products')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more products' })).not.toBeInTheDocument();
    expect(observers.at(-1).disconnect).toHaveBeenCalled();
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.get.mock.calls[1][1].params.page).toBe(2);
  });

  it('requests only one next page for repeated intersection events while loading', async () => {
    let finishPage;
    api.get.mockResolvedValueOnce(response([1])).mockImplementationOnce(() => new Promise(resolve => { finishPage = resolve; }));
    renderProducts();
    await screen.findByText('Shirt 1');
    await waitFor(() => expect(observers).toHaveLength(1));
    act(() => { intersect(); intersect(); intersect(); });
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Shirt 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
    await act(async () => finishPage(response([2, 3])));
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('preserves loaded products after a failure and retries the same page', async () => {
    api.get.mockResolvedValueOnce(response([1])).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(response([2, 3]));
    renderProducts();
    await screen.findByText('Shirt 1');
    await waitFor(() => expect(observers).toHaveLength(1));
    act(intersect);
    await screen.findByRole('alert');
    expect(screen.getByText('Shirt 1')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Shirt 3');
    expect(api.get.mock.calls.map(([, config]) => config.params.page)).toEqual([1, 2, 2]);
  });

  it('supports loading more without IntersectionObserver', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    api.get.mockResolvedValueOnce(response([1])).mockResolvedValueOnce(response([2, 3]));
    renderProducts();
    fireEvent.click(await screen.findByRole('button', { name: 'Load more products' }));
    await screen.findByText('Shirt 3');
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('shows an empty collection without requesting more pages', async () => {
    api.get.mockResolvedValueOnce(response([], 0, 0));
    renderProducts();
    await screen.findByText('No products available yet. Check back soon.');
    expect(observers).toHaveLength(0);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('allows retrying a failed first page', async () => {
    api.get.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(response([1], 1, 1));
    renderProducts();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByText('Shirt 1');
    expect(api.get.mock.calls.map(([, config]) => config.params.page)).toEqual([1, 1]);
  });

  it('ignores cancelled responses in StrictMode and aborts on unmount', async () => {
    let finishCancelled;
    api.get.mockImplementationOnce(() => new Promise(resolve => { finishCancelled = resolve; }))
      .mockResolvedValueOnce(response([1], 1, 1));
    const { unmount } = render(<StrictMode><MemoryRouter><HomeProducts /></MemoryRouter></StrictMode>);
    await screen.findByText('Shirt 1');
    expect(api.get.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => finishCancelled(response([99])));
    expect(screen.queryByText('Shirt 99')).not.toBeInTheDocument();
    unmount();
    await waitFor(() => expect(api.get.mock.calls[1][1].signal.aborted).toBe(true));
  });
});
