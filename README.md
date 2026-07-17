# Bettor Edge

A play-money sports pick'em app for you and your friends. No real money is
ever purchased, wagered, or redeemed — "coins" are just points for bragging
rights and weekly leaderboards.

## How it works

- You (the admin) create a login for each friend and give them a starting
  coin balance. There's no public sign-up.
- Games and lines (spread/total/moneyline) can be added manually in Admin,
  or pulled in automatically from a live odds feed (see below).
- Friends log in, place picks against the lines using their coins, and see
  a social feed + weekly leaderboard.
- When a game finishes, its pending picks are settled automatically
  (win/loss/push) and balances update — either via the live score sync, or
  by you entering the final score in Admin.

Login is a simple email/password system built into the app itself
(bcrypt-hashed passwords, signed session cookies) — no third-party auth
provider involved.

## One-time setup

### 1. Create a free Vercel Postgres database

Since we're already deploying on Vercel, the database is provisioned from
the same dashboard — one account instead of two separate signups.

1. Go to [vercel.com](https://vercel.com) and create a free account (or log in).
2. From your dashboard, go to the **Storage** tab → **Create Database** →
   choose **Postgres** (powered by Neon) → pick a region → create it.
3. Once created, open the database's **`.env.local`** tab and copy the
   `POSTGRES_URL` value (or sometimes labeled `DATABASE_URL`).

### 2. Configure environment variables

Open `.env.local` in the project root and set:

```
DATABASE_URL=postgres://... (the value you copied above)
SESSION_SECRET=some-random-string-you-make-up
```

(`SESSION_SECRET` signs login cookies — generate one with `openssl rand -hex 32`
or any password generator. `.env.local` is already gitignored, so none of
this gets committed.)

### 3. Run the database schema

With `DATABASE_URL` set, run the schema against your new database. Easiest
way: install [Vercel CLI](https://vercel.com/docs/cli) or just paste the
contents of [`db/schema.sql`](db/schema.sql) into the **Query** tab in the
Vercel Storage dashboard for your database and run it. This creates all the
tables and the weekly leaderboard view.

### 4. Create your admin account

There's no dashboard to hand-create the first user, so a small script does it:

```bash
npm install
node scripts/create-admin.mjs you@example.com your-password yourname "Your Name"
```

This creates the first user as an admin with 1000 starting coins. Everyone
after this gets created through the app's Admin page instead.

## Running locally

```bash
npm run dev
```

Visit `http://localhost:3000` and log in with the admin account you just created.

## Deploying for free

1. Push this project to a GitHub repo.
2. Go to your Vercel dashboard, import the repo, and add the same
   environment variables from `.env.local` in the Vercel project settings
   (if you created the Postgres database in the same Vercel project, the
   `DATABASE_URL`/`POSTGRES_URL` variable may already be linked automatically).
3. Deploy — you'll get a free `yourapp.vercel.app` URL.

## Adding live odds (optional)

Games and lines can auto-populate from [The Odds API](https://the-odds-api.com)
instead of manual entry, and finished games auto-settle from live scores.

### Setup

1. Sign up for a free account at [the-odds-api.com](https://the-odds-api.com)
   and grab your API key from the dashboard.
2. In `.env.local`, set:
   ```
   ODDS_API_KEY=your-odds-api-key
   SYNC_SECRET=some-random-string-you-make-up
   ```
   (`SYNC_SECRET` just needs to be hard to guess — it stops random people
   from triggering syncs on your deployed URL. Generate one with
   `openssl rand -hex 32` or any password generator.)
3. In Admin, click **"Sync live odds now"** — this pulls NFL & NBA games/
   lines from The Odds API and settles any games that have finished.
4. To track different or more sports, edit `TRACKED_SPORTS` in
   [`src/lib/sync.ts`](src/lib/sync.ts) — sport keys are listed at
   `https://api.the-odds-api.com/v4/sports?apiKey=YOUR_KEY`.

### Automating it (so you don't have to click the button)

The free Vercel plan only runs its own cron jobs once a day, which is too
slow for game-day updates. Instead, this repo includes a GitHub Actions
workflow ([`.github/workflows/sync-odds.yml`](.github/workflows/sync-odds.yml))
that pings your deployed app on a schedule — GitHub Actions' free tier
easily covers this.

To enable it:

1. Push this repo to GitHub and deploy it (see "Deploying for free" above).
2. In the GitHub repo, go to **Settings → Secrets and variables → Actions**
   and add two repo secrets:
   - `APP_URL` — your deployed URL, e.g. `https://yourapp.vercel.app`
   - `SYNC_SECRET` — the same value you put in `.env.local` / Vercel's env vars
3. The workflow runs every 30 minutes by default. You can also trigger it
   manually from the repo's **Actions** tab (`workflow_dispatch`).

### A note on the free tier's request budget

The Odds API's free tier gives ~500 credits/month, and each odds request
costs roughly 1 credit per market per region requested (this app requests
3 markets — h2h, spreads, totals — in 1 region, so ~3 credits per sport per
sync, plus a smaller cost for the scores check). Sync-ing 2 sports every 30
minutes adds up fast over a month, so if you're close to the limit:

- Widen the cron interval in `sync-odds.yml` (e.g. hourly: `0 * * * *`, or
  every few hours in the off-season).
- Track fewer sports in `TRACKED_SPORTS`.
- Check your actual usage on the-odds-api.com's dashboard and tune from there.

True second-by-second "live" in-play odds aren't realistic on the free
tier — this gets you periodic (e.g. half-hourly) line and score updates,
which is enough for pre-game picks and same-day settlement. Manually
entered lines remain available in Admin any time, with no API cost at all.
