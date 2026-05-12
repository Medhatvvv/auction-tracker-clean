'use client';

import { useEffect, useState } from 'react';
import { listAuctions, deleteAuction, openWS, fmtEUR, type Auction } from '@/lib/api';
import AuctionRow from '@/components/AuctionRow';
import StatCard from '@/components/StatCard';

export default function EndedPage() {
  const [auctions, setAuctions] = useState<Auction[]>([]);

  async function reload() {
    const all = await listAuctions();
    setAuctions(
      all
        .filter(a => a.status === 'ended')
        .sort((a, b) => new Date(b.end_at).getTime() - new Date(a.end_at).getTime())
    );
  }
  useEffect(() => {
    reload().catch(console.error);
    const close = openWS((msg) => {
      if (msg.type === 'auction_ended' || msg.type === 'bid_update') {
        reload().catch(console.error);
      }
    });
    return close;
  }, []);

  async function onDelete(id: number) {
    if (!confirm('Remove this auction from the watchlist?')) return;
    await deleteAuction(id);
    await reload();
  }

  // Stats
  const samples = auctions.filter(a => a.minimum_value && a.current_bid);

  const totalMin = samples.reduce((s, a) => s + (a.minimum_value ?? 0), 0);
  const totalBid = samples.reduce((s, a) => s + (a.current_bid ?? 0), 0);
  const overallPremium = totalMin > 0 ? ((totalBid - totalMin) / totalMin) * 100 : null;

  const avgPremium = samples.length > 0
    ? samples.reduce(
        (s, a) => s + ((a.current_bid! - a.minimum_value!) / a.minimum_value!) * 100,
        0
      ) / samples.length
    : null;

  const highestBid = samples.length > 0
    ? Math.max(...samples.map(a => a.current_bid!))
    : null;
  const biggestPremium = samples.length > 0
    ? Math.max(
        ...samples.map(a => ((a.current_bid! - a.minimum_value!) / a.minimum_value!) * 100)
      )
    : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl text-ink">Ended auctions</h1>
        <p className="text-muted text-sm mt-1">
          Auctions confirmed completed. The Final bid is the price the auction closed at.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Ended count" value={String(auctions.length)} />
        <StatCard
          label="Sum of final bids"
          value={fmtEUR(totalBid)}
          hint={`vs ${fmtEUR(totalMin)} min`}
        />
        <StatCard
          label="Avg premium over min"
          value={avgPremium != null ? `${avgPremium >= 0 ? '+' : ''}${avgPremium.toFixed(1)}%` : '—'}
          accent={avgPremium != null && avgPremium >= 0 ? 'positive' : 'warn'}
          hint={`overall ${overallPremium != null ? `${overallPremium >= 0 ? '+' : ''}${overallPremium.toFixed(1)}%` : '—'}`}
        />
        <StatCard
          label="Highest final bid"
          value={highestBid != null ? fmtEUR(highestBid) : '—'}
          hint={biggestPremium != null ? `top premium +${biggestPremium.toFixed(1)}%` : undefined}
          accent="positive"
        />
      </section>

      <section>
        {auctions.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="font-display italic text-2xl text-muted">No ended auctions yet.</p>
            <p className="text-muted text-sm mt-2">
              Once an auction is confirmed ended, it&apos;ll appear here with the final bid.
            </p>
          </div>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {auctions.map(a => (
              <AuctionRow key={a.id} a={a} onDelete={onDelete} mode="ended" />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
