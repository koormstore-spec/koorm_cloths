export default function Loader({ full }) {
  return (
    <div className={full ? 'flex items-center justify-center min-h-[60vh]' : 'flex items-center justify-center py-10'}>
      <div className="h-8 w-8 border-2 border-ink border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
