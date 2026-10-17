export default function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-200/60" />
      ))}
    </div>
  );
}
