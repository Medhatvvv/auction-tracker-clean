import cron from 'node-cron';
import {
  listActiveAuctions, updateAuction, recordBid, getAuction,
} from './db.js';
import { scrapeAuction } from './scraper.js';
import { broadcast } from './ws.js';

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes between checks
const INITIAL_DELAY_MS  = 30 * 60 * 1000; // first check is 30 min AFTER listed end

const timers = new Map();

async function checkAuction(auctionId) {
  timers.delete(auctionId);

  const a = getAuction(auctionId);
  if (!a) return;
  if (a.status === 'ended') return;

  console.log(`[scheduler] checking auction ${auctionId} (${a.external_id || a.url})`);

  try {
    const data = await scrapeAuction(a.url);

    const updated = updateAuction(auctionId, {
      current_bid:   data.current_bid,
      base_value:    data.base_value,
      opening_value: data.opening_value,
      minimum_value: data.minimum_value,
      end_at:        data.end_at,
      title:         data.title,
      status:        data.has_ended ? 'ended' : 'watching',
      last_error:    null,
    });

    if (data.current_bid != null) {
      recordBid(auctionId, data.current_bid, data.raw);
    }

    if (data.has_ended) {
      console.log(`[scheduler] auction ${auctionId} CONFIRMED ENDED at ${data.current_bid}€`);
      broadcast({ type: 'auction_ended', auction: updated });
    } else {
      console.log(`[scheduler] auction ${auctionId} still active, next check in 30min`);
      broadcast({ type: 'bid_update', auction: updated });
      const handle = setTimeout(() => checkAuction(auctionId), CHECK_INTERVAL_MS);
      timers.set(auctionId, handle);
    }
  } catch (err) {
    console.error(`[check ${auctionId}]`, err.message);
    updateAuction(auctionId, { last_error: err.message });
    broadcast({ type: 'poll_error', auctionId, error: err.message });
    const handle = setTimeout(() => checkAuction(auctionId), CHECK_INTERVAL_MS);
    timers.set(auctionId, handle);
  }
}

export function armAuction(auctionId) {
  disarmAuction(auctionId);

  const a = getAuction(auctionId);
  if (!a) return;
  if (a.status === 'ended') return;

  const endMs = new Date(a.end_at).getTime();
  if (Number.isNaN(endMs)) return;

  const firstCheckAt = endMs + INITIAL_DELAY_MS;
  const msUntilFirstCheck = firstCheckAt - Date.now();

  if (msUntilFirstCheck <= 0) {
    console.log(`[scheduler] auction ${auctionId} past listed end + 30min, checking immediately`);
    checkAuction(auctionId);
  } else {
    const minutes = Math.round(msUntilFirstCheck / 60000);
    console.log(`[scheduler] auction ${auctionId} armed, first check in ${minutes}min`);
    const handle = setTimeout(() => checkAuction(auctionId), msUntilFirstCheck);
    timers.set(auctionId, handle);
  }
}

export function disarmAuction(auctionId) {
  const h = timers.get(auctionId);
  if (h) {
    clearTimeout(h);
    timers.delete(auctionId);
  }
}

export function bootstrap() {
  const active = listActiveAuctions();
  console.log(`[scheduler] bootstrapping ${active.length} active auction(s)`);
  for (const a of active) armAuction(a.id);

  cron.schedule('*/5 * * * *', () => {
    const stillActive = listActiveAuctions();
    for (const a of stillActive) {
      if (!timers.has(a.id)) armAuction(a.id);
    }
  });
}
