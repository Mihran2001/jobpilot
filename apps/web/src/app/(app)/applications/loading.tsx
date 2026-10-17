export default function Loading() {
  return (
    <div className="grid gap-4 md:grid-cols-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="h-64 animate-pulse rounded-lg bg-slate-200/60" />
      ))}
    </div>
  );
}
