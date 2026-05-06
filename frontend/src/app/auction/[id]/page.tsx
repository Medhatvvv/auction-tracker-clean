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
  const [, tick] = useState(0);

  async function reload() {
    setA(await getAuction(id));
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

  if (!a) return <div className="text-white/40 font-display italic">Loading…</div>;

  const ended = a.status === 'ended' || new Date(a.end_at).getTime() < Date.now();
  const chartData = a.history
    .filter(p => p.current_bid != null)
    .map(p => ({
      t: new Date(p.captured_at).getTime(),
      bid: p.current_bid!,
    }));

  return (
    <div className="space-y-10">
      <a href="/" className="font-mono text-xs uppercase tracking-widest text-white/40 hover:text-accent">
        ← back
      </a>

      <header>
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent mb-2">
          {a.external_id}
        </div>
        <h1 className="font-display text-4xl leading-tight">{a.title || 'Untitled lot'}</h1>
        <a href={a.url} target="_blank" rel="noreferrer"
           className="inline-block mt-2 font-mono text-xs text-white/40 hover:text-accent break-all">
          {a.url} ↗
        </a>
      </header>

      {/* ───── Stat strip ───── */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-px bg-white/10 border border-white/10">
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
        <p className="font-mono text-xs text-warn border border-warn/40 px-4 py-2">
          ⚠ Last poll error: {a.last_error}
        </p>
      )}

      {/* ───── Bid history chart ───── */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-2xl">Bid timeline</h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">
            {chartData.length} reading{chartData.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="h-72 border border-white/10 bg-black/40 p-2">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-white/30 italic font-display">
              No readings yet — polling begins 5 min before end time.
            </div>
          ) : (
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(v) => new Date(v).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  stroke="rgba(255,255,255,0.4)"
                  style={{ fontFamily: 'JetBrains Mono', fontSize: 10 }}
                />
                <YAxis
                  tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                  stroke="rgba(255,255,255,0.4)"
                  style={{ fontFamily: 'JetBrains Mono', fontSize: 10 }}
                  domain={['dataMin - 1000', 'dataMax + 1000']}
                />
                <Tooltip
                  contentStyle={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.2)', fontFamily: 'JetBrains Mono', fontSize: 12 }}
                  labelFormatter={(v) => new Date(v as number).toLocaleString('pt-PT')}
                  formatter={(v) => [fmtEUR(v as number), 'Bid']}
                />
                <Line
                  type="stepAfter" dataKey="bid"
                  stroke="#00ff9d" strokeWidth={2}
                  dot={{ r: 3, fill: '#00ff9d' }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* ───── Snapshot ───── */}
      <section>
        <h2 className="font-display text-2xl mb-3">Original snapshot</h2>
        <p className="text-white/50 text-sm mb-4">
          Captured the moment you added this auction.
        </p>
        <div className="flex flex-wrap gap-3 font-mono text-xs">
          <a href={snapshotUrl(a.id, 'page.png')} target="_blank" rel="noreferrer"
             className="px-4 py-2 border border-white/15 hover:border-accent hover:text-accent">
            screenshot ↗
          </a>
          <a href={snapshotUrl(a.id, 'page.html')} target="_blank" rel="noreferrer"
             className="px-4 py-2 border border-white/15 hover:border-accent hover:text-accent">
            html ↗
          </a>
          <a href={snapshotUrl(a.id, 'page.pdf')} target="_blank" rel="noreferrer"
             className="px-4 py-2 border border-white/15 hover:border-accent hover:text-accent">
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
    <div className="bg-ink p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-white/40 flex items-center gap-2">
        {live && <span className="live-dot inline-block w-1.5 h-1.5 rounded-full bg-accent" />}
        {label}
      </div>
      <div className={`mt-1 font-mono tabular text-lg ${accent ? 'text-accent' : ''}`}>
        {value}
      </div>
    </div>
  );
}
