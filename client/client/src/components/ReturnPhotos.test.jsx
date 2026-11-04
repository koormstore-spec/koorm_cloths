import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ReturnPhotos from './ReturnPhotos';
import customerApi from '../api/axios';
import adminApi from '../api/adminAxios';

vi.mock('../api/axios', () => ({ default: { get: vi.fn() } }));
vi.mock('../api/adminAxios', () => ({ default: { get: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  class MockURL extends URL {}
  MockURL.createObjectURL = vi.fn(() => 'blob:private-photo');
  MockURL.revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', MockURL);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each([false, true])('loads evidence through the authenticated API (admin=%s) and releases it on unmount', async admin => {
  const api = admin ? adminApi : customerApi;
  api.get.mockResolvedValue({ data: new Blob(['photo'], { type: 'image/png' }) });
  const { unmount } = render(<ReturnPhotos request={{ id: 4, images: [{ id: 12 }] }} admin={admin} />);
  expect(await screen.findByRole('link', { name: 'Open clothing photo 1' })).toHaveAttribute('href', 'blob:private-photo');
  expect(api.get).toHaveBeenCalledWith(`/returns/${admin ? 'admin/' : ''}4/images/12`, { responseType: 'blob' });
  expect((admin ? customerApi : adminApi).get).not.toHaveBeenCalled();
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-photo');
});

it('lets the reviewer retry a photo that failed to load', async () => {
  adminApi.get.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ data: new Blob(['photo']) });
  render(<ReturnPhotos request={{ id: 4, images: [{ id: 12 }] }} admin />);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry photo 1' }));
  expect(await screen.findByAltText('Clothing photo 1')).toBeInTheDocument();
});
