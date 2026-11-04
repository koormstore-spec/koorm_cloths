import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './Icons';

export default function SizeSelectionToast({ onClose, portal = true }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const timer = window.setTimeout(() => closeRef.current(), 4500);
    return () => window.clearTimeout(timer);
  }, []);

  const toast = <div className="size-selection-toast" role="alert" aria-atomic="true">
    <span className="size-toast-icon" aria-hidden="true">!</span>
    <p>Please select a size before adding to your bag.</p>
    <button type="button" onClick={onClose} aria-label="Dismiss size reminder"><CloseIcon width={16} height={16} aria-hidden="true" /></button>
  </div>;
  // Keep the toast in the dialog's top layer when opened from Quick View.
  return portal ? createPortal(toast, document.body) : toast;
}
