export default function Contact() {
  return (
    <section className="container-x py-14 md:py-24">
      <p className="eyebrow mb-4">We're here to help</p>
      <h1 className="section-title">Contact Us</h1>
      <p className="mt-6 max-w-xl text-base leading-relaxed text-muted">
        Get in touch with us for questions about the collection, your order, or returns.
      </p>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="border border-sand bg-white/70 p-6 sm:p-8">
          <h2 className="font-serif text-2xl">Koorm</h2>
          <dl className="mt-6 space-y-6 text-sm">
            <div>
              <dt className="font-semibold">Phone</dt>
              <dd className="mt-2"><a href="tel:+917892766354" className="link-underline text-muted hover:text-accent">7892766354</a></dd>
            </div>
            <div>
              <dt className="font-semibold">Location</dt>
              <dd className="mt-2 text-muted">Hosa road</dd>
            </div>
          </dl>
        </div>
        <div id="returns" className="scroll-mt-56 border border-sand bg-sand/25 p-6 sm:p-8">
          <p className="eyebrow mb-3">Return policy</p>
          <h2 className="font-serif text-3xl">1 month</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted">Our return period is 1 month from delivery. To start a return, open the order under My orders and choose “Request a return”. Online payments are refunded to the original payment method; for cash on delivery orders we transfer the refund to you. Questions? Call us.</p>
          <a href="tel:+917892766354" className="btn-primary mt-6">Call 7892766354</a>
        </div>
      </div>
    </section>
  );
}
