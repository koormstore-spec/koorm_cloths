import { useState } from 'react';

export default function ZoomImage({ src, alt, className = '', children }) {
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');

  const moveZoom = (event) => {
    if (event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setOrigin(`${((event.clientX - bounds.left) / bounds.width) * 100}% ${((event.clientY - bounds.top) / bounds.height) * 100}%`);
  };

  return (
    <button
      type="button"
      aria-label={`${zoomed ? 'Zoom out' : 'Zoom in'}: ${alt}`}
      aria-pressed={zoomed}
      onClick={() => setZoomed((value) => !value)}
      onPointerMove={moveZoom}
      onPointerLeave={() => setOrigin('50% 50%')}
      onKeyDown={(event) => { if (event.key === 'Escape') setZoomed(false); }}
      className={`product-zoom relative block w-full overflow-hidden bg-sand/40 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay ${zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'} ${className}`}
    >
      <img
        src={src}
        alt={alt}
        width="1000"
        height="1333"
        className={`product-zoom-image h-full w-full object-contain transition-transform duration-500 ease-out motion-reduce:transition-none ${zoomed ? 'scale-[1.8]' : ''}`}
        style={{ transformOrigin: origin }}
      />
      <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1.5 text-[12px] font-semibold text-ink">
        {zoomed ? '− Zoom out' : '+ Zoom in'}
      </span>
      {children}
    </button>
  );
}
