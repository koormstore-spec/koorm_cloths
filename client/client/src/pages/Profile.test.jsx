import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Profile from './Profile';
import api from '../api/axios';

vi.mock('../api/axios', () => ({ default: { get: vi.fn() } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Jane', email: 'jane@example.com' }, logout: vi.fn() }) }));

beforeEach(() => vi.clearAllMocks());

it('links delivered orders to their own return and exchange options without nesting links', async () => {
  api.get.mockResolvedValue({ data: ['delivered', 'shipped', 'cancelled'].map((status, index) => ({
    id: index + 1, order_number: `KRM${index + 1}`, status, total_amount: 1000, created_at: new Date().toISOString(), items: [],
  })) });
  const { container } = render(<MemoryRouter><Profile /></MemoryRouter>);
  expect(await screen.findByRole('link', { name: 'Return or Exchange' })).toHaveAttribute('href', '/orders/1#returns');
  const orders = screen.getAllByRole('article');
  expect(within(orders[1]).queryByRole('link', { name: 'Return or Exchange' })).not.toBeInTheDocument();
  expect(within(orders[1]).getByText(/options become available after delivery/)).toBeInTheDocument();
  expect(within(orders[2]).queryByRole('link', { name: 'Return or Exchange' })).not.toBeInTheDocument();
  expect(container.querySelector('a a')).toBeNull();
});
