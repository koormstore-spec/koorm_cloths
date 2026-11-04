import { StarIcon } from './Icons';

export default function StarRating({ rating = 0, count, iconSize = 13 }) {
  const full = Math.round(Number(rating));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="flex shrink-0 gap-0.5 text-accent">
        {[1, 2, 3, 4, 5].map((i) => (
          <StarIcon key={i} width={iconSize} height={iconSize} filled={i <= full} strokeWidth={1.2} />
        ))}
      </span>
      {count !== undefined && <span className="text-muted text-xs">({count})</span>}
    </div>
  );
}
