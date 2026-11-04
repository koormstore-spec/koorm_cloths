export default function SkeletonGrid({ count = 8, cols = 'grid-cols-2 md:grid-cols-4' }) {
  return (
    <div aria-hidden="true" className={`grid ${cols} gap-x-4 gap-y-9 md:gap-x-6`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <div className="skeleton aspect-[3/4] mb-3" />
          <div className="skeleton h-3 w-1/3 mb-2" />
          <div className="skeleton h-4 w-3/4 mb-2" />
          <div className="skeleton h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}
