import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import {
  createAuction, getAuction, getAuctionByUrl, listAuctions,
  deleteAuction, getBidHistory, SNAPSHOT_DIR,
} from './db.js';
import { scrapeAuctionWithRetry } from './scraper.js';
import { armAuction, disarmAuction } from './scheduler.js';

const router = express.Router();

const AddSchema = z.object({
  url: z.string().url().refine(
    (u) => /^https?:\/\/(www\.)?e-leiloes\.pt\/evento\//i.test(u),
    'URL must be an e-leiloes.pt event URL',
  ),
});

router.get('/auctions', (_req, res) => res.json(listAuctions()));

router.post('/auctions', async (req, res) => {
  const parsed = AddSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const url = parsed.data.url.trim();

  if (getAuctionByUrl(url)) {
    return res.status(409).json({ error: 'Already in watchlist' });
  }

  try {
    const tempId = `tmp-${Date.now()}`;
    const initial = await scrapeAuctionWithRetry(url, {
      saveSnapshot: true,
      snapshotId: tempId,
    });
    if (!initial.end_at) {
      return res.status(422).json({
        error: 'Could not parse auction end time from page',
        debug: initial.raw,
      });
    }
    const externalId = (url.match(/\/evento\/([^/?#]+)/) || [])[1] || null;

    const row = createAuction({
      url,
      external_id:   externalId,
      title:         initial.title,
      base_value:    initial.base_value,
      opening_value: initial.opening_value,
      minimum_value: initial.minimum_value,
      current_bid:   initial.current_bid,
      end_at:        initial.end_at,
      image_urls:    initial.image_urls || [],
    });

    const tmpDir = path.join(SNAPSHOT_DIR, tempId);
    const realDir = path.join(SNAPSHOT_DIR, String(row.id));
    if (fs.existsSync(tmpDir)) fs.renameSync(tmpDir, realDir);

    armAuction(row.id);
    res.status(201).json(row);
  } catch (err) {
    console.error('[POST /auctions]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/auctions/:id', (req, res) => {
  const id = Number(req.params.id);
  const a = getAuction(id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  res.json({ ...a, history: getBidHistory(id) });
});

router.delete('/auctions/:id', (req, res) => {
  const id = Number(req.params.id);
  disarmAuction(id);
  deleteAuction(id);
  const dir = path.join(SNAPSHOT_DIR, String(id));
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  res.status(204).end();
});

router.get('/auctions/:id/snapshot/:asset', (req, res) => {
  const id = Number(req.params.id);
  const asset = req.params.asset;
  if (!['page.html', 'page.png', 'page.pdf'].includes(asset)) {
    return res.status(400).json({ error: 'Invalid asset' });
  }
  const file = path.join(SNAPSHOT_DIR, String(id), asset);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Snapshot not found' });
  res.sendFile(file);
});

router.get('/health', (_req, res) => res.json({ ok: true }));

export default router;
