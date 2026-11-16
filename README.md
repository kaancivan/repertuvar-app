# Personal Guitar & Bass Repertoire

Minimalist, mobile-first guitar and bass chord sheet application built with **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, **Prisma ORM**, and **Neon PostgreSQL**.

## Features

- **Zero-Friction PIN Gatekeeper:** Protected by `APP_PIN` with Next.js Edge Middleware and an HTTP-only HMAC-SHA256 signed cookie (`maxAge: 30 days`).
- **Real-Time Music Theory Engine (`src/lib/transpose.ts`):**
  - Line-level chord-density heuristics distinguish chord lines from lyrics (so words like `"A"`, `"Am"`, or `"E"` inside Turkish/English prose are untouched).
  - Direct half-step transposition (`-11` to `+11`) with clean enharmonic spelling and column-preserving spacing above syllables.
  - Saves `transposeOffset` per song in the database.
- **Dual-Source Song Importer (`/add` & `/api/scrape`):**
  - Search & URL fetcher supporting `repertuarim.com`, `ultimate-guitar.com`, and generic chord pages while stripping ads, sidebars, and clutter.
  - Automatic switch to the **Smart Paste** fallback tab when a site blocks scraping via Cloudflare/bot protection.
  - Supports chord-over-lyric raw text and `[Am]Lyrics` inline bracket format with spacing normalization.
- **Live Playing Mode (`/songs/[id]`):**
  - Deep Anthracite / Slate dark theme with bold turquoise (`#2DD4BF`) chords in **JetBrains Mono**.
  - Collapsible sticky top control bar + **Hide Bar (Fullscreen)** toggle.
  - Smooth `requestAnimationFrame` auto-scroll (`1x`–`5x`) that pauses automatically on manual touch/wheel interaction.
  - **Screen Wake Lock API** support so your phone screen never dims while playing.

## Local Development

```bash
npm install
npx prisma generate
npm run dev
```

Copy `.env.example` to `.env` and configure:
- `DATABASE_URL`: Your Neon PostgreSQL connection string (`?sslmode=require`). When left as the example placeholder, the app uses a local `.data/repertoire.json` store for zero-config previewing.
- `APP_PIN`: Your personal 4–6 digit PIN or password (defaults to `1234` locally).

## Neon Database & Vercel Deployment

1. Create a PostgreSQL database on **Neon** and copy the connection string.
2. Push the Prisma schema to Neon:
   ```bash
   npx prisma db push
   ```
3. Push this repository to GitHub and import into **Vercel**.
4. Set `DATABASE_URL`, `APP_PIN`, and `SESSION_SECRET` in Vercel Environment Variables.
5. `package.json` includes `"postinstall": "prisma generate"`, so Vercel builds automatically.
