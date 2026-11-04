import { useState } from 'react';
import ZoomImage from './ZoomImage';
import { ChevronRightIcon } from './Icons';

export default function ProductGallery({ images, name }) {
  const [active, setActive] = useState(0);
  const changeImage = (step) => setActive(index => (index + step + images.length) % images.length);

  if (!images.length) return <div className="flex aspect-[3/4] items-center justify-center bg-sand/30 text-sm text-muted">Image coming soon</div>;

  return (
    <div className="mx-auto w-full max-w-xl" onKeyDown={event => {
      if (event.target.tagName === 'INPUT') return;
      if (event.key === 'ArrowRight') { event.preventDefault(); changeImage(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); changeImage(-1); }
    }}>
      <div className="gallery-stage">
        <ZoomImage key={images[active]} src={images[active]} alt={`${name}, view ${active + 1}`} />
        {images.length > 1 && <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-cream/95 px-1 shadow-sm">
          <button type="button" className="btn-icon h-10 w-10" onClick={() => changeImage(-1)} aria-label="Previous product image"><ChevronRightIcon width={16} height={16} className="rotate-180" /></button>
          <span className="min-w-8 text-center text-[11px] tabular-nums" aria-live="polite">{active + 1} / {images.length}</span>
          <button type="button" className="btn-icon h-10 w-10" onClick={() => changeImage(1)} aria-label="Next product image"><ChevronRightIcon width={16} height={16} /></button>
        </div>}
      </div>
      <div className="gallery-thumbnails" aria-label="Choose a product image">
        {images.map((image, index) => <button key={`${image}-${index}`} type="button" className="gallery-thumbnail" onClick={() => setActive(index)} aria-label={`View product image ${index + 1}`} aria-pressed={active === index}><img src={image} alt="" width="1000" height="1333" loading="lazy" /></button>)}
      </div>
      <p className="mt-1 text-center text-[11px] text-muted">A closer look at the details. Tap the image to zoom.</p>
    </div>
  );
}
