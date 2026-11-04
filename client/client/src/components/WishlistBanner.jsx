import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRightIcon } from './Icons';

export default function WishlistBanner({ className = '' }) {
  const headingId = useId();

  return (
    <section className={`wishlist-banner ${className}`} aria-labelledby={headingId}>
      <div className="container-x wishlist-banner-inner">
        <div>
          <p className="wishlist-banner-kicker">A place for your favourites</p>
          <h2 id={headingId}>Make yourself at home.</h2>
          <p className="wishlist-banner-description">Save the pieces you love. Find them whenever you’re ready.</p>
        </div>
        <Link to="/wishlist" className="btn-primary wishlist-banner-link">
          Your wishlist <ChevronRightIcon width={16} height={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
