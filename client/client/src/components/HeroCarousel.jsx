import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';

const SLIDES = [
  {
    title: 'Everyday essentials',
    subtitle: 'Crafted for comfort and confidence',
    description: 'From premium cottons to rich linens, every shirt is designed to keep you comfortable without compromising on style.',
    button: 'Explore the collection',
    href: '/shop?sort=newest',
    images: [
      { slug: 'sand-beige-linen-shirt', alt: 'Sand beige linen shirt from the Koorm collection' },
      { slug: 'white-grey-stripe-cotton-shirt', alt: 'White grey stripe cotton shirt from the Koorm collection' },
    ],
  },
  {
    title: 'Comfortable',
    subtitle: 'Made for every day',
    description: 'Soft cottons, breathable linens, and effortless fits. Find your everyday comfort in shirts made to move with you.',
    button: 'Shop now',
    href: '/shop',
    images: [
      { slug: 'olive-green-european-linen-shirt', alt: 'Olive green European linen shirt from the Koorm collection' },
      { slug: 'light-blue-stripe-cotton-linen-shirt', alt: 'Light blue stripe cotton linen shirt from the Koorm collection' },
    ],
  },
  {
    title: 'Wear your story',
    subtitle: 'Style that speaks for you',
    description: 'From weekday plans to weekend moments, discover shirts that make every look your own.',
    button: 'Shop now',
    href: '/shop',
    images: [
      { slug: 'rust-european-linen-shirt', alt: 'Rust European linen shirt from the Koorm collection' },
      { slug: 'dark-navy-cotton-shirt', alt: 'Dark navy cotton shirt from the Koorm collection' },
    ],
  },
];

export default function HeroCarousel() {
  const trackId = useId();
  const [activeSlide, setActiveSlide] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => setAutoPlay(!preference?.matches);
    update();
    preference?.addEventListener?.('change', update);
    return () => preference?.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (!autoPlay || hovered || focused) return undefined;
    const timer = window.setInterval(() => {
      if (!document.hidden) setActiveSlide(current => (current + 1) % SLIDES.length);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [activeSlide, autoPlay, hovered, focused]);

  return (
    <section
      className="winter-campaign"
      aria-label="Featured collections"
      aria-roledescription="carousel"
      onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
    >
      <div
        id={trackId}
        className="winter-slides"
        style={{ transform: `translateX(-${activeSlide * 100}%)` }}
        aria-live={autoPlay ? 'off' : 'polite'}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
      >
        {SLIDES.map((slide, index) => (
          <div key={slide.title} className="winter-slide" role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${SLIDES.length}`} aria-hidden={index !== activeSlide} inert={index !== activeSlide ? '' : undefined}>
            {slide.images.map((photo, photoIndex) => (
              <img key={photo.slug} src={`/images/collection-26/${photo.slug}/1.jpg`} alt={photo.alt} width="1200" height="1600" fetchpriority={index === 0 ? 'high' : undefined} className={`winter-model winter-model-${photoIndex === 0 ? 'left' : 'right'}`} />
            ))}
            <div className="winter-copy">
              <h1>{slide.title}</h1>
              <h2>{slide.subtitle}</h2>
              <p>{slide.description}</p>
              <Link to={slide.href} className="campaign-button">{slide.button}</Link>
            </div>
          </div>
        ))}
      </div>
      <div className="winter-controls">
        {SLIDES.map((slide, index) => (
          <button key={slide.title} type="button" className="winter-dot" aria-label={`Show slide ${index + 1}: ${slide.title}`} aria-current={index === activeSlide ? 'true' : undefined} aria-controls={trackId} onClick={() => setActiveSlide(index)}><span /></button>
        ))}
      </div>
    </section>
  );
}
