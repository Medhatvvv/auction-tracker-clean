import cron from 'node-cron';
import {
  listActiveAuctions,
  updateAuction,
  recordBid,
  getAuction,
} from './db.js';
import { scrapeAuction } from './scraper.js';
import { broadcast } from './ws.js';

const POLL_INTERVAL_MS  = 30_000;             // 30 seconds
const POLL_WINDOW_MS    = 5  * 60 * 1000;     // start polling 5 min before end
const POST_END_GRACE_MS = 60 * 1000;          // poll once 1 min after listed end

// Map<auctionId, NodeJS.Timeout> for the polling intervals
const pollers = new Map();
// Map<auctionId, NodeJS.Timeout> for the "start polling at T-5" timers
const armers  = new Map();

// ---------------------------------------------------------------------------
// Per-auction polling
// ---------------------------------------------------------------------------

async function pollOnce(auctionId) {
  const a = getAuction(auctionId);
  if (!a) return stopPolling(auctionId);

  const previousBid   = a.current_bid;
  const previousEndAt = a.end_at;

  try {
    const data = await scrapeAuction(a.url);

    // Anti-snipe: if a new bid arrived in the final 5 minutes, ensure end_at
    // is at least 5 minutes from now. Use MAX(site's value, our extension)
    // so we never shorten and the site stays authoritative when it extends.
    let effectiveEndAt = data.end_at || previousEndAt;
    const fiveMin = 5 * 60 * 1000;
    if (data.current_bid && previousBid && data.current_bid > previousBid) {
      const currentEndMs = new Date(effectiveEndAt).getTime();
      const minEndMs = Date.now() + fiveMin;
      if (currentEndMs < minEndMs) {
        effectiveEndAt = new Date(minEndMs).toISOString();
        console.log(
          `[scheduler] auction ${auctionId}: late bid (${previousBid} → ${data.current_bid}), ` +
          `extending end_at to ${effectiveEndAt}`
        );
      }
    }

    const updated = updateAuction(auctionId, {
      current_bid:   data.current_bid,
      base_value:    data.base_value,
      opening_value: data.opening_value,
      minimum_value: data.minimum_value,
      end_at:        effectiveEndAt,
      title:         data.title,
      status:        'watching',
      last_error:    null,
    });
    recordBid(auctionId, data.current_bid, data.raw);
    broadcast({ type: 'bid_update', auction: updated });
  } catch (err) {
    console.error(`[poll ${auctionId}]`, err.message);
    updateAuction(auctionId, { last_error: err.message });
    broadcast({ type: 'poll_error', auctionId, error: err.message });
  }

  // Stop only when we're past end + grace AND we're confident no extension came in
  const fresh = getAuction(auctionId);
  if (fresh && new Date(fresh.end_at).getTime() + POST_END_GRACE_MS < Date.now()) {
    updateAuction(auctionId, { status: 'ended' });
    stopPolling(auctionId);
    broadcast({ type: 'auction_ended', auction: getAuction(auctionId) });
  }
}

function startPolling(auctionId) {
  if (pollers.has(auctionId)) return;
  console.log(`[scheduler] starting polling for auction ${auctionId}`);
  // Fire one immediately, then on an interval with small jitter
  pollOnce(auctionId);
  const handle = setInterval(() => {
    // 0-3s jitter to avoid being a perfectly periodic robot
    setTimeout(() => pollOnce(auctionId), Math.floor(Math.random() * 3000));
  }, POLL_INTERVAL_MS);
  pollers.set(auctionId, handle);
}

function stopPolling(auctionId) {
  const h = pollers.get(auctionId);
  if (h) {
    clearInterval(h);
    pollers.delete(auctionId);
    console.log(`[scheduler] stopped polling for auction ${auctionId}`);
  }
  const a = armers.get(auctionId);
  if (a) {
    clearTimeout(a);
    armers.delete(auctionId);
  }
}

// ---------------------------------------------------------------------------
// Arm one auction (decide whether to wait, poll now, or mark as ended)
// ---------------------------------------------------------------------------

export function armAuction(auctionId) {
  stopPolling(auctionId); // reset any existing armer

  const a = getAuction(auctionId);
  if (!a) return;
  const endMs = new Date(a.end_at).getTime();
  if (Number.isNaN(endMs)) return;

  const now = Date.now();
  const msUntilEnd    = endMs - now;
  const msUntilWindow = msUntilEnd - POLL_WINDOW_MS;

  if (endMs + POST_END_GRACE_MS < now) {
    // Already over
    updateAuction(auctionId, { status: 'ended' });
    return;
  }

  if (msUntilWindow <= 0) {
    // Already inside the 5-min window — start polling now
    startPolling(auctionId);
  } else {
    // Schedule a one-shot wakeup at T-5min
    console.log(
      `[scheduler] auction ${auctionId} armed; polling will start in ` +
      `${Math.round(msUntilWindow / 1000)}s`,
    );
    const handle = setTimeout(() => startPolling(auctionId), msUntilWindow);
    armers.set(auctionId, handle);
  }
}

export function disarmAuction(auctionId) {
  stopPolling(auctionId);
}

// ---------------------------------------------------------------------------
// Bootstrap on server start: re-arm every active auction
// ---------------------------------------------------------------------------

export function bootstrap() {
  const active = listActiveAuctions();
  console.log(`[scheduler] bootstrapping ${active.length} active auction(s)`);
  for (const a of active) armAuction(a.id);

  // Safety net: every minute, sweep the DB and re-arm anything that's slipped
  // through (e.g. a brand-new auction added by another process).
  cron.schedule('* * * * *', () => {
    const stillActive = listActiveAuctions();
    for (const a of stillActive) {
      if (!pollers.has(a.id) && !armers.has(a.id)) {
        armAuction(a.id);
      }
    }
  });
}
