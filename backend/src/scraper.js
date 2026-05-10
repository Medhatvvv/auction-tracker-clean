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

/**
 * Parse a Portuguese-formatted currency string into a number.
 *   "201 000,00 €"   -> 201000
 *   "1.234.567,89 €" -> 1234567.89
 */
export function parseEuroAmount(text) {
  if (!text) return null;
  const cleaned = text
    .replace(/€/g, '')
    .replace(/\u00A0/g, ' ') // non-breaking spaces
    .replace(/\s/g, '')
    .replace(/\./g, '')      // thousand separator
    .replace(/,/g, '.')      // decimal comma -> dot
    .trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse strings like:
 *   "This online auction ended in 06/05/2026 10:23:57."
 *   "Termina em 06/05/2026 10:23:57"
 * Returns an ISO UTC date or null.
 */
export function parsePortugueseDateTime(text) {
  if (!text) return null;
  const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, dd, mm, yyyy, HH, MM, SS] = m;
  // Site shows times in Europe/Lisbon. Convert to UTC.
  const localStr = `${yyyy}-${mm}-${dd}T${HH}:${MM}:${SS}`;
  const utc = fromZonedTime(localStr, 'Europe/Lisbon');
  return utc.toISOString();
}

/**
 * The auction page renders labels in either Portuguese or English depending
 * on the visitor's locale. This helper fishes a value out of the page DOM by
 * searching for any of the label aliases.
 */
const LABEL_ALIASES = {
  base_value:    ['Base Value', 'Valor Base', 'Valor de Avaliação'],
  opening_value: ['Opening Value', 'Valor de Abertura'],
  minimum_value: ['Minimum Value', 'Valor Mínimo'],
  current_bid:   ['Current Bid', 'Licitação Atual', 'Valor Atual', 'Melhor Licitação'],
  end_label:     ['End', 'Fim', 'Termina'],
};

// ---------------------------------------------------------------------------
// Main scrape
// ---------------------------------------------------------------------------

/**
 * Fetch the auction page once and return parsed fields.
 *
 * @param {string} url
 * @param {{ saveSnapshot?: boolean, snapshotId?: number|string }} opts
 */
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

  // Random small delay to look less robotic
  await page.waitForTimeout(Math.floor(Math.random() * 1500));

  try {
    const resp = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    if (!resp || !resp.ok()) {
      throw new Error(`HTTP ${resp ? resp.status() : 'no-response'} for ${url}`);
    }

    // Some bid values on this site are loaded via XHR after first paint.
    // Wait for the network to settle, but don't block forever.
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    const data = await page.evaluate((aliases) => {
      const text = document.body.innerText || '';

      // Extract one labelled value, e.g. "Base Value: 201 000,00 €"
      function pickLabel(labels) {
        for (const label of labels) {
          // Match "Label: value" up to the next newline, allowing optional
          // whitespace and various dash characters.
          const re = new RegExp(
            `${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:\\-]\\s*([^\\n\\r]+)`,
            'i',
          );
          const m = text.match(re);
          if (m) return m[1].trim();
        }
        return null;
      }

      function pickEndPhrase(labels) {
        for (const label of labels) {
          const re = new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\n\\r.]+)`, 'i');
          const m = text.match(re);
          if (m) return m[0];
        }
        return null;
      }

      return {
        title:           document.title || null,
        base_value_raw:    pickLabel(aliases.base_value),
        opening_value_raw: pickLabel(aliases.opening_value),
        minimum_value_raw: pickLabel(aliases.minimum_value),
        current_bid_raw:   pickLabel(aliases.current_bid),
        end_raw:           pickEndPhrase(aliases.end_phrase),
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
    };

    // Optional: save full page snapshot (HTML + screenshot + PDF)
    if (opts.saveSnapshot && opts.snapshotId != null) {
      const id = String(opts.snapshotId);
      const dir = path.join(SNAPSHOT_DIR, id);
      await fs.mkdir(dir, { recursive: true });

      const html = await page.content();
      await fs.writeFile(path.join(dir, 'page.html'), html, 'utf8');

      await page.screenshot({
        path: path.join(dir, 'page.png'),
        fullPage: true,
      });

      // PDFs only work in headless Chromium
      try {
        await page.pdf({
          path: path.join(dir, 'page.pdf'),
          format: 'A4',
          printBackground: true,
        });
      } catch (e) {
        // Non-fatal — PNG + HTML are enough
      }

      parsed.snapshot_dir = dir;
    }

    return parsed;
  } finally {
    await ctx.close();
  }
}

/**
 * scrapeAuction with a few retries — used for the very first fetch where
 * we want to be confident we got the end_at correctly.
 */
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
