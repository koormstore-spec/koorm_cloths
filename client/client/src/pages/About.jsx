import { Link } from 'react-router-dom';

export default function About() {
  return (
    <section className="container-x section-space">
      <div className="mb-9 max-w-2xl"><p className="eyebrow mb-4">A little about us</p><h1 className="section-title">Good clothes.<br />For your kind of everyday.</h1></div>
      <div className="brand-story">
        <div className="brand-story-photo"><img src="/images/collection-26/olive-green-european-linen-shirt/1.jpg" alt="Relaxed linen pieces from the Koorm collection" width="1000" height="1333" /></div>
        <div className="brand-story-copy"><p className="eyebrow mb-4">The Koorm approach</p><h2 className="font-serif text-3xl leading-tight">Getting dressed<br />should feel this easy.</h2><p className="mt-5 text-sm leading-7 text-muted">Thoughtfully designed clothing for everyday living. We bring together quality fabrics, easy silhouettes, and honest pricing, so you can find the pieces that feel like you.</p><p className="mt-4 text-sm leading-7 text-muted">A shirt for work. A favourite for the weekend. Something that simply fits into your day.</p><Link to="/shop" className="text-link mt-6">Explore the collection <span aria-hidden="true">↗</span></Link></div>
      </div>
      <div className="mt-10 grid gap-7 border-b border-sand pb-8 sm:grid-cols-2"><div><p className="eyebrow mb-3">Find us</p><h2 className="font-serif text-2xl">Koorm</h2><p className="mt-3 text-sm text-muted">Hosa road</p><Link to="/contact" className="text-link mt-3">Get in touch <span aria-hidden="true">↗</span></Link></div><div><p className="eyebrow mb-3">Shop at your pace</p><h2 className="font-serif text-2xl">A little room to decide.</h2><p className="mt-3 text-sm leading-7 text-muted">Our return period is 1 month. Contact us for help with your order or to arrange a return.</p><Link to="/contact#returns" className="text-link mt-3">Returns & exchanges <span aria-hidden="true">↗</span></Link></div></div>
    </section>
  );
}
