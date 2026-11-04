import { Link } from 'react-router-dom';

export default function HomePhotoGallery({ products = [] }) {
  if (!products.length) return null;
  return (
    <section id="all-photos" className="container-x section-space pt-0" aria-labelledby="all-photos-title">
      <div className="section-heading">
        <div><p className="eyebrow mb-3">A closer look</p><h2 id="all-photos-title" className="section-title">The details make the difference.</h2><p className="mt-3 text-sm text-muted">Open a shirt to explore every photograph, from the full look to the finer details.</p></div>
      </div>
      <div className="divide-y divide-sand border-y border-sand">
        {products.map(product => (
          <details key={product.id} className="group py-4 sm:py-5">
            <summary className="flex cursor-pointer list-none items-center gap-4 [&::-webkit-details-marker]:hidden">
              <img src={product.images?.[0]} alt="" width="60" height="80" loading="lazy" className="h-20 w-[60px] object-cover" />
              <div className="min-w-0 flex-1"><h3 className="font-serif text-lg sm:text-2xl">{product.name}</h3><p className="mt-1 text-xs text-muted">{product.images?.length || 0} photographs · {product.colors?.join(', ')}</p></div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sand text-xl transition-transform group-open:rotate-45" aria-hidden="true">+</span>
            </summary>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {(product.images || []).map((src, index) => <Link key={src} to={`/product/${product.slug}`} className="block overflow-hidden bg-sand/40"><img src={src} alt={`${product.name}, view ${index + 1}`} width="1200" height="1600" loading="lazy" decoding="async" className="aspect-[3/4] w-full object-contain" /></Link>)}
            </div>
            <Link to={`/product/${product.slug}`} className="text-link mt-4">View shirt details <span aria-hidden="true">↗</span></Link>
          </details>
        ))}
      </div>
    </section>
  );
}
