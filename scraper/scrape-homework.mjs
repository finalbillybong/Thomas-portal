#!/usr/bin/env node

/**
 * MCAS (MyChildAtSchool) Homework Scraper — Long-running scheduled service
 *
 * Reads scrape schedule from Firestore, runs on cron, downloads resource files,
 * and archives homework items 7 days after their due date.
 */

import { chromium } from 'playwright';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';

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

const DEFAULT_SCRAPE_TIMES = ['15:30', '18:00', '21:00'];

const serviceAccount = JSON.parse(readFileSync(saPath, 'utf-8'));
initializeApp({ credential: cert(serviceAccount) });
const fsDb = getFirestore();

// Ensure directories exist
mkdirSync(resolve(__dirname, 'debug'), { recursive: true });
mkdirSync(resolve(__dirname, 'resources'), { recursive: true });

// ── Scrape MCAS ─────────────────────────────────────────────────────────
async function scrapeHomework() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    // Login
    console.log('Navigating to MCAS login...');
    await page.goto('https://www.mychildatschool.com/MCAS/MCSParentLogin', { waitUntil: 'networkidle' });

    console.log('Logging in...');
    await page.fill('#EmailTextBox', MCAS_EMAIL);
    await page.fill('#PasswordTextBox', MCAS_PASSWORD);
    await page.click('#LoginButton');
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    console.log('Logged in. URL:', page.url());

    // Handle contact selection page
    if (page.url().includes('ContactSelect')) {
      console.log('On contact selection page...');
      const avatarItems = page.locator('.avatar-container-item');
      const count = await avatarItems.count();
      if (count > 0) {
        const lastItem = avatarItems.nth(count - 1);
        console.log(`Clicking avatar item ${count - 1} (last/bottom)...`);
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
          lastItem.click(),
        ]);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);
        console.log('After contact selection, URL:', page.url());
      }
    }

    // Navigate to homework page
    console.log('Navigating to homework page...');
    await page.goto('https://www.mychildatschool.com/MCAS/MCSHomework', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('On homework page:', page.url());

    // Save screenshot for debugging
    await page.screenshot({ path: resolve(__dirname, 'debug/homework-page.png'), fullPage: true });
    console.log('Saved debug screenshot to debug/homework-page.png');

    // Scrape homework items from MCAS homework table
    // Table columns: School | Subject | Homework Title | Subject Teacher | Assigned Date | Due Date | Resources | Score | ...
    const tableData = await page.evaluate(() => {
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

      // Mark the table so Playwright can target it outside evaluate
      homeworkTable.setAttribute('data-hw-scraper', 'true');

      const rows = homeworkTable.querySelectorAll('tbody tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) continue;

        const title = colMap.title !== undefined ? cells[colMap.title]?.textContent?.trim() : '';
        const subject = colMap.subject !== undefined ? cells[colMap.subject]?.textContent?.trim() : '';
        const dueDate = colMap.dueDate !== undefined ? cells[colMap.dueDate]?.textContent?.trim() : '';
        const setDate = colMap.setDate !== undefined ? cells[colMap.setDate]?.textContent?.trim() : undefined;
        const teacher = colMap.teacher !== undefined ? cells[colMap.teacher]?.textContent?.trim() : undefined;

        // Check if resources cell has content
        let hasResources = false;
        let resourceText = null;
        if (colMap.resources !== undefined && cells[colMap.resources]) {
          const resText = cells[colMap.resources].textContent?.trim();
          if (resText && resText !== 'N/A') {
            hasResources = true;
            resourceText = resText;
          }
        }

        if (title && title !== 'N/A') {
          homework.push({ title, subject, dueDate, setDate, teacher, hasResources, resourceText });
        }
      }

      return { items: homework, colMap, tableFound: true };
    });

    if (!tableData.tableFound) {
      console.log('Could not find homework table on page');
      await browser.close();
      return [];
    }

    console.log(`Found ${tableData.items.length} homework items`);

    // ── Resource downloading ──────────────────────────────────────────
    for (let i = 0; i < tableData.items.length; i++) {
      const item = tableData.items[i];
      if (!item.hasResources) {
        item.resources = null;
        continue;
      }

      console.log(`Fetching resources for: ${item.title}...`);
      try {
        const resColIdx = tableData.colMap.resources + 1;
        const resCell = page.locator(`table[data-hw-scraper] tbody tr:nth-child(${i + 1}) td:nth-child(${resColIdx})`);
        const clickTarget = resCell.locator('a, button, [onclick]').first();
        const hasClickable = await clickTarget.count();

        if (hasClickable > 0) {
          await clickTarget.click();
        } else {
          await resCell.click();
        }
        await page.waitForTimeout(2000);
        await page.screenshot({ path: resolve(__dirname, `debug/resource-popup-${i}.png`), fullPage: true });

        // Find file download links — look for <a> tags whose visible text
        // ends with a known file extension (e.g. "Y7 Term 3 Spelling Homework.pdf")
        const fileLinks = await page.evaluate(() => {
          const extRe = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|png|jpg|jpeg)$/i;
          const links = [];
          const seen = new Set();

          for (const a of document.querySelectorAll('a[href]')) {
            const href = a.href;
            const text = a.textContent?.trim() || '';
            if (!href || href.includes('javascript:') || href.endsWith('#') || seen.has(href)) continue;

            // Match by link text ending in a file extension (most reliable)
            // or by href containing a file extension
            if (extRe.test(text) || extRe.test(decodeURIComponent(href.split('?')[0]))) {
              seen.add(href);
              links.push({ name: text || 'file', url: href });
            }
          }
          return links;
        });

        if (fileLinks.length > 0) {
          console.log(`  Found ${fileLinks.length} file links:`);
          for (const fl of fileLinks) console.log(`    - ${fl.name} => ${fl.url.slice(0, 120)}`);
          const downloadedFiles = [];
          for (const link of fileLinks) {
            try {
              // Download the file directly using the authenticated browser context
              // (the links are not visible in the popup so we can't click them)
              const response = await page.context().request.get(link.url);
              if (response.ok()) {
                const safeName = `${item.subject.replace(/[^a-zA-Z0-9]/g, '_')}_${link.name}`;
                const filePath = resolve(__dirname, 'resources', safeName);
                const buffer = await response.body();
                writeFileSync(filePath, buffer);
                console.log(`  Downloaded: ${safeName} (${buffer.length} bytes)`);
                // URL path served by nginx from shared volume
                downloadedFiles.push({ name: link.name, url: `/resources/${encodeURIComponent(safeName)}` });
              } else {
                console.log(`  HTTP ${response.status()} for: ${link.name}`);
                downloadedFiles.push({ name: link.name, url: link.url });
              }
            } catch (dlErr) {
              console.log(`  Download failed: ${dlErr.message}`);
              downloadedFiles.push({ name: link.name, url: link.url });
            }
          }
          item.resources = { text: item.resourceText, links: downloadedFiles };
        } else {
          console.log('  No file links found in popup');
          item.resources = { text: item.resourceText, links: [] };
        }

        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      } catch (resErr) {
        console.log(`  Resource fetch failed: ${resErr.message}`);
        item.resources = { text: item.resourceText, links: [] };
      }
    }

    // Set null resources for items without
    for (const item of tableData.items) {
      if (!item.hasResources && !item.resources) item.resources = null;
    }

    await browser.close();
    return tableData.items;
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
  const colRef = fsDb.collection(`users/${FIREBASE_UID}/homework`);

  const existing = await colRef.where('source', '==', 'mcas').get();
  const existingKeys = new Set();
  existing.forEach((d) => {
    const data = d.data();
    existingKeys.add(`${data.title}__${data.dueDate}`);
  });

  let added = 0;
  let removed = 0;
  const now = Date.now();

  // Build set of keys from what MCAS currently shows
  const scrapedKeys = new Set();
  for (const item of items) {
    const dueDate = parseDate(item.dueDate);
    if (item.title && dueDate) {
      scrapedKeys.add(`${item.title}__${dueDate}`);
    }
  }

  // Remove MCAS-sourced homework no longer on the portal
  for (const snap of existing.docs) {
    const data = snap.data();
    const key = `${data.title}__${data.dueDate}`;
    if (!scrapedKeys.has(key)) {
      await colRef.doc(snap.id).delete();
      console.log(`Removed (no longer on MCAS): ${data.title} (due ${data.dueDate})`);
      removed++;
    }
  }

  for (const item of items) {
    const dueDate = parseDate(item.dueDate);
    if (!item.title || !dueDate) {
      console.log(`Skipping (missing title/date): ${JSON.stringify(item)}`);
      continue;
    }

    const dedupeKey = `${item.title}__${dueDate}`;
    if (existingKeys.has(dedupeKey)) {
      console.log(`Already exists: ${item.title} (due ${dueDate})`);
      continue;
    }

    await colRef.add({
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
    });
    const resInfo = item.resources ? ` [${item.resources.text}]` : '';
    console.log(`Added: ${item.title} — ${item.subject} (due ${dueDate}, teacher: ${item.teacher || 'N/A'})${resInfo}`);
    added++;
  }

  console.log(`Sync: ${added} new, ${removed} removed, ${items.length - added} skipped`);
}

