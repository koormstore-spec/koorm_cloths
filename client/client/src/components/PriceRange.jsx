import { useId, useRef } from 'react';

export const PRICE_STEP = 500;
export const formatPrice = value => `₹${value.toLocaleString('en-IN')}`;

export default function PriceRange({ minimum, maximum, limit, onChange }) {
  const hintId = useId();
  const minimumInput = useRef(null);
  const maximumInput = useRef(null);
  const changeMinimum = value => onChange(Math.min(Number(value), maximum), maximum);
  const changeMaximum = value => onChange(minimum, Math.max(Number(value), minimum));
  const ticks = [...new Set(Array.from({ length: 5 }, (_, index) => Math.round((limit * index / 4) / PRICE_STEP) * PRICE_STEP))];
  const selectPrice = event => {
    if (event.target.tagName === 'INPUT' || event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const value = Math.min(limit, Math.max(0, Math.round(((event.clientX - bounds.left - 12) / (bounds.width - 24) * limit) / PRICE_STEP) * PRICE_STEP));
    event.preventDefault();
    if (Math.abs(value - minimum) < Math.abs(value - maximum)) {
      minimumInput.current.focus({ preventScroll: true });
      changeMinimum(value);
    } else {
      maximumInput.current.focus({ preventScroll: true });
      changeMaximum(value);
    }
  };

  return <fieldset className="price-range">
    <legend>Price range</legend>
    <div className="price-range-values"><span>{formatPrice(minimum)}</span><span>{formatPrice(maximum)}</span></div>
    <div className="price-range-control" onPointerDown={selectPrice} style={{ '--range-start': `${minimum / limit * 100}%`, '--range-end': `${maximum / limit * 100}%` }}>
      <div className="price-range-track" aria-hidden="true"><span /></div>
      <input ref={minimumInput} type="range" aria-label="Minimum price" aria-valuetext={formatPrice(minimum)} aria-valuemax={maximum} aria-describedby={hintId}
        min="0" max={limit} step={PRICE_STEP} value={minimum} onChange={event => changeMinimum(event.target.value)}
        className={minimum === limit ? 'price-range-min at-limit' : 'price-range-min'} />
      <input ref={maximumInput} type="range" aria-label="Maximum price" aria-valuetext={formatPrice(maximum)} aria-valuemin={minimum} aria-describedby={hintId}
        min="0" max={limit} step={PRICE_STEP} value={maximum} onChange={event => changeMaximum(event.target.value)} />
    </div>
    <div className="price-range-ticks" aria-hidden="true">{ticks.map(value => <span key={value} style={{ left: `${value / limit * 100}%` }}>{formatPrice(value)}</span>)}</div>
    <p id={hintId} className="price-range-hint">Adjust in ₹500 steps</p>
  </fieldset>;
}
