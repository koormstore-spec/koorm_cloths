import { useState } from 'react';

const message = 'First-time users: 30% off with code FIRST30';
const [offerText] = message.split(' FIRST30');

export default function AnnouncementBar() {
  const [paused, setPaused] = useState(false);

  return (
    <div className="announcement-bar flex items-center">
      <p className="sr-only">{message}. Complimentary shipping over ₹1,999. Easy 1-month returns.</p>
      <div className="min-w-0 flex-1 overflow-hidden" aria-hidden="true">
        <div className="announcement-track" style={{ animationPlayState: paused ? 'paused' : 'running' }}>
          {[0, 1].map((copy) => (
            <div key={copy} className="announcement-copy">
              {[0, 1].map((repeat) => (
                <span key={repeat} className="flex shrink-0 items-center gap-8 px-4">
                  <strong className="font-semibold">{offerText} <span className="first-offer-code">FIRST30</span></strong>
                  <span className="text-clay">•</span>
                  <span>Complimentary shipping over ₹1,999</span>
                  <span className="text-clay">•</span>
                  <span>Easy 1-month returns</span>
                  <span className="text-clay">•</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setPaused((value) => !value)}
        aria-label={paused ? 'Resume announcement' : 'Pause announcement'}
        className="announcement-control flex h-10 w-10 shrink-0 items-center justify-center border-l border-cream/20 text-cream transition-colors hover:bg-white/10"
      >
        <span aria-hidden="true">{paused ? '▶' : 'Ⅱ'}</span>
      </button>
    </div>
  );
}
