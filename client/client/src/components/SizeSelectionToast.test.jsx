import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SizeSelectionToast from './SizeSelectionToast';

afterEach(() => { cleanup(); vi.useRealTimers(); });
it('dismisses automatically and restarts the timer for a repeated reminder', () => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  const { rerender, unmount } = render(<SizeSelectionToast key={1} onClose={onClose} />);
  act(() => vi.advanceTimersByTime(4000));
  expect(onClose).not.toHaveBeenCalled();
  rerender(<SizeSelectionToast key={2} onClose={onClose} />);
  act(() => vi.advanceTimersByTime(1000));
  expect(onClose).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(3500));
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it('allows immediate dismissal inside a dialog', () => {
  const onClose = vi.fn();
  const { container } = render(<SizeSelectionToast onClose={onClose} portal={false} />);
  expect(container).toContainElement(screen.getByRole('alert'));
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss size reminder' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