// ── Archive old homework (7+ days past due) ─────────────────────────────
async function archiveOldHomework() {
  const colRef = fsDb.collection(`users/${FIREBASE_UID}/homework`);
  const archiveRef = fsDb.collection(`users/${FIREBASE_UID}/homeworkArchive`);
  const allDocs = await colRef.get();
  const now = new Date();
  let archived = 0;

  for (const snap of allDocs.docs) {
    const data = snap.data();
    if (!data.dueDate) continue;
    const due = new Date(data.dueDate + 'T23:59:59');
    const daysPast = (now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24);
    if (daysPast > 7) {
      await archiveRef.doc(snap.id).set({ ...data, archivedAt: Date.now() });
      await colRef.doc(snap.id).delete();
      console.log(`Archived: ${data.title} (due ${data.dueDate})`);
      archived++;
    }
  }
  if (archived > 0) console.log(`Archived ${archived} old homework items`);
}

// ── Update last-scraped timestamp ───────────────────────────────────────
async function updateLastScraped() {
  const ref = fsDb.collection('users').doc(FIREBASE_UID);
  await ref.set({ lastScrapedAt: Date.now() }, { merge: true });
}

// ── Run a full scrape cycle ─────────────────────────────────────────────
async function runScrape() {
  const ts = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' });
  console.log(`\n=== MCAS Scrape — ${ts} ===\n`);

  try {
    await archiveOldHomework();
    const items = await scrapeHomework();
    if (items.length === 0) {
      console.log('No homework items found.');
    } else {
      await syncToFirestore(items);
    }
    await updateLastScraped();
    console.log('Scrape complete!');
  } catch (err) {
    console.error('Scrape run failed:', err.message);
  }
}

