import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import HomeProducts from '../components/HomeProducts';
import WishlistBanner from '../components/WishlistBanner';
import MembershipBanner from '../components/MembershipBanner';
import CustomerReviews from '../components/CustomerReviews';
import ProductCarousel from '../components/ProductCarousel';
import HeroCarousel from '../components/HeroCarousel';
import SkeletonGrid from '../components/SkeletonGrid';

const image = (slug, view = 1) => `/images/collection-26/${slug}/${view}.jpg`;
const FABRICS = [
  { name: 'Pure cotton', search: 'Cotton', slug: 'white-grey-cotton-shirt' },
  { name: 'Natural linen', search: 'Linen', slug: 'sand-beige-linen-shirt' },
  { name: 'Everyday oxford', search: 'Oxford', slug: 'charcoal-grey-oxford-shirt' },
  { name: 'Textured twill', search: 'Twill', slug: 'olive-green-check-twill-shirt' },
];

export default function Home() {
  const [featured, setFeatured] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api.get('/products', { params: { limit: 8, sort: 'newest' }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setFeatured(data.products); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  return <div className="home-page">
    <HeroCarousel />

    <section className="editorial-section container-x">
      <Link to="/shop?search=Linen" className="editorial-image"><img src={image('olive-green-european-linen-shirt')} alt="Discover the European linen collection" loading="lazy" /><span>The linen collection <span aria-hidden="true">↗</span></span></Link>
      <div className="editorial-copy"><p className="reference-subtitle">Designed for the way you live</p><h2 className="reference-heading">Every detail.<br />Every day.</h2><p>Clean silhouettes. Beautiful fabrics. A fit that feels like you. Discover shirts that bring comfort and confidence to every occasion.</p><Link to="/shop" className="campaign-button">Find your fit</Link></div>
    </section>

    <section className="fabric-section container-x" aria-labelledby="fabric-heading">
      <h2 id="fabric-heading" className="reference-heading">Feel the difference</h2>
      <p className="reference-subtitle">Exceptional fabrics. Effortless style.</p>
      <div className="fabric-grid">{FABRICS.map(fabric => <Link key={fabric.name} to={`/shop?search=${fabric.search}`} className="fabric-card">
        <div className="fabric-swatch"><img src={image(fabric.slug, 5)} alt={`${fabric.name} fabric detail`} loading="lazy" /></div>
        <h3>{fabric.name}</h3>
      </Link>)}</div>
    </section>

    <section className="featured-section container-x" aria-labelledby="featured-heading">
      <h2 id="featured-heading" className="reference-heading">New arrivals</h2>
      <p className="reference-subtitle">A fresh perspective on your everyday wardrobe</p>
      {loading ? <div className="carousel-loading"><SkeletonGrid count={4} cols="grid-cols-2 md:grid-cols-3 lg:grid-cols-4" /></div> : error ? <p role="status" className="text-center py-8">The collection is taking a little longer to load. <Link to="/shop" className="underline">Visit the shop</Link></p> : <ProductCarousel products={featured} label="New arrivals" />}
      <Link to="/shop?sort=newest" className="campaign-button section-cta">View all new arrivals</Link>
    </section>

    <HomeProducts />

    <WishlistBanner />

    <MembershipBanner />

    <div className="customer-reviews-background"><CustomerReviews /></div>
  </div>;
}
