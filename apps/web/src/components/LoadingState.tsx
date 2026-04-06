export default function LoadingState() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="data-card animate-pulse">
          <div className="h-4 bg-muted rounded w-1/3 mb-2" />
          <div className="h-3 bg-muted rounded w-2/3" />
        </div>
      ))}
    </div>
  );
}