// ── Read schedule from Firestore ────────────────────────────────────────
async function getScrapeTimes() {
  try {
    const snap = await fsDb.collection('users').doc(FIREBASE_UID).get();
    const data = snap.exists ? snap.data() : null;
    // Support new array format or legacy single-time field
    if (data?.scrapeTimes && Array.isArray(data.scrapeTimes) && data.scrapeTimes.length > 0) {
      return [...data.scrapeTimes].sort();
    }
    if (data?.scrapeTime) return [data.scrapeTime];
  } catch (err) {
    console.error('Failed to read scrapeTimes:', err.message);
  }
  return DEFAULT_SCRAPE_TIMES;
}

function timeToCron(time) {
  const [h, m] = time.split(':').map(Number);
  return `${m} ${h} * * *`;
}

// ── Main — Long-running scheduled service ───────────────────────────────
async function main() {
  console.log('=== MCAS Homework Scraper Service ===');
  console.log(`UID: ${FIREBASE_UID}`);

  // Run once on startup
  await runScrape();

  // Set up cron tasks for each configured time
  let currentTimes = await getScrapeTimes();
  let tasks = [];

  function scheduleTasks(times) {
    // Stop any existing tasks
    for (const t of tasks) t.stop();
    tasks = [];

    for (const time of times) {
      const expr = timeToCron(time);
      console.log(`  Scheduled: ${time} (${expr})`);
      tasks.push(cron.schedule(expr, () => runScrape(), { timezone: 'Europe/London' }));
    }
  }

  console.log(`\nScrape schedule (${currentTimes.length} times/day):`);
  scheduleTasks(currentTimes);

  // Re-check schedule every 30 min for user changes in Settings
  setInterval(async () => {
    const newTimes = await getScrapeTimes();
    const changed = JSON.stringify(newTimes) !== JSON.stringify(currentTimes);
    if (changed) {
      console.log(`\nSchedule changed: [${currentTimes.join(', ')}] -> [${newTimes.join(', ')}]`);
      currentTimes = newTimes;
      scheduleTasks(newTimes);
    }
  }, 30 * 60 * 1000);

  console.log('\nService running. Checking for schedule changes every 30 min.\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
