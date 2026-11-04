import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HeroCarousel from './HeroCarousel';

const tick = ms => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('changes the images, copy, and shop link together every two seconds and loops through all three slides', () => {
  render(<MemoryRouter><HeroCarousel /></MemoryRouter>);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Everyday essentials');
  expect(screen.getByRole('link', { name: 'Explore the collection' })).toHaveAttribute('href', '/shop?sort=newest');
  expect(screen.getByRole('img', { name: /Sand beige/ })).toBeInTheDocument();
  tick(1999);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Everyday essentials');
  tick(1);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Comfortable');
  expect(screen.getByRole('link', { name: 'Shop now' })).toHaveAttribute('href', '/shop');
  expect(screen.getByRole('img', { name: /Olive green/ })).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: /Sand beige/ })).not.toBeInTheDocument();
  expect(screen.getByText('Everyday essentials').closest('[role="group"]')).toHaveAttribute('inert');
  tick(1999);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Comfortable');
  tick(1);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Wear your story');
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Style that speaks for you');
  expect(screen.getByRole('link', { name: 'Shop now' })).toHaveAttribute('href', '/shop');
  expect(screen.getByRole('img', { name: /Rust European linen/ })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /Dark navy/ })).toBeInTheDocument();
  expect(screen.getByRole('group', { name: '3 of 3' })).toBeInTheDocument();
  tick(1999);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Wear your story');
  tick(1);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Everyday essentials');
});

it('keeps autoplay working after manual selection with only the three dot buttons', () => {
  render(<MemoryRouter><HeroCarousel /></MemoryRouter>);
  expect(screen.getAllByRole('button')).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Show slide 2: Comfortable' }));
  tick(1999);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Comfortable');
  expect(screen.getByRole('button', { name: 'Show slide 2: Comfortable' })).toHaveAttribute('aria-current', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Show slide 3: Wear your story' }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Wear your story');
  expect(screen.getByRole('button', { name: 'Show slide 3: Wear your story' })).toHaveAttribute('aria-current', 'true');
  tick(2000);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Everyday essentials');
  tick(2000);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Comfortable');
});

it('keeps a focused shop link in place and resumes autoplay when focus leaves', () => {
  render(<MemoryRouter><HeroCarousel /></MemoryRouter>);
  act(() => screen.getByRole('link', { name: 'Explore the collection' }).focus());
  tick(10000);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Everyday essentials');
  act(() => screen.getByRole('link', { name: 'Explore the collection' }).blur());
  tick(2000);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Comfortable');
});

it('does not advance while the document is hidden', () => {
  render(<MemoryRouter><HeroCarousel /></MemoryRouter>);
  Object.defineProperty(document, 'hidden', { value: true });
  tick(10000);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Everyday essentials');
  Object.defineProperty(document, 'hidden', { value: false });
  tick(2000);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Comfortable');
});

it('respects reduced motion, allows manual navigation, and clears its timer on unmount', () => {
  window.matchMedia.mockReturnValue({ matches: true });
  const { unmount } = render(<MemoryRouter><HeroCarousel /></MemoryRouter>);
  tick(10000);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Everyday essentials');
  fireEvent.click(screen.getByRole('button', { name: 'Show slide 2: Comfortable' }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Comfortable');
  tick(10000);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Comfortable');
  expect(vi.getTimerCount()).toBe(0);
  unmount();
  window.matchMedia.mockReturnValue({ matches: false });
  const running = render(<MemoryRouter><HeroCarousel /></MemoryRouter>);
  expect(vi.getTimerCount()).toBe(1);
  running.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
