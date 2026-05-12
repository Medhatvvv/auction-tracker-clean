import { chromium } from 'playwright';
import { fromZonedTime } from 'date-fns-tz';
import path from 'node:path';
import fs from 'node:fs/promises';
import { SNAPSHOT_DIR } from './db.js';

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

async function switchToEnglish(page) {
  try {
    const currentLang = await page.evaluate(
      () => document.querySelector('.dd-lang img')?.alt || null
    );
    if (currentLang === 'en' || !currentLang) return;
    await page.click('.dd-lang', { timeout: 3000 });
    await page.waitForTimeout(500);
    await page.waitForSelector('.p-dropdown-panel, .p-dropdown-items', { timeout: 3000 }).catch(() => {});
    const clicked = await page.evaluate(() => {
      const item =
        document.querySelector('.p-dropdown-item[aria-label="en"]') ||
        document.querySelector('[role="option"][aria-label="en"]');
      if (item) { item.click(); return true; }
      const items = document.querySelectorAll('.p-dropdown-item, [role="option"]');
      for (const li of items) {
        if (/^\s*English\s*$/i.test(li.innerText)) { li.click(); return true; }
      }
      return false;
    });
    if (clicked) await page.waitForTimeout(2500);
  } catch (err) {
    console.warn('[scraper] language switch failed:', err.message);
  }
}

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

export async function scrapeAuction(url, opts = {}) {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
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

    await switchToEnglish(page);

    // Wait for either an active-state signal OR an ended-state signal
    await page.waitForFunction(() => {
      const t = document.body.innerText || '';
      const hasBid =
        /Current Bid\s*:?\s*[\d.,\s]+€/i.test(t) ||
        /Licita\S+\s+Atual\s*:?\s*[\d.,\s]+€/i.test(t);
      const hasEndedText =
        /auction\s+(has\s+)?ended/i.test(t) ||
        /leil[ãa]o\s+terminou/i.test(t);
      const hasEndDate =
        /End\s*:?\s*\d{2}\/\d{2}\/\d{4}/i.test(t) ||
        /Fim\s*:?\s*\d{2}\/\d{2}\/\d{4}/i.test(t);
      return (hasBid && hasEndDate) || hasEndedText;
    }, { timeout: 25_000 }).catch(() => {});

    // Remove popup
    await page.evaluate(() => {
      document.querySelectorAll('.p-dialog-mask, .p-component-overlay, .p-dialog')
        .forEach(el => el.remove());
      document.body.style.overflow = '';
    }).catch(() => {});

const data = await page.evaluate((aliases) => {
      const fields = {};
      const dbg = [];

      // ===== Current Bid via unique .text-right class combo =====
      const currentBidEl = document.querySelector(
        'span.text-xl.text-primary-800.font-semibold.text-right'
      );
      if (currentBidEl) {
        fields.current_bid_raw = currentBidEl.textContent.trim();
        dbg.push(`Current Bid: "${fields.current_bid_raw}"`);
      } else {
        dbg.push(`Current Bid: SELECTOR FAILED`);
      }

      // ===== Walk ALL flex rows, log each one's label and value =====
      const allRows = Array.from(document.querySelectorAll('.flex.justify-content-between'));
      dbg.push(`Found ${allRows.length} flex.justify-content-between rows`);

      allRows.forEach((row, idx) => {
        const firstSpan = row.querySelector(':scope > span');
        const labelRaw  = firstSpan ? (firstSpan.textContent || '').trim() : '';
        if (!labelRaw) return;

        // Try multiple ways to get the value
        const tryValue = (sel) => {
          const el = row.querySelector(sel);
          if (!el) return null;
          const t = (el.textContent || '').trim();
          return /\d/.test(t) ? t : null;
        };
        const value =
          tryValue('span.text-right > span.font-semibold') ||
          tryValue('.font-semibold') ||
          tryValue(':scope > span:nth-child(2)');

        dbg.push(`Row ${idx}: label="${labelRaw.substring(0, 30)}" value="${value || '(none)'}"`);

        if (!value) return;
        const lbl = labelRaw.toLowerCase().replace(/:\s*$/, '').trim();

        if (!fields.base_value_raw    && /base value|valor base|valor de avalia/i.test(lbl))
          fields.base_value_raw = value;
        if (!fields.opening_value_raw && /opening|abertura/i.test(lbl))
          fields.opening_value_raw = value;
        if (!fields.minimum_value_raw && /minimum|m[íi]nimo/i.test(lbl))
          fields.minimum_value_raw = value;
        if (!fields.current_bid_raw   && /current bid|licita\S+\s+atual|valor atual|melhor licita/i.test(lbl))
          fields.current_bid_raw = value;
        if (!fields.end_raw           && /^end:?$|^fim:?$|^termina:?$/i.test(lbl))
          fields.end_raw = value;
      });

      dbg.push(`After walk: base=${!!fields.base_value_raw} opening=${!!fields.opening_value_raw} min=${!!fields.minimum_value_raw} bid=${!!fields.current_bid_raw} end=${!!fields.end_raw}`);

      // ===== Ended state =====
      const text = document.body.innerText || '';
      const hasEnded = /auction\s+(has\s+)?ended|leil[ãa]o\s+terminou|this\s+online\s+auction\s+ended/i.test(text);

      return {
        title:             document.title || null,
        base_value_raw:    fields.base_value_raw    || null,
        opening_value_raw: fields.opening_value_raw || null,
        minimum_value_raw: fields.minimum_value_raw || null,
        current_bid_raw:   fields.current_bid_raw   || null,
        end_raw:           fields.end_raw           || null,
        has_ended:         hasEnded,
        url: location.href,
        _debug: dbg,
      };
    }, LABEL_ALIASES);

    // Surface debug to Railway logs
    if (data._debug) {
      console.log('[scraper DEBUG] ' + url);
      data._debug.forEach(line => console.log('  ' + line));
    }

    const parsed = {
      title:         data.title,
      base_value:    parseEuroAmount(data.base_value_raw),
      opening_value: parseEuroAmount(data.opening_value_raw),
      minimum_value: parseEuroAmount(data.minimum_value_raw),
      current_bid:   parseEuroAmount(data.current_bid_raw),
      end_at:        parsePortugueseDateTime(data.end_raw),
      has_ended:     data.has_ended === true,
      raw:           data,
      image_urls:    [],
    };

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
