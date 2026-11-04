import { Link } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { TruckIcon, CashIcon } from './Icons';
import WishlistBanner from './WishlistBanner';

export default function Footer() {
  const { pathname } = useLocation();
  const hasWishlistBanner = pathname === '/' || pathname.startsWith('/product/');
  return (
    <footer className="mt-12 bg-ink text-cream md:mt-16">
      {!hasWishlistBanner && <WishlistBanner />}
      <div className="container-x grid grid-cols-2 gap-x-6 gap-y-9 py-10 sm:grid-cols-3 lg:grid-cols-[1.7fr_1fr_1fr_1.2fr] md:py-14">
        <div className="col-span-2 sm:col-span-3 lg:col-span-1"><Link to="/" className="font-serif text-4xl font-semibold tracking-[-0.06em]">KOORM</Link><p className="mt-4 max-w-xs text-sm leading-7 text-cream/65">Thoughtfully chosen shirts for everyday living. Easy to wear. Easy to make your own.</p><p className="mt-5 text-[10px] uppercase tracking-[0.15em] text-[#c4d1b6]">Your everyday, considered.</p></div>
        <div><h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-cream">The collection</h3><ul className="space-y-3 text-sm text-cream/65"><li><Link to="/shop" className="hover:text-cream">All shirts</Link></li><li><Link to="/shop?sort=newest" className="hover:text-cream">New arrivals</Link></li><li><Link to="/shop?sort=rating" className="hover:text-cream">Bestsellers</Link></li></ul></div>
        <div><h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-cream">Here to help</h3><ul className="space-y-3 text-sm text-cream/65"><li><Link to="/profile" className="hover:text-cream">My orders</Link></li><li><Link to="/contact#returns" className="hover:text-cream">Returns & exchanges</Link></li><li><Link to="/about" className="hover:text-cream">Our story</Link></li><li><Link to="/contact" className="hover:text-cream">Contact us</Link></li></ul></div>
              </div>
      <div className="border-t border-cream/15"><div className="container-x flex flex-col gap-4 py-5 text-[11px] text-cream/60 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"><p>© {new Date().getFullYear()} Koorm. All rights reserved.</p><div className="flex flex-wrap gap-5"><span className="inline-flex items-center gap-2"><TruckIcon width={14} height={14} /> Delivered across India</span><span className="inline-flex items-center gap-2"><CashIcon width={14} height={14} /> Pay online or cash on delivery</span></div><Link to="/admin/login" className="hover:text-cream">Admin Login</Link></div></div>
    </footer>
  );
}
