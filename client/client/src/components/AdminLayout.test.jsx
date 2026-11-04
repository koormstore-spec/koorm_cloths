import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import api from '../api/adminAxios';

vi.mock('../api/adminAxios', () => ({ default: { get: vi.fn() } }));
vi.mock('../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ admin: { name: 'Admin' }, adminLogout: vi.fn() }) }));

beforeEach(() => vi.clearAllMocks());

it('shows pending requests on any admin page and refreshes when the window regains focus', async () => {
  let count = 2;
  api.get.mockImplementation(url => Promise.resolve({ data: { count: url === '/returns/admin/pending-count' ? count : 0 } }));
  render(<MemoryRouter><AdminLayout title="Products" /></MemoryRouter>);
  const notification = await screen.findByRole('link', { name: 'Review 2 pending return and exchange requests' });
  expect(notification).toHaveAttribute('href', '/admin/returns');
  expect(screen.getAllByLabelText('2 return and exchange requests awaiting approval')).toHaveLength(2);
  count = 0;
  fireEvent(window, new Event('focus'));
  await waitFor(() => expect(screen.queryByRole('link', { name: /Review .* pending return and exchange requests/ })).not.toBeInTheDocument());
});

it('polls for new requests and stops after unmount', async () => {
  vi.useFakeTimers();
  try {
    let count = 0;
    api.get.mockImplementation(() => Promise.resolve({ data: { count } }));
    const { unmount } = render(<MemoryRouter><AdminLayout cancellationCount={0} /></MemoryRouter>);
    await act(async () => {});
    count = 3;
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(screen.getByRole('link', { name: 'Review 3 pending return and exchange requests' })).toBeInTheDocument();
    unmount();
    api.get.mockClear();
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(api.get).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
