import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import ProductCarousel from './ProductCarousel';
import SkeletonGrid from './SkeletonGrid';

const PAGE_SIZE = 12;

export default function HomeProducts() {
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const loadingRef = useRef(true);
  const sentinelRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    loadingRef.current = true;
    setLoading(true);
    setError(false);
    api.get('/products', {
      params: { page, limit: PAGE_SIZE, sort: 'newest' },
      signal: controller.signal,
    }).then(({ data }) => {
      if (controller.signal.aborted) return;
      setProducts(previous => [...new Map(
        [...previous, ...data.products].map(product => [product.id, product]),
      ).values()]);
      setTotal(data.total);
      setHasMore(page < data.pages && data.products.length > 0);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    }).finally(() => {
      if (!controller.signal.aborted) {
        loadingRef.current = false;
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, [page, retry]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || error || !hasMore) return;
    // Lock immediately: several observer notifications can arrive before a render.
    loadingRef.current = true;
    setLoading(true);
    setPage(current => current + 1);
  }, [error, hasMore]);

  useEffect(() => {
    if (loading || error || !hasMore || !window.IntersectionObserver) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) loadMore();
    }, { rootMargin: '400px 0px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loading, error, hasMore, loadMore]);

  const retryPage = () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(false);
    setRetry(current => current + 1);
  };

  return (
    <section id="all-products" className="container-x section-space pt-0" aria-labelledby="all-products-title">
      <div className="section-heading">
        <div>
          <h2 id="all-products-title" className="reference-heading">You may also like</h2>
          <p className="reference-subtitle">Explore the full Koorm collection</p>
        </div>
        <Link to="/shop" className="text-link">Filter & sort <span aria-hidden="true">↗</span></Link>
      </div>
      <div aria-busy={loading}>
        <ProductCarousel products={products} />
        {loading && !products.length && <div className="carousel-loading"><SkeletonGrid count={4} cols="grid-cols-2 md:grid-cols-3 lg:grid-cols-4" /></div>}
      </div>
      <div ref={sentinelRef} className="mt-8 flex flex-col items-center gap-4 text-center">
        <p role="status" className="text-sm text-muted">
          {loading ? 'Loading products…' : products.length ? `Showing ${products.length} of ${total} products` : error ? '' : 'No products available yet. Check back soon.'}
        </p>
        {error ? <>
          <p role="alert" className="text-sm text-muted">{products.length ? 'We couldn’t load more products. Your favourites are still here.' : 'We couldn’t load the collection just now.'}</p>
          <button type="button" onClick={retryPage} className="btn-outline">Try again</button>
        </> : hasMore ? (
          <button type="button" onClick={loadMore} disabled={loading} className="btn-outline">{loading ? 'Loading…' : 'Load more products'}</button>
        ) : null}
      </div>
    </section>
  );
}
