import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { savePendingCartItem } from '../lib/pendingCart';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { CloseIcon, ChevronRightIcon } from './Icons';
import SizeSelectionToast from './SizeSelectionToast';
import BagToast from './BagToast';

export default function QuickView({ product, onClose }) {
  const dialog = useRef(null);
  const { user } = useAuth();
  const { addToCart } = useCart();
  const navigate = useNavigate();
  const [size, setSize] = useState('');
  const [sizeNotice, setSizeNotice] = useState(0);
  const [photo, setPhoto] = useState(0);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState('');
  const [addedToast, setAddedToast] = useState(0);
  const unavailable = Number(product.stock) === 0;
  const images = product.images || [];
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  const add = async () => {
    if (adding || unavailable) return;
    if (!size) { setSizeNotice(value => value + 1); return; }
    if (!user) {
      savePendingCartItem(product.id, size, 1);
      onClose();
      navigate('/login', { state: { from: { pathname: `/product/${product.slug}` } } });
      return;
    }
    setAdding(true);
    setMessage('');
    try { await addToCart(product.id, size, 1); setAddedToast(value => value + 1); }
    catch (err) { setMessage(err.response?.data?.message || 'Could not add this item. Please try again.'); }
    finally { setAdding(false); }
  };
  return createPortal(<dialog ref={dialog} className="quick-view-dialog" aria-labelledby={`quick-view-title-${product.id}`} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    {sizeNotice > 0 && <SizeSelectionToast key={sizeNotice} portal={false} onClose={() => setSizeNotice(0)} />}
    {addedToast > 0 && <BagToast key={addedToast} portal={false} onClose={() => setAddedToast(0)} />}
    <div className="quick-view-layout">
      <button autoFocus type="button" className="quick-view-close btn-icon" aria-label="Close quick view" onClick={onClose}><CloseIcon width={21} /></button>
      <div className="quick-view-photo"><img src={images[photo]} alt={`${product.name}, view ${photo + 1}`} />{images.length > 1 && <div className="quick-view-photo-controls"><button aria-label="Previous photograph" onClick={() => setPhoto((photo + images.length - 1) % images.length)}><ChevronRightIcon className="rotate-180" width={18} /></button><span>{photo + 1} / {images.length}</span><button aria-label="Next photograph" onClick={() => setPhoto((photo + 1) % images.length)}><ChevronRightIcon width={18} /></button></div>}</div>
      <div className="quick-view-copy">
        <p className="eyebrow">{product.brand || 'Koorm'}</p>
        <h2 id={`quick-view-title-${product.id}`} className="product-name">{product.name}</h2>
        <p className="quick-view-price">₹{Number(product.discount_price || product.price).toLocaleString('en-IN')}{Number(product.discount_price) > 0 && Number(product.discount_price) < Number(product.price) && <del>₹{Number(product.price).toLocaleString('en-IN')}</del>}</p>
        <p className="text-[10px] uppercase tracking-[.2em] text-muted">Inclusive of all taxes</p>
        <p className="quick-view-description">{product.description || 'Considered details, an effortless fit, and comfort for every day.'}</p>
        {product.colors?.length > 0 && <p className="mb-5 text-sm">Colour: {product.colors.join(', ')}</p>}
        <fieldset><legend className="mb-3 text-sm">Size{size && `: ${size}`}</legend><div className="flex flex-wrap gap-2">{product.sizes?.map(option => <button type="button" key={option} className="quick-view-size" aria-pressed={size === option} onClick={() => { setSize(option); setSizeNotice(0); setMessage(''); }}>{option}</button>)}</div></fieldset>
        {message && <p role="status" className="mt-4 text-sm">{message}</p>}
        <button className="campaign-button mt-7" onClick={add} disabled={adding || unavailable || !product.sizes?.length}>{unavailable ? 'Sold out' : adding ? 'Adding…' : 'Add to cart'}</button>
        <Link className="quick-view-detail-link" to={`/product/${product.slug}`} onClick={onClose}>View full details <span aria-hidden="true">→</span></Link>
      </div>
    </div>
  </dialog>, document.body);
}
