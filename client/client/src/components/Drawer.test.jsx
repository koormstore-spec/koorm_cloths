import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import Drawer from './Drawer';

function Example() {
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={() => setOpen(true)}>Open drawer</button>
    <Drawer open={open} onClose={() => setOpen(false)} label="Test drawer" id="test-drawer">
      <button onClick={() => setOpen(false)}>Close drawer</button>
      <Link to="/?sort=newest">Change filter</Link>
      <Link to="/about">About</Link>
    </Drawer>
  </>;
}

describe('Drawer', () => {
  let desktopChange;
  let media;
  let root;

  beforeEach(() => {
    media = { matches: false, addEventListener: vi.fn((_, callback) => { desktopChange = callback; }), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => media));
    vi.stubGlobal('scrollTo', vi.fn());
    root = document.createElement('div');
    root.id = 'root';
    root.inert = false;
    document.body.appendChild(root);
    render(<MemoryRouter><Example /></MemoryRouter>, { container: root });
  });

  afterEach(() => {
    cleanup();
    root.remove();
    document.body.removeAttribute('style');
    vi.unstubAllGlobals();
  });

  it('keeps closed drawer links out of the page and opens outside the app layout', () => {
    expect(screen.queryByRole('link', { name: 'About' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Open drawer'));
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(root.contains(screen.getByRole('dialog'))).toBe(false);
    expect(root.inert).toBe(true);
    expect(document.body.style.position).toBe('fixed');
  });

  it('closes on Escape and restores scroll styles and trigger focus', () => {
    document.body.style.overflow = 'auto';
    const trigger = screen.getByText('Open drawer');
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('auto');
    expect(document.body.style.position).toBe('');
    expect(root.inert).toBe(false);
    expect(trigger).toHaveFocus();
  });

  it('closes and unlocks the page when resizing to desktop navigation', () => {
    fireEvent.click(screen.getByText('Open drawer'));
    media.matches = true;
    act(() => desktopChange());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(root.inert).toBe(false);
    expect(document.body.style.position).toBe('');
  });

  it('keeps filter query changes open and closes after navigating to another page', () => {
    fireEvent.click(screen.getByText('Open drawer'));
    fireEvent.click(screen.getByText('Change filter'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByText('About'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(root.inert).toBe(false);
  });
});
