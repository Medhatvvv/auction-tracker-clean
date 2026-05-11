// IMPORTANT: replace this URL with your own backend URL after deploying.
const BACKEND_URL = 'https://backend-production-fe31.up.railway.app';

export type Auction = {
  id: number;
  url: string;
  external_id: string | null;
  title: string | null;
  base_value: number | null;
  opening_value: number | null;
  minimum_value: number | null;
  current_bid: number | null;
  end_at: string;
  status: 'pending' | 'watching' | 'ended' | 'error';
  created_at: string;
  updated_at: string;
  last_error: string | null;
  image_urls: string[];
};

export type BidPoint = { current_bid: number | null; captured_at: string };
export type AuctionDetail = Auction & { history: BidPoint[] };

const API = `${BACKEND_URL}/api`;

export async function listAuctions(): Promise<Auction[]> {
  const res = await fetch(`${API}/auctions`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load watchlist');
  return res.json();
}

export async function addAuction(url: string): Promise<Auction> {
  const res = await fetch(`${API}/auctions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.formErrors?.[0] || err.error || 'Failed to add auction');
  }
  return res.json();
}

export async function getAuction(id: number): Promise<AuctionDetail> {
  const res = await fetch(`${API}/auctions/${id}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Not found');
  return res.json();
}

export async function deleteAuction(id: number): Promise<void> {
  const res = await fetch(`${API}/auctions/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error('Failed to delete');
}

export function snapshotUrl(id: number, asset: 'page.html' | 'page.png' | 'page.pdf') {
  return `${API}/auctions/${id}/snapshot/${asset}`;
}

export function openWS(onMessage: (msg: any) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const wsUrl = BACKEND_URL.replace(/^http/, 'ws') + '/ws';
  const ws = new WebSocket(wsUrl);
  ws.onmessage = (ev) => {
    try { onMessage(JSON.parse(ev.data)); } catch {}
  };
  return () => ws.close();
}

export function fmtEUR(v: number | null | undefined): string {
  if (v == null) return '—';
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 2,
  }).format(v);
}

export function fmtCountdown(endAt: string): string {
  const ms = new Date(endAt).getTime() - Date.now();
  if (ms <= 0) return 'ended';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}
