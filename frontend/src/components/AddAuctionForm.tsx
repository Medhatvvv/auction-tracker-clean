'use client';

import { useState } from 'react';
import { addAuction } from '@/lib/api';

export default function AddAuctionForm({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await addAuction(url.trim());
      setUrl('');
      onAdded();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          type="url" required
          placeholder="https://e-leiloes.pt/evento/LO1466402026"
          value={url}
          onChange={e => setUrl(e.target.value)}
          className="flex-1 bg-surface border border-line rounded-md px-4 py-2.5
                     font-mono text-sm text-ink placeholder:text-muted
                     focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit" disabled={busy}
          className="rounded-md px-5 py-2.5 bg-accent text-white font-mono text-xs
                     uppercase tracking-[0.2em] disabled:opacity-40 hover:bg-indigo-700"
        >
          {busy ? 'Adding…' : 'Watch'}
        </button>
      </form>
      {error && <p className="mt-2 text-warn font-mono text-xs">⚠ {error}</p>}
    </div>
  );
}
