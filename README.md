# e-leiloes.pt Auction Tracker

A web app that watches auction items on https://e-leiloes.pt and polls the bid information aggressively in the final minutes before each auction ends.

## What it does

1. You paste an auction URL (e.g. `https://e-leiloes.pt/evento/LO1466402026`).
2. The app immediately:
   - Fetches the page once to extract Base Value, Opening Value, Minimum Value, Current Bid, and the End Time.
   - Saves a **full HTML snapshot + screenshot + PDF** of the page so you can return to the original state later.
3. A scheduler watches the end time. **Starting 5 minutes before the auction ends**, it re-fetches the page **every 30 seconds** until the auction is over.
4. Every reading is stored as a `BidSnapshot` row, so you get a full timeline of how the bid moved during the final minutes.
5. The frontend shows the live state, the bid history chart, and lets you download the original snapshot.

## Architecture

```
┌──────────────────────────┐         ┌─────────────────────────────┐
│  Next.js frontend        │ ──HTTP──▶  Node.js / Express API      │
│  (React + Tailwind)      │ ◀──WS───│  - REST endpoints            │
│                          │         │  - WebSocket push (live bids)│
└──────────────────────────┘         └─────────────────────────────┘
                                                │
                                                │
                       ┌────────────────────────┼────────────────────────┐
                       ▼                        ▼                        ▼
              ┌────────────────┐       ┌────────────────┐       ┌──────────────────┐
              │  SQLite DB     │       │  Snapshots dir │       │  Scheduler       │
              │  - auctions    │       │  - {id}.html   │       │  (node-cron      │
              │  - bid_snapshots│      │  - {id}.png    │       │   + per-auction  │
              │                │       │  - {id}.pdf    │       │   timers)        │
              └────────────────┘       └────────────────┘       └──────────────────┘
                                                                         │
                                                                         ▼
                                                                ┌──────────────────┐
                                                                │  Playwright      │
                                                                │  (real browser   │
                                                                │   scraper)       │
                                                                └──────────────────┘
                                                                         │
                                                                         ▼
                                                                  e-leiloes.pt
```

### Why these choices

- **Playwright (not plain HTTP)**: e-leiloes.pt is a JavaScript-rendered .NET site with anti-bot measures. A real headless browser is the only reliable option, and it also gives us free PDF + screenshot capture for the initial snapshot.
- **SQLite**: zero-config, file-on-disk, perfect for a single-user tracker. Swap to Postgres later if needed by changing one connection string.
- **node-cron + per-auction `setTimeout`**: instead of polling every auction every 30s (wasteful), each auction schedules its own polling window. A "supervisor" cron runs once a minute to spin up timers for any auction whose 5-minute window has just opened.
- **WebSocket**: pushes new bid snapshots to the frontend instantly so you don't have to refresh.
- **Next.js**: single deploy artifact for the frontend, easy SSR if you want to expose a public read-only view later.

## Project layout

```
auction-tracker/
├── backend/
│   ├── src/
│   │   ├── index.js          # Express + WS bootstrap
│   │   ├── db.js             # SQLite schema + queries
│   │   ├── scraper.js        # Playwright scraping logic
│   │   ├── scheduler.js      # Polling window manager
│   │   ├── routes.js         # REST endpoints
│   │   └── ws.js             # WebSocket broadcaster
│   ├── snapshots/            # Persisted .html / .png / .pdf per auction
│   ├── data.db               # SQLite file
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx      # Watchlist
│   │   │   ├── auction/[id]/page.tsx  # Detail + chart
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── AddAuctionForm.tsx
│   │   │   ├── AuctionCard.tsx
│   │   │   └── BidChart.tsx
│   │   └── lib/api.ts
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## Local setup

```bash
# Backend
cd backend
npm install
npx playwright install chromium --with-deps
npm run dev          # http://localhost:4000

# Frontend (in a second terminal)
cd frontend
npm install
npm run dev          # http://localhost:3000
```

Or just:

```bash
docker compose up --build
```

## Deployment recommendation

**Recommended: Railway** (or Fly.io as a close second).

Why not Vercel/Netlify alone? They are serverless — your scheduler can't keep `setTimeout` alive between requests, and you can't run Playwright headless Chromium reliably in their function runtimes.

You need a host that gives you:

1. A long-running Node process (for the scheduler + WebSocket).
2. A persistent disk (for `data.db` and `snapshots/`).
3. Enough memory to run headless Chromium (~1 GB).

| Platform | Long-running | Persistent disk | Playwright support | Free tier | Notes |
|---|---|---|---|---|---|
| **Railway** | ✅ | ✅ (volumes) | ✅ | $5/month trial credit | Easiest. One repo, two services (frontend + backend). |
| **Fly.io** | ✅ | ✅ (volumes) | ✅ | Generous free tier | Best price/perf, slightly more config (fly.toml). |
| **Render** | ✅ | ✅ (disks, paid only) | ✅ | Web Service free, but disks need paid plan | Simple if you're already there. |
| **DigitalOcean App Platform** | ✅ | ⚠️ (need separate Spaces or DB) | ✅ | $5/month minimum | Fine, more manual. |
| **Vercel / Netlify** | ❌ | ❌ | ❌ | — | Don't use for backend. Frontend only. |

**Suggested split**:
- Frontend → **Vercel** (free, auto-deploys from git).
- Backend → **Railway** with a 1 GB volume mounted at `/app/data` (holds `data.db` and `snapshots/`).

Cost target: ~$5/month.

## Operational notes

- **Robots / rate**: The site does not publish a permissive scraping policy. Polling every 30 seconds for ~10 readings per auction is light, but use this only on auctions you have a legitimate interest in. Consider adding a random jitter (0–3s) on each poll, which the scraper already does.
- **Time zone**: e-leiloes.pt displays times in `Europe/Lisbon`. The scraper parses to a UTC `Date` so the scheduler is timezone-safe.
- **Resilience**: if a poll fails (network, captcha, site down), the scheduler logs and retries on the next 30s tick. The original snapshot is taken with 3 retries.
- **Cold start**: on backend boot, `scheduler.bootstrap()` re-arms timers for any active auction in the DB, so a redeploy doesn't lose the watch.
