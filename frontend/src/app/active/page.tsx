'use client';

import { useEffect, useState } from 'react';
import { listAuctions, deleteAuction, openWS, fmtEUR, type Auction } from '@/lib/api';
import AuctionRow from '@/components/AuctionRow';
import AddAuctionForm from '@/components/AddAuctionForm';
import StatCard from '@/components/StatCard';

export default function ActivePage() {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [, tick] = useState(0);

  async function reload() {
    const all = await listAuctions();
    setAuctions(all.filter(a => a.status !== 'ended'));
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

  async function onDelete(id: number) {
    if (!confirm('Remove this auction from the watchlist?')) return;
    await deleteAuction(id);
    await reload();
  }

  const totalCurrentBid = auctions
    .filter(a => a.current_bid != null)
    .reduce((s, a) => s + (a.current_bid ?? 0), 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl text-ink">Active auctions</h1>
        <p className="text-muted text-sm mt-1">
          Auctions still in progress. Each is re-checked 30 minutes after its listed end time.
        </p>
      </header>

      <section className="card p-5">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted mb-3">
          Add to watchlist
        </h2>
        <AddAuctionForm onAdded={reload} />
      </section>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Active count" value={String(auctions.length)} accent="accent" />
        <StatCard label="Total current bids" value={fmtEUR(totalCurrentBid)} hint="sum across all active" />
        <StatCard
          label="Soonest to end"
          value={
            auctions.length > 0
              ? new Date(auctions[0].end_at).toLocaleDateString('pt-PT')
              : '—'
          }
        />
      </section>

      <section>
        {auctions.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="font-display italic text-2xl text-muted">No active auctions.</p>
            <p className="text-muted text-sm mt-2">Paste an e-leiloes.pt URL above to start tracking.</p>
          </div>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {auctions.map(a => (
              <AuctionRow key={a.id} a={a} onDelete={onDelete} mode="active" />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
