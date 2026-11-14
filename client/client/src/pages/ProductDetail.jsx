import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { savePendingCartItem } from '../lib/pendingCart';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import StarRating from '../components/StarRating';
import ProductCarousel from '../components/ProductCarousel';
import MembershipBanner from '../components/MembershipBanner';
import WishlistBanner from '../components/WishlistBanner';
import ProductGallery from '../components/ProductGallery';
import Loader from '../components/Loader';
import SizeSelectionToast from '../components/SizeSelectionToast';
import BagToast from '../components/BagToast';
import { HeartIcon, PlusIcon, MinusIcon, TruckIcon, CashIcon, ReturnIcon, ChevronRightIcon } from '../components/Icons';

// Matches the server-enforced per-product cap in cartController.js.
const MAX_QUANTITY_PER_PRODUCT = 4;

export default function ProductDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { addToCart, wishlist, toggleWishlist } = useCart();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [sizeNotice, setSizeNotice] = useState(0);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState('');
  const [cartError, setCartError] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [openSection, setOpenSection] = useState('details');

  const load = () => {
    setLoading(true);
    setLoadError('');
    setSizeNotice(0);
    api.get(`/products/${slug}`)
      .then(({ data }) => { setProduct(data); setSelectedSize(''); })
      .catch((err) => {
        setProduct(null);
        setLoadError(err.response?.status === 404 ? 'not-found' : 'error');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); window.scrollTo(0, 0); }, [slug]);

  const handleAddToCart = async () => {
    if (adding || Number(product?.stock) === 0) return;
    if (!selectedSize) { setSizeNotice(value => value + 1); return; }
    if (!user) {
      savePendingCartItem(product.id, selectedSize, qty);
      return navigate('/login', { state: { from: location } });
    }
    setAdding(true);
    setCartError('');
    try {
      await addToCart(product.id, selectedSize, qty);
      setMessage('Added to your bag.');
    } catch (err) {
      setCartError(err.response?.data?.message || 'Could not add this item. Please try again.');
    } finally { setAdding(false); }
  };

  const submitReview = async (event) => {
    event.preventDefault();
    if (!user) return navigate('/login', { state: { from: location } });
    if (submittingReview) return;
    setReviewError('');
    setSubmittingReview(true);
    try {
      await api.post('/reviews', { product_id: product.id, rating: reviewRating, comment: reviewComment });
      setReviewComment('');
      load();
    } catch (err) {
      setReviewError(err.response?.data?.message || 'Could not save your review. Please try again.');
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) return <Loader full />;
  if (loadError === 'error') return (
    <div className="container-x py-20 text-center">
      <p className="text-muted">We couldn't load this product. Please check your connection and try again.</p>
      <button type="button" onClick={load} className="btn-outline mt-5">Try again</button>
    </div>
  );
  if (!product) return <p className="container-x py-20 text-center">Product not found.</p>;

  const outOfStock = Number(product.stock) === 0;
  // Per-size stock when the product is set up that way; otherwise every size
  // shares the product's stock.
  const sizeStock = product.size_stock || {};
  const tracksSizes = Object.keys(sizeStock).length > 0;
  const stockForSize = (size) => (tracksSizes ? Number(sizeStock[size] ?? 0) : Number(product.stock));
  const selectedStock = selectedSize ? stockForSize(selectedSize) : Number(product.stock);
  const maxQty = Math.min(selectedStock, MAX_QUANTITY_PER_PRODUCT);
  const isWishlisted = wishlist?.some((item) => item.id === product.id);
  const hasDiscount = product.discount_price && Number(product.discount_price) < Number(product.price);
  const displayPrice = Number(product.discount_price || product.price);
  const discount = hasDiscount ? Math.round(((Number(product.price) - Number(product.discount_price)) / Number(product.price)) * 100) : 0;

  const benefits = [
    { Icon: TruckIcon, title: 'Free delivery', text: `On orders above ${String.fromCharCode(8377)}1,999` },
    { Icon: CashIcon, title: 'Pay your way', text: 'Pay online or cash on delivery' },
    { Icon: ReturnIcon, title: 'Easy returns', text: 'A simple 1-month return window' },
  ];

  return (
    <div className="fade-in pb-28 md:pb-0">
      {sizeNotice > 0 && <SizeSelectionToast key={sizeNotice} onClose={() => setSizeNotice(0)} />}
      {message && <BagToast key={message} message={message} onClose={() => setMessage('')} />}
      <div className="container-x py-5 md:py-7">
        <div className="flex items-center gap-1.5 overflow-hidden text-[12px] text-muted"><Link to="/" className="shrink-0 hover:text-ink">Home</Link><ChevronRightIcon width={12} height={12} className="shrink-0" /><Link to={`/shop?category=${product.category_slug}`} className="shrink-0 capitalize hover:text-ink">{product.category_name || 'Shop'}</Link><ChevronRightIcon width={12} height={12} className="shrink-0" /><span className="product-name truncate text-muted">{product.name}</span></div>
      </div>

      <div className="container-x grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(22rem,.65fr)] lg:gap-12 xl:gap-16">
        <section className="min-w-0" aria-label="Product gallery">
          <ProductGallery key={slug} images={product.images || []} name={product.name} />
        </section>

        <section className="lg:sticky lg:top-32 lg:h-fit lg:pb-10">
          <p className="page-kicker">{product.brand || 'Koorm'}</p>
          <div className="flex items-start justify-between gap-4"><h1 className="product-name font-serif text-3xl leading-[1.12] tracking-[-0.03em] xl:text-4xl">{product.name}</h1>{user && <button onClick={() => toggleWishlist(product.id)} className="btn-icon shrink-0" aria-label="Add to wishlist"><HeartIcon width={19} height={19} filled={isWishlisted} className={isWishlisted ? 'text-accent' : ''} /></button>}</div>
          <div className="mt-4 flex flex-wrap items-center gap-3"><StarRating rating={product.rating} count={product.num_reviews} iconSize={14} /><span className="h-4 w-px bg-sand" /><span className="text-xs text-muted">Inclusive of all taxes</span></div>

          <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="text-2xl font-semibold">&#8377;{displayPrice.toLocaleString('en-IN')}</span>{hasDiscount && <><span className="text-sm text-muted line-through">&#8377;{Number(product.price).toLocaleString('en-IN')}</span><span className="text-xs font-bold uppercase tracking-[0.1em] text-accent">Save {discount}%</span></>}</div>

          <div className="mt-7 border-y border-sand py-6">
            <div className="flex items-center justify-between"><div><p className="text-[12px] font-bold uppercase tracking-[0.15em] text-muted">Colour</p><p className="mt-1 text-sm font-medium">{product.colors?.[0] || 'Signature shade'}</p></div><span className="h-7 w-7 rounded-full border-2 border-white bg-clay shadow-[0_0_0_1px_rgba(26,26,26,.24)]" title={product.colors?.[0] || 'Colour'} /></div>
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-end justify-between"><div><p className="text-sm font-semibold">Select size</p><p className="mt-1 text-xs text-muted">Fits true to size</p></div><span className="text-xs text-muted link-underline">Size guide</span></div>
            <div className="grid grid-cols-5 gap-2">{product.sizes.map((size) => { const soldOut = stockForSize(size) <= 0; return <button key={size} aria-pressed={selectedSize === size} disabled={soldOut} aria-label={soldOut ? `${size}, sold out` : undefined} title={soldOut ? 'Sold out' : undefined} onClick={() => { setSelectedSize(size); setQty((value) => Math.max(1, Math.min(value, stockForSize(size), MAX_QUANTITY_PER_PRODUCT))); setSizeNotice(0); setMessage(''); setCartError(''); }} className={`h-11 border text-xs font-semibold transition-all ${soldOut ? 'cursor-not-allowed border-sand bg-white text-muted line-through opacity-50' : selectedSize === size ? 'border-ink bg-ink text-cream' : 'border-sand bg-white hover:border-ink'}`}>{size}</button>; })}</div>
            {tracksSizes && selectedSize && selectedStock > 0 && selectedStock <= 3 && <p className="mt-2 text-xs font-semibold text-accent">Only {selectedStock} left in size {selectedSize}</p>}
          </div>

          <div className="mt-6 flex items-center gap-4"><div><p className="mb-2 text-[12px] font-bold uppercase tracking-[0.15em] text-muted">Quantity</p><div className="flex w-28 items-center border border-sand bg-white"><button onClick={() => setQty((value) => Math.max(1, value - 1))} className="flex h-10 flex-1 items-center justify-center hover:bg-cream" aria-label="Decrease quantity"><MinusIcon width={14} height={14} /></button><span className="flex-1 text-center text-sm font-semibold">{qty}</span><button onClick={() => setQty((value) => Math.min(maxQty || value, value + 1))} disabled={qty >= maxQty} className="flex h-10 flex-1 items-center justify-center hover:bg-cream disabled:opacity-40" aria-label="Increase quantity"><PlusIcon width={14} height={14} /></button></div></div><button onClick={handleAddToCart} disabled={adding || outOfStock} className="btn-primary mt-6 flex-1">{outOfStock ? 'Currently unavailable' : adding ? 'Adding...' : 'Add to bag'} <span aria-hidden="true">&rarr;</span></button></div>
          
          {cartError && <p role="alert" className="mt-3 text-sm font-medium text-red-600">{cartError}</p>}

          <div className="mt-7 grid divide-y divide-sand border-y border-sand">{benefits.map(({ Icon, title: benefitTitle, text }) => <div key={benefitTitle} className="flex items-center gap-3 py-3.5"><Icon width={17} height={17} className="shrink-0 text-accent" /><div><p className="text-xs font-semibold">{benefitTitle}</p><p className="mt-0.5 text-[12px] text-muted">{text}</p></div></div>)}</div>
        </section>
      </div>

      <section className="container-x mt-16 md:mt-24"><div className="grid gap-10 border-t border-ink pt-1 md:grid-cols-[.72fr_1.28fr]"><div className="pt-7"><p className="page-kicker">About the piece</p><h2 className="font-serif text-3xl leading-none tracking-[-0.04em]">Made for regular rotation.</h2></div><div className="pt-3">{[
        { id: 'details', label: 'Details & fit', content: <p className="max-w-2xl pb-5 pr-3 text-sm leading-7 text-muted">{product.description}</p> },
        { id: 'reviews', label: `Reviews (${product.reviews.length})`, content: <div className="space-y-5 pb-5">{user && (product.can_review ? <form onSubmit={submitReview} className="panel space-y-3 p-4"><p className="text-sm font-semibold">Write a review</p><div className="flex flex-wrap items-center gap-3"><select value={reviewRating} onChange={(event) => setReviewRating(Number(event.target.value))} className="input-field w-auto py-2 text-xs">{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} star{rating === 1 ? '' : 's'}</option>)}</select><button type="submit" disabled={submittingReview} className="btn-primary">{submittingReview ? 'Posting...' : 'Post review'}</button></div><textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder="How did it feel?" className="input-field review-comment-input text-sm" rows={3} />{reviewError && <p role="alert" className="text-xs text-red-600">{reviewError}</p>}</form> : <p className="panel p-4 text-sm text-muted">You can write a review after ordering this product.</p>)}{product.reviews.length === 0 ? <p className="text-sm text-muted">No reviews yet. Be the first to share your thoughts.</p> : product.reviews.map((review) => <article key={review.id} className="border-b border-sand pb-4"><div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">{review.user_name}</p><StarRating rating={review.rating} /></div><p className="text-sm leading-6 text-muted">{review.comment}</p>{review.admin_reply && <div className="mt-3 rounded-lg bg-sand/40 p-3"><p className="text-xs font-semibold text-ink">Koorm team reply</p><p className="mt-1 text-xs leading-5 text-muted">{review.admin_reply}</p></div>}</article>)}</div> },
      ].map((section) => <div key={section.id}><button className="accordion-row" onClick={() => setOpenSection(openSection === section.id ? '' : section.id)}><span>{section.label}</span><span className="text-lg font-normal">{openSection === section.id ? '−' : '+'}</span></button>{openSection === section.id && <div className="pt-4">{section.content}</div>}</div>)}</div></div></section>

      {product.related?.length > 0 && <section className="container-x mt-20 md:mt-28"><div className="mb-9 flex items-end justify-between"><div><p className="page-kicker">Keep exploring</p><h2 className="section-title">You may also like</h2></div><Link to="/shop" className="hidden text-[12px] font-bold uppercase tracking-[0.15em] link-underline sm:block">View all &rarr;</Link></div><ProductCarousel products={product.related} /></section>}

      <WishlistBanner className="mt-16 md:mt-24" />

      <MembershipBanner />

      {createPortal(<div className="pb-[max(0.75rem,env(safe-area-inset-bottom))] fixed inset-x-0 bottom-0 z-40 flex gap-3 border-t border-sand bg-white/95 p-3 backdrop-blur md:hidden">{user && <button onClick={() => toggleWishlist(product.id)} className="btn-icon w-12" aria-label="Wishlist"><HeartIcon width={18} height={18} filled={isWishlisted} className={isWishlisted ? 'text-accent' : ''} /></button>}<button onClick={handleAddToCart} disabled={adding || outOfStock} className="btn-primary flex-1">{outOfStock ? 'Currently unavailable' : adding ? 'Adding...' : 'Add to bag'}</button></div>, document.body)}
    </div>
  );
}
