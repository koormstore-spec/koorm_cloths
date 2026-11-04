import { useEffect, useState } from 'react';
import { useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import BrandMark from './BrandMark';
import AnnouncementBar from './AnnouncementBar';
import Drawer from './Drawer';
import { SearchIcon, HeartIcon, BagIcon, UserIcon, MenuIcon, CloseIcon, ChevronRightIcon } from './Icons';

const NAV_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'New in', to: '/shop?sort=newest' },
  { label: 'Explore', to: '/shop' },
  { label: 'About', to: '/about' },
  { label: 'Sale', to: '/shop?sale=true' },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const { cartCount, wishlist } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const headerRef = useRef(null);
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const params = new URLSearchParams(location.search);
  const activeLink = location.pathname === '/shop'
    ? params.get('sale') === 'true' ? 'Sale' : params.get('sort') === 'newest' ? 'New in' : 'Explore'
    : NAV_LINKS.find(link => link.to === location.pathname)?.label;
  useEffect(() => { setMenuOpen(false); setUserMenuOpen(false); setSearchOpen(false); }, [location]);
  useEffect(() => {
    const close = e => { if (e.key === 'Escape') { setUserMenuOpen(false); setSearchOpen(false); } };
    const closeOutside = e => { if (!headerRef.current?.contains(e.target)) { setUserMenuOpen(false); setSearchOpen(false); } };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', closeOutside);
    return () => { document.removeEventListener('keydown', close); document.removeEventListener('pointerdown', closeOutside); };
  }, []);
  const submitSearch = event => {
    event.preventDefault();
    if (query.trim()) navigate(`/shop?search=${encodeURIComponent(query.trim())}`);
  };

  return <header ref={headerRef} className="store-header">
    <AnnouncementBar />
    <div className="store-nav container-x">
      <button className="btn-icon lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen} aria-controls="mobile-navigation"><MenuIcon /></button>
      <nav className="desktop-navigation" aria-label="Main navigation">{NAV_LINKS.map(link => <Link key={link.label} to={link.to} aria-current={activeLink === link.label ? 'page' : undefined} className={`store-nav-link ${link.label === 'Sale' ? 'sale-link' : ''}`}>{link.label}</Link>)}</nav>
      <Link to="/" className="store-logo" aria-label="Koorm home"><BrandMark /></Link>
      <div className="store-nav-actions">
        <button className="btn-icon nav-search" aria-label="Search" aria-expanded={searchOpen} onClick={() => { setSearchOpen(!searchOpen); setUserMenuOpen(false); }}><SearchIcon width={21} height={21} /></button>
        <div className="relative">
          <button className="btn-icon" aria-label="Account" aria-expanded={userMenuOpen} onClick={() => { setUserMenuOpen(!userMenuOpen); setSearchOpen(false); }}><UserIcon width={23} height={23} /></button>
          {userMenuOpen && <div className="account-menu">
            {user ? <><p>Hello, {user.name.split(' ')[0]}</p><Link to="/profile">My orders</Link><button onClick={() => { logout(); setUserMenuOpen(false); navigate('/'); }}>Logout</button></> : <><Link to="/login">Login</Link><Link to="/register">Create account</Link></>}
          </div>}
        </div>
        <Link to="/wishlist" className="btn-icon nav-wishlist relative" aria-label={`Wishlist, ${wishlist?.length || 0} items`}><HeartIcon width={22} height={22} />{wishlist?.length > 0 && <span className="nav-count" aria-hidden="true">{wishlist.length > 99 ? '99+' : wishlist.length}</span>}</Link>
        <Link to="/cart" className="btn-icon relative" aria-label={`Cart, ${cartCount || 0} items`}><BagIcon width={22} height={22} />{cartCount > 0 && <span className="nav-count" aria-hidden="true">{cartCount > 99 ? '99+' : cartCount}</span>}</Link>
      </div>
    </div>
    {searchOpen && <form onSubmit={submitSearch} className="header-search container-x"><SearchIcon width={20} height={20} /><input className="input-field" autoFocus aria-label="Search the collection" placeholder="Search shirts, fabrics and colours" value={query} onChange={e => setQuery(e.target.value)} /><button type="submit" className="text-link">Search</button><button type="button" className="btn-icon" aria-label="Close search" onClick={() => setSearchOpen(false)}><CloseIcon width={18} height={18} /></button></form>}
    <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} id="mobile-navigation" label="Browse the collection">
      <div className="flex items-center justify-between border-b border-sand p-5"><Link to="/" aria-label="Koorm home"><BrandMark /></Link><button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="btn-icon"><CloseIcon /></button></div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6"><form onSubmit={submitSearch} className="mb-6 flex gap-2"><input className="input-field" aria-label="Search collection" placeholder="Search the collection" value={query} onChange={e => setQuery(e.target.value)} /><button className="btn-icon" aria-label="Submit search"><SearchIcon width={20} /></button></form><nav>{NAV_LINKS.map(link => <Link className="mobile-nav-link" key={link.label} to={link.to}>{link.label}<ChevronRightIcon width={16} /></Link>)}<Link className="mobile-nav-link" to="/wishlist">Wishlist<HeartIcon width={17} /></Link><Link className="mobile-nav-link" to="/contact">Contact us<ChevronRightIcon width={16} /></Link></nav><Link to={user ? '/profile' : '/login'} className="campaign-button mt-8 w-full">{user ? 'My account' : 'Login / Register'}</Link></div>
    </Drawer>
  </header>;
}
