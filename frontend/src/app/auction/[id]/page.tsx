'use client';

import { useEffect, useState } from 'react';
import {
  getAuction, snapshotUrl, openWS,
  fmtEUR, fmtCountdown, type AuctionDetail,
} from '@/lib/api';

export default function AuctionPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const [a, setA] = useState<AuctionDetail | null>(null);
  const [activeImg, setActiveImg] = useState(0);
  const [, tick] = useState(0);

  async function reload() {
    const fresh = await getAuction(id);
    setA(fresh);
  }
  useEffect(() => {
    reload().catch(() => {});
    const iv = setInterval(() => tick(t => t + 1), 1000);
    const close = openWS((msg) => {
      if ((msg.type === 'bid_update' || msg.type === 'auction_ended') && msg.auction?.id === id) {
        reload().catch(() => {});
      }
    });
    return () => { clearInterval(iv); close(); };
  }, [id]);

  if (!a) return <div className="text-muted font-display italic">Loading…</div>;

  const ended = a.status === 'ended';
  const premium =
    a.current_bid != null && a.minimum_value != null && a.minimum_value > 0
      ? ((a.current_bid - a.minimum_value) / a.minimum_value) * 100
      : null;

  return (
    <div className="space-y-8">
      <a href="/active" className="font-mono text-xs uppercase tracking-widest text-muted hover:text-accent">
        ← back
      </a>

      <header>
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent mb-2">
          {a.external_id} {ended && '· ENDED'}
        </div>
        <h1 className="font-display text-4xl text-ink leading-tight">{a.title || 'Untitled lot'}</h1>
        <a href={a.url} target="_blank" rel="noreferrer"
           className="inline-block mt-2 font-mono text-xs text-muted hover:text-accent break-all">
          {a.url} ↗
        </a>
      </header>

      {a.image_urls && a.image_urls.length > 0 && (
        <section className="card overflow-hidden">
          <div className="relative bg-slate-100 aspect-[4/3]">
            <img src={a.image_urls[activeImg]} alt="" className="w-full h-full object-contain" />
            <div className="absolute top-3 right-3 bg-ink/80 text-white font-mono text-[10px] px-2 py-1 rounded">
              {activeImg + 1} / {a.image_urls.length}
            </div>
            {activeImg > 0 && (
              <button
                onClick={() => setActiveImg(i => i - 1)}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full
                           bg-white/90 hover:bg-white border border-line shadow-sm text-ink"
                aria-label="Previous"
              >‹</button>
            )}
            {activeImg < a.image_urls.length - 1 && (
              <button
                onClick={() => setActiveImg(i => i + 1)}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full
                           bg-white/90 hover:bg-white border border-line shadow-sm text-ink"
                aria-label="Next"
              >›</button>
            )}
          </div>
          {a.image_urls.length > 1 && (
            <div className="flex gap-2 overflow-x-auto p-3 border-t border-line">
              {a.image_urls.map((u, i) => (
                <button
                  key={u}
                  onClick={() => setActiveImg(i)}
                  className={`flex-shrink-0 w-16 h-16 overflow-hidden rounded border-2 transition-all
                              ${i === activeImg ? 'border-accent' : 'border-line opacity-60 hover:opacity-100'}`}
                >
                  <img src={u} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Stat label="Base"        value={fmtEUR(a.base_value)} />
        <Stat label="Opening"     value={fmtEUR(a.opening_value)} />
        <Stat label="Minimum"     value={fmtEUR(a.minimum_value)} />
        <Stat
          label={ended ? 'Final bid' : 'Current bid'}
          value={fmtEUR(a.current_bid)}
          accent
        />
        <Stat
          label="vs Minimum"
          value={premium != null
            ? `${premium >= 0 ? '+' : ''}${premium.toFixed(1)}%`
            : '—'}
          accent
        />
        <Stat
          label={ended ? 'Ended at' : 'Ends'}
          value={ended
            ? new Date(a.end_at).toLocaleString('pt-PT')
            : fmtCountdown(a.end_at)}
        />
      </section>

      {a.last_error && (
        <p className="font-mono text-xs text-warn border border-warn/30 bg-red-50 px-4 py-2 rounded">
          ⚠ Last poll error: {a.last_error}
        </p>
      )}

      <section>
        <h2 className="font-display text-2xl text-ink mb-3">Original snapshot</h2>
        <p className="text-muted text-sm mb-4">
          Captured the moment you added this auction.
        </p>
        <div className="flex flex-wrap gap-3 font-mono text-xs">
          <a href={snapshotUrl(a.id, 'page.png')} target="_blank" rel="noreferrer"
             className="px-4 py-2 bg-surface border border-line rounded hover:border-accent hover:text-accent">
            screenshot ↗
          </a>
          <a href={snapshotUrl(a.id, 'page.html')} target="_blank" rel="noreferrer"
             className="px-4 py-2 bg-surface border border-line rounded hover:border-accent hover:text-accent">
            html ↗
          </a>
          <a href={snapshotUrl(a.id, 'page.pdf')} target="_blank" rel="noreferrer"
             className="px-4 py-2 bg-surface border border-line rounded hover:border-accent hover:text-accent">
            pdf ↗
          </a>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label, value, accent,
}: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card p-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`mt-1 font-mono tabular text-base ${accent ? 'text-positive font-semibold' : 'text-ink'}`}>
        {value}
      </div>
    </div>
  );
}
