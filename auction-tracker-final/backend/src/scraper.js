import { chromium } from 'playwright';
import { fromZonedTime } from 'date-fns-tz';
import path from 'node:path';
import fs from 'node:fs/promises';
import { SNAPSHOT_DIR } from './db.js';

// ---------------------------------------------------------------------------
// Browser singleton — reuse one Chromium between scrapes for speed.
// ---------------------------------------------------------------------------
let browserPromise = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browserPromise;
}

export async function shutdownBrowser() {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function parseEuroAmount(text) {
  if (!text) return null;
  const cleaned = text
    .replace(/€/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parsePortugueseDateTime(text) {
  if (!text) return null;
  const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, dd, mm, yyyy, HH, MM, SS] = m;
  const utc = fromZonedTime(`${yyyy}-${mm}-${dd}T${HH}:${MM}:${SS}`, 'Europe/Lisbon');
  return utc.toISOString();
}

const LABEL_ALIASES = {
  base_value:    ['Base Value', 'Valor Base', 'Valor de Avaliação'],
  opening_value: ['Opening Value', 'Valor de Abertura'],
  minimum_value: ['Minimum Value', 'Valor Mínimo'],
  current_bid:   ['Current Bid', 'Licitação Atual', 'Valor Atual', 'Melhor Licitação'],
  end_label:     ['End', 'Fim', 'Termina'],
};

// ---------------------------------------------------------------------------
// Click through the image gallery and collect every image URL.
// Returns an array of absolute URLs. Capped at 60 images for safety.
// ---------------------------------------------------------------------------
async function captureGalleryImages(page) {
  // Read the "X/Y" indicator in the gallery footer to know how many to walk.
  const total = await page.evaluate(() => {
    const text = document.querySelector('.title-container')?.innerText || '';
    const m = text.match(/\d+\s*\/\s*(\d+)/);
    return m ? parseInt(m[1], 10) : 1;
  }).catch(() => 1);

  const limit = Math.min(total, 60);
  const urls  = new Set();

  for (let i = 0; i < limit; i++) {
    const url = await page.evaluate(() => {
      const item = document.querySelector('.p-galleria-item');
      if (!item) return null;
      // Image is set as a background-image style on the inner div
      const inner = item.querySelector('[style*="background-image"]') || item;
      const bg = (inner.style?.backgroundImage) || '';
      const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
      return m ? m[1] : null;
    }).catch(() => null);

    if (url) urls.add(url);

    if (i < limit - 1) {
      // Click "next" arrow. If it isn't there, stop early.
      const ok = await page.click('.p-galleria-item-next', { timeout: 800 })
        .then(() => true).catch(() => false);
      if (!ok) break;
      await page.waitForTimeout(250); // give the carousel time to swap
    }
  }

  return Array.from(urls);
}

// ---------------------------------------------------------------------------
// Main scrape
// ---------------------------------------------------------------------------
export async function scrapeAuction(url, opts = {}) {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
    locale: 'en-US',
  });

  const page = await ctx.newPage();
  await page.waitForTimeout(Math.floor(Math.random() * 1500));

  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    if (!resp || !resp.ok()) {
      throw new Error(`HTTP ${resp ? resp.status() : 'no-response'} for ${url}`);
    }

    // ── Wait for actual VALUES (not just labels) to be rendered ─────────
    // The page renders the labels statically but loads bid info via XHR.
    // Last time we waited only for the label, which appeared too early.
    // This waits for the label AND a euro amount AND an end date.
    await page.waitForFunction(() => {
      const t = document.body.innerText || '';
      const hasBid =
        /Current Bid\s*:?\s*[\d.,\s]+€/i.test(t) ||
        /Licita\S+\s+Atual\s*:?\s*[\d.,\s]+€/i.test(t);
      const hasEnd =
        /End\s*:?\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}/i.test(t) ||
        /Fim\s*:?\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}/i.test(t);
      return hasBid && hasEnd;
    }, { timeout: 20_000 }).catch(() => {});

    // ── Remove any popup overlay that's blocking the page ──────────────
    // The site shows a "FORMAÇÃO E-LEILÕES" modal on some visits.
    // We yank it out of the DOM so it doesn't ruin the screenshot.
    await page.evaluate(() => {
      document.querySelectorAll(
        '.p-dialog-mask, .p-component-overlay, .p-dialog'
      ).forEach(el => el.remove());
      // Restore page scroll in case the modal locked it
      document.body.style.overflow = '';
    }).catch(() => {});

    // ── Extract the structured data ─────────────────────────────────────
    const data = await page.evaluate((aliases) => {
      const text = document.body.innerText || '';
      function pickLabel(labels) {
        for (const label of labels) {
          const re = new RegExp(
            `${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:\\-]\\s*([^\\n\\r]+)`,
            'i',
          );
          const m = text.match(re);
          if (m) return m[1].trim();
        }
        return null;
      }
      return {
        title:             document.title || null,
        base_value_raw:    pickLabel(aliases.base_value),
        opening_value_raw: pickLabel(aliases.opening_value),
        minimum_value_raw: pickLabel(aliases.minimum_value),
        current_bid_raw:   pickLabel(aliases.current_bid),
        end_raw:           pickLabel(aliases.end_label),
        url: location.href,
      };
    }, LABEL_ALIASES);

    const parsed = {
      title:         data.title,
      base_value:    parseEuroAmount(data.base_value_raw),
      opening_value: parseEuroAmount(data.opening_value_raw),
      minimum_value: parseEuroAmount(data.minimum_value_raw),
      current_bid:   parseEuroAmount(data.current_bid_raw),
      end_at:        parsePortugueseDateTime(data.end_raw),
      raw:           data,
      image_urls:    [],
    };

    // ── Snapshot capture + gallery walk (only on initial add) ──────────
    if (opts.saveSnapshot && opts.snapshotId != null) {
      // Capture gallery first so the screenshot reflects whatever image
      // happens to be last. (Doesn't matter visually; just an artifact.)
      try {
        parsed.image_urls = await captureGalleryImages(page);
      } catch (e) {
        console.warn('[scraper] gallery capture failed:', e.message);
      }

      const id  = String(opts.snapshotId);
      const dir = path.join(SNAPSHOT_DIR, id);
      await fs.mkdir(dir, { recursive: true });

      const html = await page.content();
      await fs.writeFile(path.join(dir, 'page.html'), html, 'utf8');
      await page.screenshot({ path: path.join(dir, 'page.png'), fullPage: true });

      try {
        await page.pdf({ path: path.join(dir, 'page.pdf'), format: 'A4', printBackground: true });
      } catch {}
      parsed.snapshot_dir = dir;
    }

    return parsed;
  } finally {
    await ctx.close();
  }
}

export async function scrapeAuctionWithRetry(url, opts = {}, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await scrapeAuction(url, opts);
    } catch (err) {
      lastErr = err;
      const wait = 2000 * (i + 1);
      console.warn(`[scraper] attempt ${i + 1} failed (${err.message}), retrying in ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr;
}
