export default function AuthLayout({ children, background }) {
  if (background === 'essentials') {
    return <section className="login-essentials fade-in">
      <div className="login-essentials-background" aria-hidden="true">
        <img src="/images/collection-26/burgundy-check-twill-shirt/1.jpg" alt="" className="login-essentials-model login-essentials-model-left" />
        <img src="/images/collection-26/white-grey-stripe-cotton-shirt/1.jpg" alt="" className="login-essentials-model login-essentials-model-right" />
      </div>
      <div className="login-essentials-content">
        <div className="login-essentials-intro">
          <span className="login-essentials-rule" aria-hidden="true" />
          <p className="login-essentials-heading">Your wardrobe starts here.</p>
          <p className="login-essentials-description">Your favourites. Your next find. All in one place.</p>
        </div>
        <div className="auth-content login-essentials-card">
          <p className="eyebrow mb-5">Your everyday, considered</p>
          {children}
        </div>
      </div>
    </section>;
  }

  return <section className="auth-shell fade-in"><div className="auth-layout">
    <div className="auth-banner"><div className="absolute inset-x-8 top-10 text-[#f5efe5]" aria-hidden="true"><span className="text-3xl font-medium tracking-[0.28em]">KOORM</span><span className="mt-3 block text-[10px] uppercase tracking-[0.3em]">Everyday essentials</span></div><div className="absolute inset-x-5 bottom-5 bg-cream/95 p-6"><p className="eyebrow mb-3">Welcome to Koorm</p><p className="font-serif text-3xl leading-tight">Good days start<br />with a great shirt.</p></div></div>
    <div className="auth-content"><p className="eyebrow mb-5">Your everyday, considered</p>{children}</div>
  </div></section>;
}
