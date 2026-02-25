#!/usr/bin/env node

/**
 * MCAS (MyChildAtSchool) Homework Scraper
 *
 * Logs into the MCAS parent portal, scrapes the homework page,
 * and writes new homework items to Firestore.
 *
 * Usage:
 *   1. Copy .env.example to .env and fill in your details
 *   2. Place your Firebase service account key as serviceAccountKey.json
 *   3. npm install
 *   4. npm run scrape
 *
 * Can be run as a cron job, e.g.:
 *   0 7,16 * * * cd /path/to/scraper && node scrape-homework.mjs
 */

import { chromium } from 'playwright';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env manually (no dotenv dependency) ──────────────────────────
function loadEnv() {
  const envPath = resolve(__dirname, '.env');
  if (!existsSync(envPath)) {
    console.error('Missing .env file. Copy .env.example to .env and fill in your details.');
    process.exit(1);
  }
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const MCAS_EMAIL = process.env.MCAS_EMAIL;
const MCAS_PASSWORD = process.env.MCAS_PASSWORD;
const MCAS_CHILD_NAME = process.env.MCAS_CHILD_NAME;
const MCAS_SCHOOL_NAME = process.env.MCAS_SCHOOL_NAME;
const FIREBASE_UID = process.env.FIREBASE_UID;
const SA_KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json';

if (!MCAS_EMAIL || !MCAS_PASSWORD || !FIREBASE_UID || !MCAS_CHILD_NAME || !MCAS_SCHOOL_NAME) {
  console.error('Missing required env vars: MCAS_EMAIL, MCAS_PASSWORD, MCAS_CHILD_NAME, MCAS_SCHOOL_NAME, FIREBASE_UID');
  process.exit(1);
}

// ── Firebase Admin init ─────────────────────────────────────────────────
const saPath = resolve(__dirname, SA_KEY_PATH);
if (!existsSync(saPath)) {
  console.error(`Service account key not found at: ${saPath}`);
  console.error('Download it from Firebase Console > Project Settings > Service Accounts');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(saPath, 'utf-8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ── Scrape MCAS ─────────────────────────────────────────────────────────
async function scrapeHomework() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Login
    console.log('Navigating to MCAS login...');
    await page.goto('https://www.mychildatschool.com/MCAS/MCSParentLogin', {
      waitUntil: 'networkidle',
    });

    // Dump form HTML for debugging selectors
    const formHtml = await page.evaluate(() => {
      const forms = document.querySelectorAll('form');
      const inputs = document.querySelectorAll('input, button[type="submit"]');
      const info = [];
      forms.forEach((f, i) => info.push(`FORM[${i}]: action=${f.action} id=${f.id} class=${f.className}`));
      inputs.forEach((inp) => info.push(`  ${inp.tagName} type=${inp.type} id=${inp.id} name=${inp.name} class=${inp.className} placeholder=${inp.placeholder}`));
      return info.join('\n');
    });
    console.log('Page form elements:\n' + formHtml);
    await page.screenshot({ path: resolve(__dirname, 'debug/login-page.png'), fullPage: true });

    console.log('Logging in...');
    // Try multiple common selectors for email/username field
    await page.fill('#EmailTextBox', MCAS_EMAIL);
    await page.fill('#PasswordTextBox', MCAS_PASSWORD);
    await page.click('#LoginButton');

    // Wait for post-login navigation
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    console.log('Logged in. Current URL:', page.url());

    // Dump page content for debugging at each step
    async function dumpPage(label) {
      const url = page.url();
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a, button, [onclick]')).map(el => {
          return `${el.tagName} id=${el.id} class=${el.className} href=${el.href || ''} text="${el.textContent?.trim().slice(0, 80)}"`;
        }).join('\n');
      });
      console.log(`\n--- ${label} ---`);
      console.log(`URL: ${url}`);
      console.log(`Clickable elements:\n${links}`);
      console.log(`--- end ${label} ---\n`);
    }

    await dumpPage('After login');
    await page.screenshot({ path: resolve(__dirname, 'debug/after-login.png'), fullPage: true });

    // Handle combined child+school selection (MCSContactSelect page)
    // Page shows multiple rows, each with a child name + school.
    // We need to click the row that contains BOTH the child name and school name.
    if (page.url().includes('ContactSelect')) {
      console.log('On contact selection page...');

      // Dump full page HTML for debugging (the links have no visible text)
      const pageInfo = await page.evaluate(() => {
        const items = document.querySelectorAll('.avatar-container-item, a');
        return Array.from(items).map((el, i) => {
          return `[${i}] tag=${el.tagName} class=${el.className} href=${el.href} innerHTML=${el.innerHTML.slice(0, 200)}`;
        }).join('\n');
      });
      console.log('Contact page elements:\n' + pageInfo);

      // The avatar-container-item links seem to be the selection items
      // Since there are 3, and the user wants the bottom (last) one for John Spendluffe
      // Click the last avatar-container-item (index -1)
      const avatarItems = page.locator('.avatar-container-item');
      const count = await avatarItems.count();
      console.log(`Found ${count} avatar-container-item elements`);

      if (count > 0) {
        // Click the last one (bottom entry = John Spendluffe)
        const lastItem = avatarItems.nth(count - 1);
        console.log(`Clicking avatar item ${count - 1} (last/bottom)...`);
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
          lastItem.click(),
        ]);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);
        console.log('After contact selection, URL:', page.url());
        await page.screenshot({ path: resolve(__dirname, 'debug/after-contact.png'), fullPage: true });
      } else {
        console.log('No avatar-container-item elements found');
        await page.screenshot({ path: resolve(__dirname, 'debug/contact-selection-fail.png'), fullPage: true });
      }
    }

    // Navigate to homework section
    await dumpPage('Before homework nav');
    // Navigate to homework page directly
    console.log('Navigating to homework page...');
    await page.goto('https://www.mychildatschool.com/MCAS/MCSHomework', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('On homework page:', page.url());

    // Save screenshot for debugging
    await page.screenshot({ path: resolve(__dirname, 'debug/homework-page.png'), fullPage: true });
    console.log('Saved debug screenshot to debug/homework-page.png');

    // Scrape homework items from MCAS homework table
    // Table columns: School | Subject | Homework Title | Subject Teacher | Assigned Date | Due Date | Resources | Score | ...
    const items = await page.evaluate(() => {
      const homework = [];

      // Find the homework table by looking for a table with the right headers
      const tables = document.querySelectorAll('table');
      let homeworkTable = null;
      let colMap = {};

      for (const table of tables) {
        const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent?.trim().toLowerCase() || '');
        const hasSubject = headers.some(h => h.includes('subject') && !h.includes('teacher'));
        const hasTitle = headers.some(h => h.includes('homework') || h.includes('title'));
        const hasDue = headers.some(h => h.includes('due'));

        if (hasSubject && (hasTitle || hasDue)) {
          homeworkTable = table;
          // Build column index map from headers
          headers.forEach((h, i) => {
            if (h.includes('subject') && !h.includes('teacher')) colMap.subject = i;
            else if (h.includes('homework') || h.includes('title')) colMap.title = i;
            else if (h.includes('subject') && h.includes('teacher')) colMap.teacher = i;
            else if (h.includes('assigned') || h.includes('set')) colMap.setDate = i;
            else if (h.includes('due')) colMap.dueDate = i;
            else if (h.includes('resource')) colMap.resources = i;
          });
          break;
        }
      }

      if (!homeworkTable) {
        // Dump all tables for debugging
        const debug = [];
        tables.forEach((t, i) => {
          const ths = Array.from(t.querySelectorAll('th')).map(th => th.textContent?.trim().slice(0, 25));
          const rowCount = t.querySelectorAll('tbody tr').length;
          debug.push(`Table[${i}]: ${rowCount} rows, headers: [${ths.join(' | ')}]`);
        });
        return { items: [], debug: debug.join('\n'), html: document.body.innerHTML.slice(0, 3000) };
      }

      const rows = homeworkTable.querySelectorAll('tbody tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) continue;

        const title = colMap.title !== undefined ? cells[colMap.title]?.textContent?.trim() : '';
        const subject = colMap.subject !== undefined ? cells[colMap.subject]?.textContent?.trim() : '';
        const dueDate = colMap.dueDate !== undefined ? cells[colMap.dueDate]?.textContent?.trim() : '';
        const setDate = colMap.setDate !== undefined ? cells[colMap.setDate]?.textContent?.trim() : undefined;
        const teacher = colMap.teacher !== undefined ? cells[colMap.teacher]?.textContent?.trim() : undefined;

        // Grab resource info (e.g. "2 Files") and any download links
        let resources = null;
        if (colMap.resources !== undefined && cells[colMap.resources]) {
          const resCell = cells[colMap.resources];
          const resText = resCell.textContent?.trim();
          if (resText && resText !== 'N/A') {
            const links = Array.from(resCell.querySelectorAll('a')).map(a => ({
              name: a.textContent?.trim(),
              url: a.href,
            }));
            resources = { text: resText, links };
          }
        }

        if (title && title !== 'N/A') {
          homework.push({ title, subject, dueDate, setDate, teacher, resources });
        }
      }

      return { items: homework, debug: `colMap: ${JSON.stringify(colMap)}, rows: ${homeworkTable.querySelectorAll('tbody tr').length}`, html: null };
    });

    if (items.debug) {
      console.log('Table parsing info:', items.debug);
    }

    if (items.html) {
      console.log('\n--- Could not find homework table. Page HTML preview: ---');
      console.log(items.html);
      console.log('--- End HTML preview ---\n');
      await browser.close();
      return [];
    }

    console.log(`Found ${items.items.length} homework items`);
    await browser.close();
    return items.items;
  } catch (err) {
    console.error('Scrape failed:', err.message);
    await page.screenshot({ path: resolve(__dirname, 'debug/error.png'), fullPage: true });
    console.log('Saved error screenshot to debug/error.png');
    await browser.close();
    throw err;
  }
}

