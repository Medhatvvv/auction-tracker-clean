'use client';

import { useEffect, useState } from 'react';
import { listAuctions, openWS, fmtEUR, type Auction } from '@/lib/api';
import AddAuctionForm from '@/components/AddAuctionForm';
import StatCard from '@/components/StatCard';

export default function Dashboard() {
  const [auctions, setAuctions] = useState<Auction[]>([]);

  async function reload() {
    setAuctions(await listAuctions());
  }
  useEffect(() => {
    reload().catch(console.error);
    const close = openWS((msg) => {
      if (msg.type === 'bid_update' || msg.type === 'auction_ended') {
        reload().catch(console.error);
      }
    });
    return close;
  }, []);

  // Stats
  const active = auctions.filter(a => a.status !== 'ended');
  const ended  = auctions.filter(a => a.status === 'ended');

  const totalMinValue = ended
    .filter(a => a.minimum_value != null)
    .reduce((sum, a) => sum + (a.minimum_value ?? 0), 0);
  const totalFinalBid = ended
    .filter(a => a.current_bid != null)
    .reduce((sum, a) => sum + (a.current_bid ?? 0), 0);

  const avgPremium = (() => {
    const samples = ended.filter(a => a.minimum_value && a.current_bid);
    if (samples.length === 0) return null;
    const sum = samples.reduce(
      (s, a) => s + ((a.current_bid! - a.minimum_value!) / a.minimum_value!) * 100,
      0
    );
    return sum / samples.length;
  })();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl text-ink">Dashboard</h1>
        <p className="text-muted text-sm mt-1">
          Overview of every auction you&apos;re watching. Checks run 30 minutes after each listed end time.
        </p>
      </header>

      <section className="card p-5">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted mb-3">
          Add to watchlist
        </h2>
        <AddAuctionForm onAdded={reload} />
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Active" value={String(active.length)} hint="being watched" accent="accent" />
        <StatCard label="Ended"  value={String(ended.length)}  hint="confirmed completed" />
        <StatCard
          label="Avg premium over min"
          value={avgPremium != null ? `${avgPremium >= 0 ? '+' : ''}${avgPremium.toFixed(1)}%` : '—'}
          hint="ended auctions"
          accent={avgPremium != null && avgPremium >= 0 ? 'positive' : 'warn'}
        />
        <StatCard
          label="Total final vs min"
          value={
            totalFinalBid > 0
              ? `${fmtEUR(totalFinalBid)} / ${fmtEUR(totalMinValue)}`
              : '—'
          }
          hint="ended auctions, sum"
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <RecentList title="Recently added (active)" items={active.slice(0, 5)} mode="active" />
        <RecentList title="Recently ended" items={ended.slice(0, 5)} mode="ended" />
      </section>
    </div>
  );
}

function RecentList({
  title, items, mode,
}: {
  title: string;
  items: Auction[];
  mode: 'active' | 'ended';
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted">{title}</h3>
        <a href={`/${mode}`} className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline">
          view all →
        </a>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-muted italic font-display text-sm text-center">
          Nothing here yet.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map(a => (
            <li key={a.id} className="px-4 py-2.5">
              <a href={`/auction/${a.id}`} className="flex items-center gap-2.5 hover:text-accent">
                {a.image_urls?.[0] ? (
                  <img src={a.image_urls[0]} alt="" className="w-9 h-9 object-cover rounded border border-line" />
                ) : (
                  <div className="w-9 h-9 rounded bg-slate-100 border border-line" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-display text-sm leading-tight truncate text-ink">
                    {a.title || a.external_id}
                  </div>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-muted">
                    {a.external_id}
                  </div>
                </div>
                <div className="font-mono tabular text-sm text-positive font-semibold flex-shrink-0">
                  {fmtEUR(a.current_bid)}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
