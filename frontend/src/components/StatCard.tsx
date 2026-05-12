export default function StatCard({
  label, value, hint, accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: 'positive' | 'warn' | 'accent';
}) {
  const valueColor =
    accent === 'positive' ? 'text-positive' :
    accent === 'warn'     ? 'text-warn' :
    accent === 'accent'   ? 'text-accent' :
    'text-ink';
  return (
    <div className="card p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
        {label}
      </div>
      <div className={`mt-1 font-mono tabular text-xl font-semibold ${valueColor}`}>
        {value}
      </div>
      {hint && (
        <div className="font-mono text-[10px] text-muted mt-0.5">{hint}</div>
      )}
    </div>
  );
}
