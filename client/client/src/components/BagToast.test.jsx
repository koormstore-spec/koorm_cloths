import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import BagToast from './BagToast';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
const show = onClose => render(<MemoryRouter><BagToast onClose={onClose} /></MemoryRouter>);

it('announces the item was added and links to the bag', () => {
  show(vi.fn());
  expect(screen.getByRole('status')).toHaveTextContent('Added to your bag.');
  expect(screen.getByRole('link', { name: 'View bag' })).toHaveAttribute('href', '/cart');
});

it('dismisses itself after a few seconds', () => {
  const onClose = vi.fn();
  show(onClose);
  act(() => { vi.advanceTimersByTime(3400); });
  expect(onClose).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(200); });
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('can be dismissed with the close button', () => {
  const onClose = vi.fn();
  show(onClose);
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss bag message' }));
  expect(onClose).toHaveBeenCalled();
});
