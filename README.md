# e-leiloes.pt Auction Tracker

Watches auction items on https://e-leiloes.pt and polls bid info every 30 seconds during the final 5 minutes before each auction ends.

## Features

- Paste any e-leiloes.pt event URL → app snapshots the page (HTML + screenshot + PDF) and starts tracking.
- Captures full image gallery from each auction (up to 60 images).
- Polls bid info every 30 seconds during the last 5 minutes of bidding.
- Live updates via WebSocket — bid timeline chart updates without refresh.
- Light, modern UI.

## Tech stack

- **Backend**: Node.js + Express + Playwright (real headless Chromium) + SQLite
- **Frontend**: Next.js + React + Tailwind + Recharts
- **Deployment**: Railway (backend with volume) + same for frontend, or Vercel for frontend
- **Database**: SQLite stored on a persistent Railway volume

## Project layout

```
auction-tracker/
├── backend/
│   ├── src/
│   │   ├── index.js       Express + WebSocket bootstrap
│   │   ├── db.js          SQLite schema + queries
│   │   ├── scraper.js     Playwright scraping (label match + popup removal + gallery walk)
│   │   ├── scheduler.js   T-5min polling window manager
│   │   ├── routes.js      REST endpoints
│   │   └── ws.js          WebSocket broadcaster
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                  Watchlist
│   │   │   ├── auction/[id]/page.tsx     Detail page with image gallery + chart
│   │   │   ├── layout.tsx
│   │   │   └── globals.css
│   │   └── lib/api.ts                    API client (configure BACKEND_URL here)
│   ├── tailwind.config.js
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## Deploy to Railway

1. Push this folder to a new GitHub repo.
2. On railway.com → **New Project** → **Deploy from GitHub Repo** → pick your repo.
3. Rename the auto-created service to `backend`. In its **Settings**:
   - **Source → Root Directory**: `backend`
   - **Networking → Public Networking**: **Generate Domain** (note the URL)
   - **Volumes** tab: **Add Volume** at mount path `/app/data`
4. Deploy. Wait until logs show `[backend] http://0.0.0.0:8080`.
5. Edit `frontend/src/lib/api.ts` line 2 — replace the `BACKEND_URL` constant with your actual backend URL from step 3. Commit and push.
6. Click **+ Create** → **GitHub Repo** → pick the same repo to add a second service. Rename it to `frontend`. In its **Settings**:
   - **Source → Root Directory**: `frontend`
   - **Networking → Public Networking**: **Generate Domain**
7. Open the frontend URL. Paste an auction URL into the watchlist. Done.

## Local development

```bash
cd backend
npm install
npx playwright install chromium --with-deps
DATA_DIR=./data npm run dev      # http://localhost:4000

cd ../frontend
# Edit src/lib/api.ts → set BACKEND_URL to http://localhost:4000
npm install
npm run dev                       # http://localhost:3000
```

Or just `docker compose up --build`.

## Operational notes

- **Polling window**: each auction self-schedules. At T-5min, it starts polling every 30s with 0–3s jitter. After T+1min (1-minute grace past the listed end), it stops.
- **Snapshot capture**: only on the initial add. Saves `page.html`, `page.png`, and `page.pdf` to `/app/data/snapshots/<id>/`. Polls don't re-save these.
- **Gallery capture**: only on initial add. Walks the carousel by clicking "next" until all images are seen (capped at 60).
- **Popup handling**: any `.p-dialog-mask`, `.p-component-overlay`, or `.p-dialog` element is removed from the DOM before snapshot capture, so the "FORMAÇÃO E-LEILÕES" modal doesn't pollute screenshots.
- **Cold start**: on backend boot, every `pending` or `watching` auction in the DB gets its polling timer re-armed.
- **Time zone**: end times shown in `Europe/Lisbon` are parsed to UTC, so the scheduler is timezone-safe.
