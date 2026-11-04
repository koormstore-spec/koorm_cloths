import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDownIcon } from './Icons';
import { swatchBackground } from '../lib/colorSwatches';

const allColors = 'conic-gradient(#73794d 0 25%, #345da1 25% 50%, #b6643d 50% 75%, #c8b99e 75%)';
const Swatch = ({ color }) => <span className="filter-color-swatch" style={{ background: color ? swatchBackground(color) : allColors }} aria-hidden="true" />;

export default function ColorSelect({ colors, value, onChange, disabled = false }) {
  const id = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const list = useRef(null);
  const typed = useRef({ text: '', time: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [opensUp, setOpensUp] = useState(false);
  const options = ['', ...colors];
  const label = color => color || 'All colours';

  const show = (index = Math.max(0, options.indexOf(value))) => {
    if (disabled) return;
    const bounds = trigger.current.getBoundingClientRect();
    setOpensUp(window.innerHeight - bounds.bottom < 280 && bounds.top > window.innerHeight - bounds.bottom);
    setActive(index);
    setOpen(true);
  };
  const choose = (index, restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) trigger.current.focus();
    onChange(options[index]);
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const menu = list.current;
    const option = menu?.children[active];
    if (!option) return;
    if (option.offsetTop < menu.scrollTop) menu.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > menu.scrollTop + menu.clientHeight) menu.scrollTop = option.offsetTop + option.offsetHeight - menu.clientHeight;
  }, [open, active]);

  const onKeyDown = event => {
    if (disabled) return;
    const { key } = event;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(key)) {
      event.preventDefault();
      let next = open ? active : Math.max(0, options.indexOf(value));
      if (key === 'Home') next = 0;
      else if (key === 'End') next = options.length - 1;
      else if (open) next += { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[key];
      show(Math.max(0, Math.min(options.length - 1, next)));
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (open) choose(active); else show();
    } else if (key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (key === 'Tab' && open) {
      choose(active, false);
    } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      const text = (now - typed.current.time < 700 ? typed.current.text : '') + key.toLowerCase();
      typed.current = { text, time: now };
      const query = [...text].every(character => character === text[0]) ? text[0] : text;
      const start = query.length === 1 ? active + 1 : active;
      for (let step = 0; step < options.length; step++) {
        const index = (start + step) % options.length;
        if (label(options[index]).toLowerCase().startsWith(query)) { show(index); break; }
      }
    }
  };

  return <div ref={root} className="color-select" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label id={`${id}-label`} htmlFor={`${id}-trigger`}>Colour</label>
    <div className="color-select-control">
      <button ref={trigger} id={`${id}-trigger`} type="button" role="combobox" aria-labelledby={`${id}-label`} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-options`} aria-activedescendant={open ? `${id}-option-${active}` : undefined} disabled={disabled} className="input-field color-select-trigger" onClick={() => { if (open) setOpen(false); else show(); }} onKeyDown={onKeyDown}>
        <Swatch color={value} /><span className="color-select-value">{disabled ? 'Loading colours…' : label(value)}</span><ChevronDownIcon width={16} height={16} aria-hidden="true" />
      </button>
      {open && <ul ref={list} id={`${id}-options`} role="listbox" aria-labelledby={`${id}-label`} className={`color-select-options${opensUp ? ' color-select-options-up' : ''}`}>
        {options.map((color, index) => <li key={color} id={`${id}-option-${index}`} role="option" aria-selected={value === color} className={`color-select-option${active === index ? ' is-active' : ''}`} onMouseMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>
          <Swatch color={color} /><span className="color-option-label">{label(color)}</span>{value === color && <span className="color-option-check" aria-hidden="true">✓</span>}
        </li>)}
      </ul>}
    </div>
  </div>;
}
