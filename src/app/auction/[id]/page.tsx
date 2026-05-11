'use client';

import { useEffect, useState } from 'react';
import {
  getAuction, snapshotUrl, openWS,
  fmtEUR, fmtCountdown, type AuctionDetail,
} from '@/lib/api';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

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
      if ((msg.type === 'bid_update' || msg.type === 'auction_ended') &&
          msg.auction?.id === id) {
        reload().catch(() => {});
      }
    });
    return () => { clearInterval(iv); close(); };
  }, [id]);

  if (!a) return <div className="text-muted font-display italic">Loading…</div>;

  const ended = a.status === 'ended' || new Date(a.end_at).getTime() < Date.now();
  const chartData = a.history
    .filter(p => p.current_bid != null)
    .map(p => ({ t: new Date(p.captured_at).getTime(), bid: p.current_bid! }));

  return (
    <div className="space-y-10">
      <a href="/" className="font-mono text-xs uppercase tracking-widest text-muted hover:text-accent">
        ← back
      </a>

      <header>
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent mb-2">
          {a.external_id}
        </div>
        <h1 className="font-display text-4xl text-ink leading-tight">{a.title || 'Untitled lot'}</h1>
        <a href={a.url} target="_blank" rel="noreferrer"
           className="inline-block mt-2 font-mono text-xs text-muted hover:text-accent break-all">
          {a.url} ↗
        </a>
      </header>

      {/* ───── Image gallery ───── */}
      {a.image_urls && a.image_urls.length > 0 && (
        <section className="card overflow-hidden">
          <div className="relative bg-slate-100 aspect-[4/3]">
            <img
              src={a.image_urls[activeImg]}
              alt=""
              className="w-full h-full object-contain"
            />
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

      {/* ───── Stat strip ───── */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Base"        value={fmtEUR(a.base_value)} />
        <Stat label="Opening"     value={fmtEUR(a.opening_value)} />
        <Stat label="Minimum"     value={fmtEUR(a.minimum_value)} />
        <Stat label="Current Bid" value={fmtEUR(a.current_bid)} accent />
        <Stat
          label={ended ? 'Ended at' : 'Ends in'}
          value={ended ? new Date(a.end_at).toLocaleString('pt-PT') : fmtCountdown(a.end_at)}
          live={!ended && a.status === 'watching'}
        />
      </section>

      {a.last_error && (
        <p className="font-mono text-xs text-warn border border-warn/30 bg-red-50 px-4 py-2 rounded">
          ⚠ Last poll error: {a.last_error}
        </p>
      )}

      {/* ───── Bid history chart ───── */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-2xl text-ink">Bid timeline</h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
            {chartData.length} reading{chartData.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="card h-72 p-2">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted italic font-display">
              No readings yet — polling begins 5 min before end time.
            </div>
          ) : (
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
                <CartesianGrid stroke="#e5e7eb" />
                <XAxis
                  dataKey="t" type="number" domain={['dataMin', 'dataMax']}
                  tickFormatter={(v) => new Date(v).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  stroke="#64748b"
                  style={{ fontFamily: 'JetBrains Mono', fontSize: 10 }}
                />
                <YAxis
                  tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                  stroke="#64748b"
                  style={{ fontFamily: 'JetBrains Mono', fontSize: 10 }}
                  domain={['dataMin - 1000', 'dataMax + 1000']}
                />
                <Tooltip
                  contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', fontFamily: 'JetBrains Mono', fontSize: 12 }}
                  labelFormatter={(v) => new Date(v as number).toLocaleString('pt-PT')}
                  formatter={(v) => [fmtEUR(v as number), 'Bid']}
                />
                <Line type="stepAfter" dataKey="bid" stroke="#059669" strokeWidth={2}
                      dot={{ r: 3, fill: '#059669' }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* ───── Snapshot ───── */}
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
  label, value, accent, live,
}: { label: string; value: string; accent?: boolean; live?: boolean }) {
  return (
    <div className="card p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted flex items-center gap-2">
        {live && <span className="live-dot inline-block w-1.5 h-1.5 rounded-full bg-positive" />}
        {label}
      </div>
      <div className={`mt-1 font-mono tabular text-lg ${accent ? 'text-positive font-semibold' : 'text-ink'}`}>
        {value}
      </div>
    </div>
  );
}
