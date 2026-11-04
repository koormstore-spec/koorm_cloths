import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../api/axios';
import ProductCard from '../components/ProductCard';
import ColorSelect from '../components/ColorSelect';
import PriceRange, { PRICE_STEP, formatPrice } from '../components/PriceRange';
import SkeletonGrid from '../components/SkeletonGrid';
import { ChevronDownIcon, CloseIcon } from '../components/Icons';

const SORT_OPTIONS = [ ['', 'Default sorting'], ['newest', 'Newest first'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['rating', 'Top rated'] ];
const FILTER_KEYS = ['category', 'search', 'minPrice', 'maxPrice', 'sale', 'inStock', 'size', 'color'];

export default function Shop() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [colors, setColors] = useState([]);
  const [catalogueMaxPrice, setCatalogueMaxPrice] = useState(5000);
  const [colorsLoading, setColorsLoading] = useState(true);
  const [colorsError, setColorsError] = useState(false);
  const [colorsRetry, setColorsRetry] = useState(0);
  const queryString = searchParams.toString();
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const sort = searchParams.get('sort') || '';
  const search = searchParams.get('search') || '';
  const color = searchParams.get('color') || '';
  const colorOptions = color && !colors.includes(color) ? [color, ...colors] : colors;
  const requestedMinimum = Math.max(0, Number(searchParams.get('minPrice')) || 0);
  const requestedMaximum = searchParams.has('maxPrice') ? Math.max(0, Number(searchParams.get('maxPrice')) || 0) : null;
  const priceLimit = Math.ceil(Math.max(2000, catalogueMaxPrice, requestedMinimum, requestedMaximum || 0) / PRICE_STEP) * PRICE_STEP;
  const maximumPrice = requestedMaximum ?? priceLimit;
  const minimumPrice = Math.min(requestedMinimum, maximumPrice);
  const activeFilters = FILTER_KEYS.filter(key => searchParams.get(key));
  const title = search ? `Results for “${search}”` : searchParams.get('sale') === 'true' ? 'The sale edit' : sort === 'newest' ? 'New arrivals' : 'Men’s shirts';
  const updateParams = updates => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key); });
    next.delete('page');
    setSearchParams(next);
  };
  useEffect(() => {
    const controller = new AbortController();
    setColorsLoading(true);
    setColorsError(false);
    api.get('/products/filters', { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) {
          setColors(data.colors);
          if (Number.isFinite(data.maxPrice)) setCatalogueMaxPrice(data.maxPrice);
        }
      })
      .catch(() => { if (!controller.signal.aborted) setColorsError(true); })
      .finally(() => { if (!controller.signal.aborted) setColorsLoading(false); });
    return () => controller.abort();
  }, [colorsRetry]);
  useEffect(() => {
    const controller = new AbortController();
    const params = Object.fromEntries(new URLSearchParams(queryString));
    setLoading(true);
    setError(false);
    api.get('/products', { params: { ...params, page: Math.max(1, Number(params.page) || 1), limit: 12 }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setProducts(data.products); setPages(data.pages); setTotal(data.total); } })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [queryString, retry]);

  return <div className="reference-shop container-x">
    <div className="shop-intro"><p className="shop-breadcrumb"><Link to="/">Home</Link> / {search ? 'Search' : 'Men’s Shirts'}</p><h1 className="reference-heading">{title}</h1><p className="reference-subtitle">Crisp, clean, and versatile. These are the styles you’ll turn to again and again.</p></div>
    <div className="shop-toolbar"><div><p aria-live="polite">{loading ? 'Loading the collection…' : error ? 'Collection unavailable' : `Showing ${total ? (page - 1) * 12 + 1 : 0}–${Math.min(page * 12, total)} of ${total} results`}</p><button className="shop-filter-toggle" aria-expanded={filtersOpen} aria-controls="collection-filters" onClick={() => setFiltersOpen(!filtersOpen)}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 6h18M6 12h12M9 18h6" /></svg>Filter {activeFilters.length > 0 && `(${activeFilters.length})`}</button></div><div className="shop-sort"><select aria-label="Sort products" value={sort} onChange={e => updateParams({ sort: e.target.value })}>{SORT_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><ChevronDownIcon width={16} /></div></div>
    {filtersOpen && <section id="collection-filters" className="collection-filters" aria-label="Collection filters">
      <div className="filter-fields">
        <PriceRange minimum={minimumPrice} maximum={maximumPrice} limit={priceLimit} onChange={(minimum, maximum) => updateParams({ minPrice: minimum > 0 ? String(minimum) : '', maxPrice: maximum < priceLimit ? String(maximum) : '' })} />
        <label>Fabric<select className="input-field" value={['Cotton','Linen','Oxford','Twill'].includes(search) ? search : ''} onChange={e => updateParams({ search: e.target.value })}><option value="">All fabrics</option>{['Cotton','Linen','Oxford','Twill'].map(v => <option key={v}>{v}</option>)}</select></label>
        <div>
          <ColorSelect colors={colorOptions} value={color} disabled={colorsLoading} onChange={value => updateParams({ color: value })} />
          {colorsError && <p role="alert" className="mt-2 text-sm">Could not load colours. <button type="button" className="text-link" onClick={() => setColorsRetry(value => value + 1)}>Retry colours</button></p>}
        </div>
      </div>
      <div className="filter-checkboxes"><label><input type="checkbox" checked={searchParams.get('inStock') === 'true'} onChange={e => updateParams({ inStock: e.target.checked ? 'true' : '' })} /> In stock</label><label><input type="checkbox" checked={searchParams.get('sale') === 'true'} onChange={e => updateParams({ sale: e.target.checked ? 'true' : '' })} /> On sale</label></div>
      <fieldset><legend className="mb-3 text-sm font-semibold">Product size</legend><div className="flex flex-wrap gap-2">{['S','M','L','XL','XXL'].map(size => <button key={size} className="quick-view-size" aria-pressed={searchParams.get('size') === size} onClick={() => updateParams({ size: searchParams.get('size') === size ? '' : size })}>{size}</button>)}</div></fieldset>
    </section>}
    {activeFilters.length > 0 && <div className="active-filter-list">{activeFilters.map(key => <button key={key} className="filter-pill" onClick={() => updateParams({ [key]: '' })}>{key === 'sale' ? 'On sale' : key === 'inStock' ? 'In stock' : key === 'minPrice' ? `From ${formatPrice(Number(searchParams.get(key)))}` : key === 'maxPrice' ? `Up to ${formatPrice(Number(searchParams.get(key)))}` : `${key}: ${searchParams.get(key)}`}<CloseIcon width={12} /></button>)}<button className="text-link" onClick={() => setSearchParams({})}>Clear all</button></div>}
    {loading ? <SkeletonGrid count={12} /> : error ? <div className="shop-empty" role="alert"><h2>We couldn’t load the collection.</h2><p>Please try again in a moment.</p><button className="campaign-button" onClick={() => setRetry(retry + 1)}>Try again</button></div> : products.length ? <div className="product-grid">{products.map(product => <ProductCard key={product.id} product={product} />)}</div> : <div className="shop-empty"><h2>No shirts found.</h2><p>Try a different fabric or clear your filters.</p><button className="campaign-button" onClick={() => setSearchParams({})}>View all shirts</button></div>}
    {!loading && !error && pages > 1 && <nav className="shop-pagination" aria-label="Collection pages">{Array.from({ length: pages }, (_, i) => i + 1).map(number => <button key={number} aria-label={`Page ${number}`} aria-current={page === number ? 'page' : undefined} onClick={() => { const next = new URLSearchParams(searchParams); next.set('page', number); setSearchParams(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{number}</button>)}</nav>}
  </div>;
}
