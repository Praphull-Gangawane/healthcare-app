export function LoadingSkeleton({ lines = 3, label = 'Loading…', card = false }: { lines?: number; label?: string; card?: boolean }) {
  const body = (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="skeleton" style={{ width: `${95 - ((i * 17) % 40)}%` }} aria-hidden="true" />
      ))}
    </div>
  );
  return card ? <div className="card">{body}</div> : body;
}
