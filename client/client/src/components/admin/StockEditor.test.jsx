import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StockEditor from './StockEditor';
import adminApi from '../../api/adminAxios';
vi.mock('../../api/adminAxios', () => ({ default: { patch: vi.fn() } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const product = { id: 1, name: 'Linen Shirt', stock: 0 };
it('saves the quantity with the admin API and returns the updated product', async () => {
  const updated = { ...product, stock: 2 };
  adminApi.patch.mockResolvedValueOnce({ data: updated });
  const onSaved = vi.fn();
  render(<StockEditor product={product} onSaved={onSaved} />);
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
  expect(adminApi.patch).toHaveBeenCalledWith('/products/1/stock', { stock: 2 });
});
it('keeps entered stock after an error so the admin can retry', async () => {
  adminApi.patch.mockRejectedValueOnce(new Error('offline'));
  const onSaved = vi.fn();
  render(<StockEditor product={product} onSaved={onSaved} />);
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Stock could not be saved');
  expect(screen.getByRole('spinbutton')).toHaveValue(2);
  expect(onSaved).not.toHaveBeenCalled();
});
it('disables saving unchanged or empty quantities', () => {
  render(<StockEditor product={{ ...product, stock: 2 }} onSaved={vi.fn()} />);
  expect(screen.getByRole('button')).toBeDisabled();
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } });
  expect(screen.getByRole('button')).toBeDisabled();
});
