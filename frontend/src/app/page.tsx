'use client';

import { useEffect, useState } from 'react';
import {
  listAuctions, addAuction, deleteAuction, openWS,
  fmtEUR, fmtCountdown, type Auction,
} from '@/lib/api';

export default function HomePage() {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);

  async function reload() {
    setAuctions(await listAuctions());
  }

  useEffect(() => {
    reload().catch(console.error);
    const iv = setInterval(() => tick(t => t + 1), 1000);
    const close = openWS((msg) => {
      if (msg.type === 'bid_update' || msg.type === 'auction_ended') {
        reload().catch(console.error);
      }
    });
    return () => { clearInterval(iv); close(); };
  }, []);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await addAuction(url.trim());
      setUrl('');
      await reload();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: number) {
    if (!confirm('Remove this auction from the watchlist?')) return;
    await deleteAuction(id);
    await reload();
  }

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-4xl text-ink mb-1">Watchlist</h1>
        <p className="text-muted text-sm mb-6">
          Paste an e-leiloes.pt event URL. We&apos;ll snapshot the page now and
          start polling every 30s during the final 5 minutes.
        </p>
        <form onSubmit={onAdd} className="flex gap-2">
          <input
            type="url" required
            placeholder="https://e-leiloes.pt/evento/LO1466402026"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 bg-surface border border-line rounded-md px-4 py-3
                       font-mono text-sm text-ink placeholder:text-muted
                       focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <button
            type="submit" disabled={busy}
            className="rounded-md px-6 py-3 bg-accent text-white font-mono text-xs
                       uppercase tracking-[0.2em] disabled:opacity-40 hover:bg-indigo-700"
          >
            {busy ? 'Adding…' : 'Add'}
          </button>
        </form>
        {error && <p className="mt-3 text-warn font-mono text-xs">⚠ {error}</p>}
      </section>

      <section>
        {auctions.length === 0 ? (
          <div className="card p-16 text-center">
            <p className="font-display italic text-2xl text-muted">Nothing watched yet.</p>
          </div>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {auctions.map((a) => <Row key={a.id} a={a} onDelete={onDelete} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ a, onDelete }: { a: Auction; onDelete: (id: number) => void }) {
  const ended = a.status === 'ended' || new Date(a.end_at).getTime() < Date.now();
  const watching = a.status === 'watching' && !ended;
  const thumb = a.image_urls?.[0];

  return (
    <li className="grid grid-cols-12 gap-4 px-5 py-4 items-center hover:bg-slate-50 transition-colors">
      <a href={`/auction/${a.id}`} className="col-span-5 flex items-center gap-3 min-w-0">
        {thumb ? (
          <img src={thumb} alt="" className="w-14 h-14 object-cover rounded border border-line flex-shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded bg-slate-100 border border-line flex-shrink-0" />
        )}
        <div className="min-w-0">
          <div className="font-display text-lg leading-tight truncate text-ink hover:text-accent">
            {a.title || a.external_id || a.url}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted mt-0.5">
            {a.external_id}
          </div>
        </div>
      </a>

      <div className="col-span-2 text-right">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted">Bid</div>
        <div className="font-mono tabular text-lg text-positive">{fmtEUR(a.current_bid)}</div>
      </div>

      <div className="col-span-2 text-right">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted">Min</div>
        <div className="font-mono tabular text-sm text-muted">{fmtEUR(a.minimum_value)}</div>
      </div>

      <div className="col-span-2 text-right">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted flex items-center justify-end gap-2">
          {watching && <span className="live-dot inline-block w-1.5 h-1.5 rounded-full bg-positive" />}
          {ended ? 'Ended' : 'Ends in'}
        </div>
        <div className={`font-mono tabular text-sm ${ended ? 'text-muted' : 'text-ink'}`}>
          {ended ? new Date(a.end_at).toLocaleString('pt-PT') : fmtCountdown(a.end_at)}
        </div>
      </div>

      <div className="col-span-1 text-right">
        <button
          onClick={() => onDelete(a.id)}
          aria-label="Remove"
          className="text-muted hover:text-warn px-2 py-1 font-mono text-base"
        >
          ×
        </button>
      </div>
    </li>
  );
}
