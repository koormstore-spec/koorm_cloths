import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CustomerReviews from './CustomerReviews';
import api from '../api/axios';

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
const reviews = [1, 2, 3, 4, 5, 6].map(id => ({ id, rating: 5, user_name: 'Customer', comment: `Review ${id}` }));
const tick = ms => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: query === '(hover: hover)' })));
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  api.get.mockResolvedValue({ data: { reviews, page: 1, pages: 1 } });
});

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const setup = async () => {
  let result;
  await act(async () => { result = render(<MemoryRouter><CustomerReviews /></MemoryRouter>); });
  const track = screen.getByRole('group', { name: 'Scrollable customer reviews' });
  Object.defineProperties(track, {
    clientWidth: { value: 400, configurable: true },
    scrollWidth: { value: 1200, configurable: true },
    scrollLeft: { value: 0, writable: true },
  });
  track.getBoundingClientRect = vi.fn(() => ({ top: 100, bottom: 400, width: 400 }));
  track.firstElementChild.getBoundingClientRect = () => ({ width: 180 });
  track.style.columnGap = '20px';
  track.parentElement.matches = vi.fn(() => false);
  track.scrollBy = vi.fn();
  track.scrollTo = vi.fn();
  fireEvent(window, new Event('resize'));
  return { ...result, track };
};

it('automatically advances one review every three seconds', async () => {
  const { track } = await setup();
  tick(2999);
  expect(track.scrollBy).not.toHaveBeenCalled();
  tick(1);
  expect(track.scrollBy).toHaveBeenCalledWith({ left: 200, behavior: 'smooth' });
  tick(3000);
  expect(track.scrollBy).toHaveBeenCalledTimes(2);
});

it('loops to the first review after reaching the end and leaves a fitting row still', async () => {
  const { track } = await setup();
  track.scrollLeft = 800;
  tick(3000);
  expect(track.scrollTo).toHaveBeenCalledWith({ left: 0, behavior: 'smooth' });
  Object.defineProperty(track, 'scrollWidth', { value: 400 });
  tick(6000);
  expect(track.scrollTo).toHaveBeenCalledTimes(1);
  expect(track.scrollBy).not.toHaveBeenCalled();
});

it('pauses while hovered, keyboard-focused, dragged, hidden, or outside the viewport', async () => {
  const { track } = await setup();
  track.parentElement.matches.mockReturnValue(true);
  tick(3000);
  track.parentElement.matches.mockReturnValue(false);
  act(() => track.focus());
  vi.spyOn(track, 'matches').mockImplementation(selector => selector === ':focus-visible');
  tick(3000);
  act(() => track.blur());
  fireEvent.pointerDown(track);
  tick(6000);
  fireEvent.pointerUp(window);
  Object.defineProperty(document, 'hidden', { value: true });
  tick(3000);
  Object.defineProperty(document, 'hidden', { value: false });
  track.getBoundingClientRect.mockReturnValue({ top: -400, bottom: -100 });
  tick(3000);
  expect(track.scrollBy).not.toHaveBeenCalled();
  track.getBoundingClientRect.mockReturnValue({ top: 100, bottom: 400 });
  tick(3000);
  expect(track.scrollBy).toHaveBeenCalledTimes(1);
});

it('keeps the arrows working and gives a full three seconds after pointer interaction', async () => {
  const { track } = await setup();
  tick(2000);
  const next = screen.getByRole('button', { name: 'Next reviews' });
  act(() => next.focus());
  vi.spyOn(next, 'matches').mockReturnValue(false);
  fireEvent.pointerDown(next);
  fireEvent.click(next);
  fireEvent.pointerUp(window);
  expect(track.scrollBy).toHaveBeenCalledWith({ left: 200, behavior: 'smooth' });
  track.scrollBy.mockClear();
  fireEvent.pointerLeave(track.parentElement);
  tick(2999);
  expect(track.scrollBy).not.toHaveBeenCalled();
  tick(1);
  expect(track.scrollBy).toHaveBeenCalledTimes(1);
});

it('respects reduced motion and clears autoplay on unmount', async () => {
  const { track, unmount } = await setup();
  window.matchMedia.mockImplementation(query => ({ matches: query.includes('prefers-reduced-motion') }));
  tick(9000);
  expect(track.scrollBy).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Next reviews' }));
  expect(track.scrollBy).toHaveBeenCalledWith({ left: 200, behavior: 'instant' });
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
