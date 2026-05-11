import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = process.env.DATA_DIR || path.resolve('./data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'snapshots'), { recursive: true });

export const SNAPSHOT_DIR = path.join(DATA_DIR, 'snapshots');

const db = new Database(path.join(DATA_DIR, 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS auctions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    url             TEXT    NOT NULL UNIQUE,
    external_id     TEXT,
    title           TEXT,
    base_value      REAL,
    opening_value   REAL,
    minimum_value   REAL,
    current_bid     REAL,
    end_at          TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'pending',
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    last_error      TEXT
  );

  CREATE TABLE IF NOT EXISTS bid_snapshots (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    auction_id      INTEGER NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
    current_bid     REAL,
    captured_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    raw             TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_bid_auction ON bid_snapshots(auction_id, captured_at);
  CREATE INDEX IF NOT EXISTS idx_auction_endat ON auctions(end_at, status);
`);

// --- Migration: add image_urls column if it doesn't exist ---
try {
  db.exec(`ALTER TABLE auctions ADD COLUMN image_urls TEXT`);
  console.log('[db] migrated: added image_urls column');
} catch (e) {
  if (!/duplicate column/i.test(e.message)) throw e;
}

const stmts = {
  insertAuction: db.prepare(`
    INSERT INTO auctions (url, external_id, title, base_value, opening_value,
                          minimum_value, current_bid, end_at, status, image_urls)
    VALUES (@url, @external_id, @title, @base_value, @opening_value,
            @minimum_value, @current_bid, @end_at, @status, @image_urls)
  `),
  updateAuction: db.prepare(`
    UPDATE auctions
       SET current_bid   = COALESCE(@current_bid, current_bid),
           base_value    = COALESCE(@base_value, base_value),
           opening_value = COALESCE(@opening_value, opening_value),
           minimum_value = COALESCE(@minimum_value, minimum_value),
           end_at        = COALESCE(@end_at, end_at),
           title         = COALESCE(@title, title),
           status        = COALESCE(@status, status),
           image_urls    = COALESCE(@image_urls, image_urls),
           last_error    = @last_error,
           updated_at    = datetime('now')
     WHERE id = @id
  `),
  getAuction:        db.prepare(`SELECT * FROM auctions WHERE id = ?`),
  getAuctionByUrl:   db.prepare(`SELECT * FROM auctions WHERE url = ?`),
  listAuctions:      db.prepare(`SELECT * FROM auctions ORDER BY end_at ASC`),
  deleteAuction:     db.prepare(`DELETE FROM auctions WHERE id = ?`),
  listActive:        db.prepare(`SELECT * FROM auctions WHERE status IN ('pending','watching')`),
  insertBidSnap:     db.prepare(`
    INSERT INTO bid_snapshots (auction_id, current_bid, raw)
    VALUES (@auction_id, @current_bid, @raw)
  `),
  bidHistory:        db.prepare(`
    SELECT current_bid, captured_at FROM bid_snapshots
     WHERE auction_id = ? ORDER BY captured_at ASC
  `),
};

// Convert image_urls JSON string → array for outgoing responses
function hydrate(row) {
  if (!row) return row;
  try {
    row.image_urls = row.image_urls ? JSON.parse(row.image_urls) : [];
  } catch {
    row.image_urls = [];
  }
  return row;
}

export function createAuction(data) {
  const info = stmts.insertAuction.run({
    status: 'pending',
    ...data,                                                          
    image_urls: data.image_urls ? JSON.stringify(data.image_urls) : null,  
  });
  return hydrate(stmts.getAuction.get(info.lastInsertRowid));
}

export function updateAuction(id, patch) {
  stmts.updateAuction.run({
    id,
    current_bid:   patch.current_bid   ?? null,
    base_value:    patch.base_value    ?? null,
    opening_value: patch.opening_value ?? null,
    minimum_value: patch.minimum_value ?? null,
    end_at:        patch.end_at        ?? null,
    title:         patch.title         ?? null,
    status:        patch.status        ?? null,
    image_urls:    patch.image_urls    ? JSON.stringify(patch.image_urls) : null,
    last_error:    patch.last_error    ?? null,
  });
  return hydrate(stmts.getAuction.get(id));
}

export function getAuction(id)         { return hydrate(stmts.getAuction.get(id)); }
export function getAuctionByUrl(url)   { return hydrate(stmts.getAuctionByUrl.get(url)); }
export function listAuctions()         { return stmts.listAuctions.all().map(hydrate); }
export function deleteAuction(id)      { return stmts.deleteAuction.run(id); }
export function listActiveAuctions()   { return stmts.listActive.all().map(hydrate); }

export function recordBid(auctionId, currentBid, raw = null) {
  stmts.insertBidSnap.run({
    auction_id:  auctionId,
    current_bid: currentBid,
    raw:         raw ? JSON.stringify(raw) : null,
  });
}

export function getBidHistory(auctionId) {
  return stmts.bidHistory.all(auctionId);
}

export default db;
