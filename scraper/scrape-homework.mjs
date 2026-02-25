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
const FIREBASE_UID = process.env.FIREBASE_UID;
const SA_KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json';

if (!MCAS_EMAIL || !MCAS_PASSWORD || !FIREBASE_UID) {
  console.error('Missing required env vars: MCAS_EMAIL, MCAS_PASSWORD, FIREBASE_UID');
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

    console.log('Logging in...');
    await page.fill('#username', MCAS_EMAIL);
    await page.fill('#password', MCAS_PASSWORD);
    await page.click('button[type="submit"], input[type="submit"], .login-btn, #login-btn');

    // Wait for post-login navigation
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    console.log('Logged in. Current URL:', page.url());

    // Navigate to homework section
    // MCAS typically has a sidebar/menu with "Homework" link
    const homeworkLink = await page.$('a:has-text("Homework"), a[href*="homework"], a[href*="Homework"]');
    if (homeworkLink) {
      await homeworkLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    } else {
      console.log('Could not find Homework link. Trying direct URL patterns...');
      // Try common MCAS homework URL patterns
      const baseUrl = new URL(page.url()).origin;
      await page.goto(`${baseUrl}/MCAS/Homework`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
    }

    console.log('On homework page:', page.url());

    // Save screenshot for debugging
    await page.screenshot({ path: resolve(__dirname, 'debug-homework-page.png'), fullPage: true });
    console.log('Saved debug screenshot to debug-homework-page.png');

    // Scrape homework items
    // MCAS homework pages typically show a table or card list with:
    // - Subject, Title, Set date, Due date, Teacher
    //
    // This selector will need adjusting based on the actual page structure.
    // Run once with headless:false to see what the page looks like,
    // then update the selectors below.
    const items = await page.evaluate(() => {
      const homework = [];

      // Strategy 1: Table rows (common MCAS layout)
      const rows = document.querySelectorAll('table tbody tr, .homework-item, .hw-row, [class*="homework"]');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
          homework.push({
            title: cells[1]?.textContent?.trim() || cells[0]?.textContent?.trim() || '',
            subject: cells[0]?.textContent?.trim() || '',
            dueDate: cells[2]?.textContent?.trim() || cells[3]?.textContent?.trim() || '',
            setDate: cells.length >= 4 ? cells[2]?.textContent?.trim() : undefined,
            teacher: cells.length >= 5 ? cells[4]?.textContent?.trim() : undefined,
          });
          continue;
        }

        // Strategy 2: Div-based cards
        const title = row.querySelector('[class*="title"], h3, h4, strong')?.textContent?.trim();
        const subject = row.querySelector('[class*="subject"]')?.textContent?.trim();
        const due = row.querySelector('[class*="due"], [class*="date"]')?.textContent?.trim();

        if (title) {
          homework.push({ title, subject: subject || '', dueDate: due || '' });
        }
      }

      // Strategy 3: If neither worked, grab the page HTML for debugging
      if (homework.length === 0) {
        return { items: [], html: document.body.innerHTML.slice(0, 5000) };
      }

      return { items: homework, html: null };
    });

    if (items.html) {
      console.log('\n--- Could not parse homework. Page HTML preview: ---');
      console.log(items.html);
      console.log('--- End HTML preview ---\n');
      console.log('You need to update the selectors in scrape-homework.mjs');
      console.log('Run with headless:false and inspect the page structure.');
      await browser.close();
      return [];
    }

    console.log(`Found ${items.items.length} homework items`);
    await browser.close();
    return items.items;
  } catch (err) {
    console.error('Scrape failed:', err.message);
    await page.screenshot({ path: resolve(__dirname, 'debug-error.png'), fullPage: true });
    console.log('Saved error screenshot to debug-error.png');
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
      completed: false,
      completedAt: null,
      source: 'mcas',
      mcasId: dedupeKey,
      createdAt: now,
      updatedAt: now,
    };

    await colRef.add(doc);
    console.log(`Added: ${item.title} — ${item.subject} (due ${dueDate})`);
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
