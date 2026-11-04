import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';

// A portal keeps viewport overlays outside blurred headers and animated pages.
export default function Drawer({ open, onClose, label, id, side = 'left', breakpoint = 1024, children }) {
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  const location = useLocation();
  closeRef.current = onClose;

  useEffect(() => { closeRef.current(); }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia(`(min-width: ${breakpoint}px)`);
    if (desktop.matches) {
      closeRef.current();
      return;
    }

    const previousFocus = document.activeElement;
    const root = document.getElementById('root');
    const wasInert = root?.inert;
    const scrollY = window.scrollY;
    const savedStyles = {};
    for (const property of ['overflow', 'position', 'top', 'width']) {
      savedStyles[property] = document.body.style[property];
    }
    Object.assign(document.body.style, { overflow: 'hidden', position: 'fixed', top: `-${scrollY}px`, width: '100%' });
    if (root) root.inert = true;

    const focusable = () => [...panelRef.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')]
      .filter((element) => element.getClientRects().length > 0);
    (focusable()[0] || panelRef.current).focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) {
        event.preventDefault();
        panelRef.current.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onResize = () => { if (desktop.matches) closeRef.current(); };
    document.addEventListener('keydown', onKeyDown);
    desktop.addEventListener('change', onResize);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      desktop.removeEventListener('change', onResize);
      if (root) root.inert = wasInert;
      Object.assign(document.body.style, savedStyles);
      window.scrollTo({ top: scrollY, behavior: 'instant' });
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open, breakpoint]);

  if (!open) return null;
  return createPortal(
    <div className="drawer-layer">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <section ref={panelRef} id={id} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
        className={`drawer-panel ${side === 'right' ? 'right-0' : 'left-0'}`}>
        {children}
      </section>
    </div>,
    document.body,
  );
}
