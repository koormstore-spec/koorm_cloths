import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProductCarousel from './ProductCarousel';

vi.mock('./ProductCard', () => ({ default: ({ product }) => <article><a href={`/product/${product.id}`}>{product.name}</a></article> }));
const products = [1, 2, 3].map(id => ({ id, name: `Shirt ${id}` }));
const tick = ms => act(() => vi.advanceTimersByTime(ms));
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: query === '(hover: hover)' })));
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const setup = () => {
  const result = render(<ProductCarousel products={products} />);
  const track = screen.getByRole('group', { name: 'Scrollable products' });
  Object.defineProperties(track, { clientWidth: { value: 400 }, scrollWidth: { value: 1200 }, scrollLeft: { value: 0, writable: true } });
  track.getBoundingClientRect = () => ({ top: 100, bottom: 500, width: 400 });
  track.firstElementChild.getBoundingClientRect = () => ({ width: 180 });
  track.style.columnGap = '20px';
  track.parentElement.matches = vi.fn(() => false);
  track.scrollBy = vi.fn();
  track.scrollTo = vi.fn();
  return { ...result, track };
};

it('moves one product right-to-left every two seconds', () => {
  const { track } = setup();
  tick(1999);
  expect(track.scrollBy).not.toHaveBeenCalled();
  tick(1);
  expect(track.scrollBy).toHaveBeenCalledWith({ left: 200, behavior: 'smooth' });
  tick(2000);
  expect(track.scrollBy).toHaveBeenCalledTimes(2);
});

it('returns to the first product at the end', () => {
  const { track } = setup();
  track.scrollLeft = 800;
  tick(2000);
  expect(track.scrollTo).toHaveBeenCalledWith({ left: 0, behavior: 'instant' });
});

it('pauses and resumes through the slideshow control', () => {
  const { track } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Pause slideshow' }));
  tick(10000);
  expect(track.scrollBy).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Play slideshow' }));
  tick(2000);
  expect(track.scrollBy).toHaveBeenCalledTimes(1);
});

it('pauses while hovered, focused, hidden, or covered by Quick View', () => {
  const { track } = setup();
  track.parentElement.matches.mockReturnValue(true);
  tick(2000);
  track.parentElement.matches.mockReturnValue(false);
  const link = screen.getByRole('link', { name: 'Shirt 1' });
  link.focus();
  vi.spyOn(link, 'matches').mockImplementation(selector => selector === ':focus-visible');
  tick(2000);
  document.activeElement.blur();
  Object.defineProperty(document, 'hidden', { value: true });
  tick(2000);
  Object.defineProperty(document, 'hidden', { value: false });
  const dialog = document.createElement('dialog');
  dialog.setAttribute('open', '');
  document.body.appendChild(dialog);
  tick(2000);
  dialog.remove();
  expect(track.scrollBy).not.toHaveBeenCalled();
  tick(2000);
  expect(track.scrollBy).toHaveBeenCalledTimes(1);
});

it('starts paused for reduced motion and clears timers on unmount', () => {
  window.matchMedia.mockImplementation(query => ({ matches: query.includes('prefers-reduced-motion') }));
  const { track, unmount } = setup();
  expect(screen.getByRole('button', { name: 'Play slideshow' })).toBeInTheDocument();
  tick(10000);
  expect(track.scrollBy).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Play slideshow' }));
  unmount();
  tick(10000);
  expect(track.scrollBy).not.toHaveBeenCalled();
});

it('resumes autoplay when a mouse-clicked arrow retains focus after the pointer leaves', () => {
  const { track } = setup();
  fireEvent(window, new Event('resize'));
  const next = screen.getByRole('button', { name: 'Next products' });
  next.focus();
  vi.spyOn(next, 'matches').mockReturnValue(false);
  fireEvent.click(next);
  track.scrollBy.mockClear();
  fireEvent.pointerLeave(track.parentElement);
  tick(2000);
  expect(track.scrollBy).toHaveBeenCalledWith({ left: 200, behavior: 'smooth' });
});
