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
    // 1Hz tick for the countdowns
    const iv = setInterval(() => tick(t => t + 1), 1000);
    // WebSocket live updates
    const close = openWS((msg) => {
      if (msg.type === 'bid_update' || msg.type === 'auction_ended') {
        reload().catch(console.error);
      }
    });
    return () => { clearInterval(iv); close(); };
  }, []);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
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
      {/* ───────── Add form ───────── */}
      <section>
        <h1 className="font-display text-4xl mb-1">Watchlist</h1>
        <p className="text-white/50 text-sm mb-6">
          Paste an e-leiloes.pt event URL. We&apos;ll snapshot the page now and start
          polling every 30s during the final 5 minutes.
        </p>
        <form onSubmit={onAdd} className="flex gap-2">
          <input
            type="url"
            required
            placeholder="https://e-leiloes.pt/evento/LO1466402026"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 bg-black border border-white/15 px-4 py-3 font-mono text-sm
                       focus:outline-none focus:border-accent placeholder:text-white/30"
          />
          <button
            type="submit"
            disabled={busy}
            className="px-6 py-3 bg-accent text-black font-mono text-xs uppercase
                       tracking-[0.2em] disabled:opacity-40"
          >
            {busy ? 'Adding…' : 'Add'}
          </button>
        </form>
        {error && (
          <p className="mt-3 text-warn font-mono text-xs">⚠ {error}</p>
        )}
      </section>

      {/* ───────── Watchlist table ───────── */}
      <section>
        {auctions.length === 0 ? (
          <p className="text-white/40 italic font-display text-xl py-12 text-center
                        border border-dashed border-white/10">
            Nothing watched yet.
          </p>
        ) : (
          <ul className="divide-y divide-white/10 border-t border-b border-white/10">
            {auctions.map((a) => <Row key={a.id} a={a} onDelete={onDelete} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ a, onDelete }: { a: Auction; onDelete: (id: number) => void }) {
  const ended = a.status === 'ended' ||
    new Date(a.end_at).getTime() < Date.now();
  const watching = a.status === 'watching' && !ended;

  return (
    <li className="grid grid-cols-12 gap-4 py-5 items-center">
      <div className="col-span-5">
        <a href={`/auction/${a.id}`} className="hover:text-accent">
          <div className="font-display text-lg leading-tight line-clamp-1">
            {a.title || a.external_id || a.url}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-white/40 mt-1">
            {a.external_id}
          </div>
        </a>
      </div>

      <div className="col-span-2 text-right">
        <div className="text-[10px] font-mono uppercase tracking-widest text-white/40">Bid</div>
        <div className="font-mono tabular text-lg">{fmtEUR(a.current_bid)}</div>
      </div>

      <div className="col-span-2 text-right">
        <div className="text-[10px] font-mono uppercase tracking-widest text-white/40">Min</div>
        <div className="font-mono tabular text-sm text-white/70">{fmtEUR(a.minimum_value)}</div>
      </div>

      <div className="col-span-2 text-right">
        <div className="text-[10px] font-mono uppercase tracking-widest text-white/40 flex items-center justify-end gap-2">
          {watching && <span className="live-dot inline-block w-1.5 h-1.5 rounded-full bg-accent" />}
          {ended ? 'Ended' : 'Ends in'}
        </div>
        <div className={`font-mono tabular text-sm ${ended ? 'text-white/40' : 'text-accent'}`}>
          {ended ? new Date(a.end_at).toLocaleString('pt-PT') : fmtCountdown(a.end_at)}
        </div>
      </div>

      <div className="col-span-1 text-right">
        <button
          onClick={() => onDelete(a.id)}
          aria-label="Remove"
          className="text-white/30 hover:text-warn px-2 py-1 font-mono text-xs"
        >
          ×
        </button>
      </div>
    </li>
  );
}
