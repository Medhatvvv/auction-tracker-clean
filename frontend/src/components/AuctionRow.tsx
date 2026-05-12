'use client';

import { fmtEUR, fmtCountdown, type Auction } from '@/lib/api';

export default function AuctionRow({
  a, onDelete, mode,
}: {
  a: Auction;
  onDelete: (id: number) => void;
  mode: 'active' | 'ended';
}) {
  const thumb = a.image_urls?.[0];
  const ended = mode === 'ended';

  // Premium % = (current_bid - minimum_value) / minimum_value
  const premium =
    a.current_bid != null && a.minimum_value != null && a.minimum_value > 0
      ? ((a.current_bid - a.minimum_value) / a.minimum_value) * 100
      : null;

  return (
    <li className="grid grid-cols-12 gap-3 px-5 py-3 items-center hover:bg-slate-50 transition-colors">
      <a href={`/auction/${a.id}`} className="col-span-4 flex items-center gap-3 min-w-0">
        {thumb ? (
          <img src={thumb} alt="" className="w-12 h-12 object-cover rounded border border-line flex-shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded bg-slate-100 border border-line flex-shrink-0" />
        )}
        <div className="min-w-0">
          <div className="font-display text-base leading-tight truncate text-ink hover:text-accent">
            {a.title || a.external_id || a.url}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted mt-0.5">
            {a.external_id}
          </div>
        </div>
      </a>

      <div className="col-span-2 text-right">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted">
          {ended ? 'Final bid' : 'Current bid'}
        </div>
        <div className="font-mono tabular text-base text-positive font-semibold">
          {fmtEUR(a.current_bid)}
        </div>
      </div>

      <div className="col-span-2 text-right">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted">Min</div>
        <div className="font-mono tabular text-sm text-muted">{fmtEUR(a.minimum_value)}</div>
      </div>

      <div className="col-span-2 text-right">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted">vs Min</div>
        {premium != null ? (
          <div className={`font-mono tabular text-sm font-semibold
            ${premium >= 0 ? 'text-positive' : 'text-warn'}`}>
            {premium >= 0 ? '+' : ''}{premium.toFixed(1)}%
          </div>
        ) : (
          <div className="font-mono tabular text-sm text-muted">—</div>
        )}
      </div>

      <div className="col-span-1 text-right">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted">
          {ended ? 'Ended' : 'Ends'}
        </div>
        <div className="font-mono tabular text-xs text-ink">
          {ended
            ? new Date(a.end_at).toLocaleDateString('pt-PT')
            : fmtCountdown(a.end_at)}
        </div>
      </div>

      <div className="col-span-1 text-right">
        <button
          onClick={() => onDelete(a.id)}
          aria-label="Remove"
          className="text-muted hover:text-warn px-2 py-1 font-mono text-lg"
        >
          ×
        </button>
      </div>
    </li>
  );
}
