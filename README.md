# Homework Hub

A self-hosted Progressive Web App (PWA) for tracking school homework and daily learning portal check-ins. Designed for parents and students who use [MCAS (MyChildAtSchool)](https://www.mychildatschool.com/) as their school's homework platform.

## Features

### Homework Tracking
- **Automatic scraping** from MCAS — homework titles, subjects, teachers, due dates, and resource files are pulled automatically on a configurable schedule
- **Due date badges** with colour-coded urgency (overdue, today, upcoming)
- **Subject colour strips** for quick visual scanning
- **Resource file downloads** — PDFs, documents, and other attachments are downloaded and served locally
- **Completion tracking** — mark homework as done with a tap
- **Auto-cleanup** — homework removed from MCAS is automatically deleted; items 7+ days past due are archived

### Learning Portal Check-ins
- **Configurable portals** — add any learning portal (Sparx Maths, Seneca, Educake, etc.) with custom icons and URLs
- **One-tap access** — opens the portal in a new tab and immediately marks it as checked
- **Keyword filtering** — only show portals relevant to current homework (e.g. Sparx Maths only appears when maths homework is set)
- **Daily tracking** — "Checked X / Y portals today" with automatic midnight reset
- **Stored credentials** — optional username/password storage with copy-to-clipboard buttons
- **Deep links** — optional direct URLs that skip landing pages

### Security & Parental Controls
- **Parent PIN lock** — settings are protected behind a numeric PIN
- **PIN-protected reset** — reset today's portal checks from the dashboard with PIN verification
- **Audit logging** — optional detailed logging of all portal taps, settings changes, and resets
- **Firestore security rules** — each user can only access their own data

### PWA
- **Installable** — add to home screen on any device
- **Offline-capable** — service worker with Workbox for caching
- **Pull-to-refresh** — pull down on mobile to reload
- **Responsive** — works on phones, tablets, and desktops

## Architecture

```
homework-hub/
├── src/                    # React + TypeScript PWA (Vite)
├── scraper/                # Node.js MCAS scraper (Playwright)
├── Dockerfile              # Web app: nginx serving the built PWA
├── docker-compose.yml      # Orchestrates web app + shared resource volume
└── scraper/Dockerfile      # Scraper: Playwright in headless Chromium
```

**Web app** — React 19, TypeScript, Vite, Firebase Auth + Firestore, served by nginx in Docker.

**Scraper** — Headless Chromium (Playwright) logs into MCAS on a cron schedule, extracts homework, downloads resource files, and syncs to Firestore via Firebase Admin SDK.

**Resource files** — Downloaded by the scraper into a shared Docker volume, served by nginx at `/resources/`.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- A [Firebase](https://console.firebase.google.com/) project (free Spark plan is sufficient)
- An MCAS parent account

## Setup

### 1. Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project
2. Enable **Authentication** with Email/Password sign-in
3. Enable **Cloud Firestore** and create a database
4. Deploy the security rules from `firestore.rules`:
   ```bash
   # Install Firebase CLI if you haven't
   npm install -g firebase-tools
   firebase login
   firebase init firestore  # select your project
   firebase deploy --only firestore:rules
   ```
5. Go to **Project Settings > General** and copy your web app Firebase config values
6. Go to **Project Settings > Service Accounts** and generate a new private key (JSON file)

### 2. Environment Variables

**Web app** — copy and fill in `.env`:
```bash
cp .env.example .env
```

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

**Scraper** — copy and fill in `scraper/.env`:
```bash
cp scraper/.env.example scraper/.env
```

```env
MCAS_EMAIL=parent@example.com
MCAS_PASSWORD=your-mcas-password
FIREBASE_UID=your-firebase-user-uid
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json

# Optional — only needed for multi-child / multi-school accounts:
MCAS_CHILD_NAME=
MCAS_SCHOOL_NAME=
```

Place the Firebase service account JSON key at `scraper/serviceAccountKey.json`.

> **Finding your Firebase UID:** Sign up in the app first, then find your UID in the Firebase Console under Authentication > Users.

> **Multi-child accounts:** If your MCAS login has more than one child or school, set `MCAS_CHILD_NAME` and/or `MCAS_SCHOOL_NAME` to match the text shown on the MCAS contact selection page (case-insensitive, partial match). If you're not sure what to put, leave them blank and run the scraper once — it will log all available options.

### 3. Build and Run

```bash
# Build and start the web app
docker compose build
docker compose up -d

# Build and start the scraper (in a separate container)
cd scraper
docker build -t homework-scraper .
docker run -d \
  --name homework-scraper \
  --restart unless-stopped \
  -v $(pwd)/.env:/app/.env:ro \
  -v $(pwd)/serviceAccountKey.json:/app/serviceAccountKey.json:ro \
  -v $(pwd)/resources:/app/resources \
  homework-scraper
```

The web app will be available at `http://localhost:8080`.

### 4. Share Resource Files

The scraper downloads homework resource files to `scraper/resources/`. These need to be accessible to the web app's nginx container. The `docker-compose.yml` mounts `./scraper/resources` into nginx at `/usr/share/nginx/html/resources/`.

### 5. First Login

1. Open the app and create an account with email/password
2. Copy your Firebase UID from the Firebase Console and add it to `scraper/.env`
3. Restart the scraper container
4. Set a parent PIN when prompted (protects settings)
5. Configure your portals in Settings > Manage Portals

## Configuration

### Scrape Schedule

Default scrape times are **15:30**, **18:00**, and **21:00** (Europe/London timezone). Change these in the app under Settings > Homework scrape times. The scraper checks for schedule changes every 30 minutes.

### Portal Keywords

Each portal can have comma-separated keywords (e.g. `maths, math`). When set, the portal only appears on the dashboard if any pending homework's subject or title matches a keyword. Leave keywords empty to always show the portal.

### Portal Credentials

Optionally store login credentials for each portal. These are displayed with copy-to-clipboard buttons when the key icon is tapped on a portal card.

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Lint
npm run lint
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | React 19, TypeScript, Vite |
| Styling | Vanilla CSS with CSS variables |
| Auth & Database | Firebase Auth + Cloud Firestore |
| PWA | vite-plugin-pwa + Workbox |
| Scraper | Playwright (headless Chromium) |
| Scheduling | node-cron |
| Drag & Drop | @dnd-kit |
| Dates | Luxon |
| Hosting | Docker + nginx |

## License

MIT
