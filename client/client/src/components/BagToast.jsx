import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { CloseIcon } from './Icons';

// Confirms an item went into the bag. Same placement as SizeSelectionToast;
// pass portal={false} inside a <dialog> so it stays in the dialog's top layer.
export default function BagToast({ message = 'Added to your bag.', onClose, portal = true }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const timer = window.setTimeout(() => closeRef.current(), 3500);
    return () => window.clearTimeout(timer);
  }, []);

  const toast = <div className="bag-toast" role="status" aria-atomic="true">
    <span className="bag-toast-icon" aria-hidden="true">✓</span>
    <p>{message}</p>
    <Link to="/cart" className="bag-toast-link" onClick={onClose}>View bag</Link>
    <button type="button" onClick={onClose} aria-label="Dismiss bag message"><CloseIcon width={16} height={16} aria-hidden="true" /></button>
  </div>;
  return portal ? createPortal(toast, document.body) : toast;
}
