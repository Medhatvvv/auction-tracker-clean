import { chromium } from 'playwright';
import { fromZonedTime } from 'date-fns-tz';
import path from 'node:path';
import fs from 'node:fs/promises';
import { SNAPSHOT_DIR } from './db.js';

// ---------------------------------------------------------------------------
// Browser singleton
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
// Parsing helpers
// ---------------------------------------------------------------------------
export function parseEuroAmount(text) {
  if (!text) return null;
  // Strip everything except digits, comma, dot
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
// Switch the site's language to English using the in-page dropdown.
// ---------------------------------------------------------------------------
async function switchToEnglish(page) {
  try {
    const currentLang = await page.evaluate(
      () => document.querySelector('.dd-lang img')?.alt || null
    );
    if (currentLang === 'en' || !currentLang) return;

    // Open the dropdown
    await page.click('.dd-lang', { timeout: 3000 });
    await page.waitForTimeout(400);

    // Find and click the "en" option in the now-visible panel
    const clicked = await page.evaluate(() => {
      const items = document.querySelectorAll(
        '.p-dropdown-panel .p-dropdown-item, .p-dropdown-items li, [role="option"]'
      );
      for (const item of items) {
        const img = item.querySelector('img');
        if (img && img.alt === 'en') {
          item.click();
          return true;
        }
      }
      return false;
    });

    if (clicked) {
      // Vue re-renders the labels — give it a beat
      await page.waitForTimeout(2500);
    }
  } catch (err) {
    console.warn('[scraper] language switch failed (continuing in PT):', err.message);
  }
}

// ---------------------------------------------------------------------------
// Walk through the image gallery and collect every image URL
// ---------------------------------------------------------------------------
async function captureGalleryImages(page) {
  await page.waitForSelector('.p-galleria-item', { timeout: 5000 }).catch(() => {});

  const total = await page.evaluate(() => {
    const text = document.querySelector('.title-container')?.innerText || '';
    const m = text.match(/(\d+)\s*\/\s*(\d+)/);
    return m ? parseInt(m[2], 10) : 1;
  }).catch(() => 1);

  const limit = Math.min(total, 60);
  const urls  = new Set();

  for (let i = 0; i < limit; i++) {
    const url = await page.evaluate(() => {
      const item = document.querySelector('.p-galleria-item');
      if (!item) return null;
      // Image is set as background-image on either the item or a descendant
      const nodes = [item, ...item.querySelectorAll('[style*="background-image"]')];
      for (const node of nodes) {
        const bg = node.style?.backgroundImage || '';
        const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
        if (m) return m[1];
      }
      return null;
    }).catch(() => null);

    if (url) urls.add(url);

    if (i < limit - 1) {
      const ok = await page.click('.p-galleria-item-next', { timeout: 1500, force: true })
        .then(() => true).catch(() => false);
      if (!ok) break;
      await page.waitForTimeout(300);
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

    // 1. Force the page into English so labels are predictable
    await switchToEnglish(page);

    // 2. Wait until the actual VALUES are rendered (not just labels)
    await page.waitForFunction(() => {
      const t = document.body.innerText || '';
      const hasBid =
        /Current Bid\s*:?\s*[\d.,\s]+€/i.test(t) ||
        /Licita\S+\s+Atual\s*:?\s*[\d.,\s]+€/i.test(t);
      const hasEnd =
        /End\s*:?\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}/i.test(t) ||
        /Fim\s*:?\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}/i.test(t);
      return hasBid && hasEnd;
    }, { timeout: 25_000 }).catch(() => {});

    // 3. Remove any popup overlay
    await page.evaluate(() => {
      document.querySelectorAll(
        '.p-dialog-mask, .p-component-overlay, .p-dialog'
      ).forEach(el => el.remove());
      document.body.style.overflow = '';
    }).catch(() => {});

    // 4. Extract structured data
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

    // 5. Gallery + snapshot capture, only on initial add
    if (opts.saveSnapshot && opts.snapshotId != null) {
      try {
        parsed.image_urls = await captureGalleryImages(page);
        console.log(`[scraper] captured ${parsed.image_urls.length} gallery images`);
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