// ── Parse UK date strings to ISO ────────────────────────────────────────
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  // DD/MM/YYYY
  const ukMatch = dateStr.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (ukMatch) {
    const [, d, m, y] = ukMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // "25 Feb 2026" or "25 February 2026"
  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const namedMatch = dateStr.match(/(\d{1,2})\s+(\w{3,})\s+(\d{4})/);
  if (namedMatch) {
    const [, d, mName, y] = namedMatch;
    const m = months[mName.slice(0, 3).toLowerCase()];
    if (m) return `${y}-${m}-${d.padStart(2, '0')}`;
  }

  return null;
}

// ── Write to Firestore ──────────────────────────────────────────────────
async function syncToFirestore(items) {
  const colRef = db.collection(`users/${FIREBASE_UID}/homework`);

  // Get existing MCAS items to deduplicate
  const existing = await colRef.where('source', '==', 'mcas').get();
  const existingTitles = new Set();
  existing.forEach((doc) => {
    const data = doc.data();
    existingTitles.add(`${data.title}__${data.dueDate}`);
  });

  let added = 0;
  const now = Date.now();

  for (const item of items) {
    const dueDate = parseDate(item.dueDate);
    if (!item.title || !dueDate) {
      console.log(`Skipping item (missing title or unparseable date): ${JSON.stringify(item)}`);
      continue;
    }

    const dedupeKey = `${item.title}__${dueDate}`;
    if (existingTitles.has(dedupeKey)) {
      console.log(`Already exists: ${item.title} (due ${dueDate})`);
      continue;
    }

    const doc = {
      title: item.title,
      subject: item.subject || 'Unknown',
      dueDate,
      setDate: parseDate(item.setDate) || null,
      teacher: item.teacher || null,
      resources: item.resources || null,
      completed: false,
      completedAt: null,
      source: 'mcas',
      mcasId: dedupeKey,
      createdAt: now,
      updatedAt: now,
    };

    await colRef.add(doc);
    const resInfo = item.resources ? ` [${item.resources.text}]` : '';
    console.log(`Added: ${item.title} — ${item.subject} (due ${dueDate}, teacher: ${item.teacher || 'N/A'})${resInfo}`);
    added++;
  }

  console.log(`\nSync complete: ${added} new items added, ${items.length - added} skipped/existing`);
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== MCAS Homework Scraper ===\n');

  const items = await scrapeHomework();
  if (items.length === 0) {
    console.log('No homework items found. Check debug screenshot and update selectors if needed.');
    return;
  }

  await syncToFirestore(items);
  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
