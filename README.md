# Bettor Edge

A play-money sports pick'em app for you and your friends. No real money is
ever purchased, wagered, or redeemed — "coins" are just points for bragging
rights and weekly leaderboards.

## How it works

- You (the admin) create a login for each friend and give them a starting
  coin balance. There's no public sign-up. Each new user is credited to a
  recruiting **agent** (`OWN`, `MJ`, or `BO`) for reporting on History.
- Games and lines (spread/total/moneyline) can be added manually in Admin,
  or pulled in automatically from a live odds feed (see below).
- Friends log in, place picks against the lines using their coins, and see
  a social feed + weekly leaderboard.
- When a game finishes, its pending picks are settled automatically
  (win/loss/push) and balances update — either via the live score sync, or
  by you entering the final score in Admin.
- Picks from different games can be combined into a parlay using the
  floating bet slip on the Lines page ("+ Parlay" next to any option) — all
  legs must win for it to pay out, at the combined odds. A parlay only
  settles once every one of its legs' games has finished, even if that
  takes days.
- Every Sunday at midnight Eastern time, everyone's balance resets to their
  starting amount (everyone starts at $0 by default) and the leaderboard
  starts fresh for a new week (see "Weekly reset" below). Admin also has a
  manual "Reset week now" button for testing or an early reset.
- Since everyone starts at $0, wagers naturally take a balance negative
  until a win brings it back up. Each person has a per-user **min balance**
  floor (default -$200) that blocks any new pick that would push them past
  it — see "Minimum balance" below.
- Admin has a **History** page showing every user's balance at the end of
  each past week, sortable by date/name/balance/net — see "History" below.
- Admins and flagged **agent** accounts can view the **Users** page to grant
  **free play** — a separate spendable currency, tracked outside the normal
  balance — see "Free play" below.

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

If you're updating an existing database rather than starting fresh, you
only need to run the files in [`db/migrations/`](db/migrations) (in order)
instead of the full `schema.sql` — each one only adds what's new since the
last release.

### 4. Create your admin account

There's no dashboard to hand-create the first user, so a small script does it:

```bash
npm install
node scripts/create-admin.mjs you@example.com your-password yourname "Your Name"
```

This creates the first user as an admin with a $0 starting balance (same as
everyone else). Everyone after this gets created through the app's Admin
page instead.

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
3. In Admin, click **"Sync live odds now"** — this pulls games/lines for
   NFL, NCAAF, NBA, NCAAB, MLB, and NHL from The Odds API, plus the current
   golf majors (Masters, US Open, PGA Championship, The Open), and settles
   any two-team games that have finished.
4. To track different or fewer sports, edit `TRACKED_SPORTS` (two-team
   sports) or `GOLF_TOURNAMENTS` (outright/golf events) in
   [`src/lib/sync.ts`](src/lib/sync.ts) — sport keys are listed at
   `https://api.the-odds-api.com/v4/sports?apiKey=YOUR_KEY`.

### Golf works differently

Golf is a whole field of players competing for one winner, not two teams —
so instead of a spread/total/moneyline, players place an "outright" pick on
one player to win the tournament. Golf events never auto-settle from a
score sync (there's no such thing as a live score for "who wins the
tournament"); in Admin, pick the champion from a dropdown once the
tournament finishes, and every pick naming that player is settled as a win.

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
3. The workflow runs twice a day (noon and 8pm) by default. You can also
   trigger it manually from the repo's **Actions** tab (`workflow_dispatch`).

### A note on the free tier's request budget

The Odds API's free tier gives ~500 credits/month. Measured (not estimated)
costs per call: an odds request (h2h + spreads + totals, 1 region) is
**3 credits per sport**, a scores check is **2 credits per sport**, and a
golf outrights request is **1 credit per tournament**. With all 6 sports +
4 golf tournaments tracked, one full sync run costs **~34 credits**
(6 × (3+2) + 4). Twice a day already exceeds the monthly free budget
(60 runs × 34 = 2,040 credits vs. 500 available) — you'll likely exhaust
the free tier well before the month resets. If you're close to the limit:

- Widen the cron interval further in `sync-odds.yml` (e.g. once every 2-3
  days keeps you within budget with everything tracked).
- Track fewer sports in `TRACKED_SPORTS` — dropping to 1-2 sports lets you
  sync much more often within the same budget.
- Use the **"Sync live odds now"** button in Admin for on-demand refreshes
  any time — same shared budget, but at least it's your choice when to spend it.
- Check your actual usage on the-odds-api.com's dashboard and tune from there.
- Upgrade to a paid The Odds API plan (see [the-odds-api.com/pricing](https://the-odds-api.com/pricing))
  for a much bigger credit budget if you want both broad sport coverage and
  frequent syncing — that's a purchase you make directly on their site.

Manually entered lines remain available in Admin any time, with no API
cost at all.

## Live (in-play) betting

Games that have started aren't locked out — they show up on the Lines page
with a **LIVE** badge and current score, and picks/parlays can still be
placed against them using whatever odds were last synced.

Keeping those odds genuinely fresh during a live game uses a **second,
separate, more frequent sync** — [`syncLiveOdds`](src/lib/sync.ts) — wired
to its own route (`/api/sync/live`) and cron
([`.github/workflows/sync-live-odds.yml`](.github/workflows/sync-live-odds.yml),
every 10 minutes by default). It only calls The Odds API for sports that
currently have a live game in your database — on a day with nothing in
progress it costs **0 credits** (just a cheap database check), so it doesn't
compound the twice-daily full sync's cost when nothing's happening.

The cost only shows up during an actual live window: each check that finds
a live sport costs 5 credits (3 for odds + 2 for scores) for that sport.
At a 10-minute interval, a single 3-hour game (e.g. an MLB game) means
~18 checks × 5 credits = 90 credits for that one game's window — and that's
on top of whatever the twice-daily full sync is already using. If you track
sports with games most days (MLB in season, for example), this adds up fast
on the free tier. To control it:

- Widen `*/10 * * * *` to something like every 20-30 minutes in
  `sync-live-odds.yml`.
- Narrow `TRACKED_SPORTS` in `src/lib/sync.ts` to just the sport(s) you
  actually want live odds for — the live sync reuses that same list.
- Set up the GitHub Actions repo secrets (`APP_URL`, `SYNC_SECRET` — same
  values as the full sync workflow) to actually enable this cron; without
  them it simply never fires, and live games just keep the odds from
  whenever you last ran a manual/full sync.
- A paid Odds API plan removes the pressure entirely if you want tight,
  frequent live updates across several sports at once.

GitHub Actions' own scheduling isn't perfectly precise at short intervals
either — expect firing times to drift by a few minutes, especially on the
free tier.

## Weekly reset

Every user's `coin_balance` snaps back to their `starting_balance` (set when
they were created in Admin) at the first check after Sunday midnight
**America/New_York** — not a fixed UTC offset, so this stays correct
automatically across the EST/EDT switch twice a year (see
[`src/lib/weeklyReset.ts`](src/lib/weeklyReset.ts)).

This is wired to [`.github/workflows/reset-week.yml`](.github/workflows/reset-week.yml),
polling `/api/reset-week` every 15 minutes, every day. That sounds
wasteful, but the route is a single cheap database check the rest of the
week — no external API calls at all — so polling it constantly costs
nothing. It only actually performs the reset once, on the first poll that
lands on a Sunday (checked via a `weekly_reset` marker in
`coin_transactions`, so it's safe to poll as often as you want without
double-resetting).

Nothing about picks, parlays, or their history gets deleted — every
transaction ever recorded stays in `coin_transactions` forever, including
the reset itself (so "how much did I win last week" is always
reconstructable later even though there's no dedicated history page for
it yet). A pick or parlay still pending exactly at the reset boundary
(realistically only a very late Sunday Night Football game) carries over
properly instead of being forgiven: the reset subtracts whatever's still
tied up in pending wagers from the fresh starting balance, so when that
pick later settles, its win/loss/push lands against the new week exactly
like any other pick — a loss really does cost you, a win nets out to the
right profit, and it's possible to start a week negative if you had a big
bet outstanding.

Admin also has a **"Reset week now"** button for triggering this on demand
(testing, or wanting to start a new week early) — same underlying reset,
just without the day-of-week gating.

## Minimum balance

Everyone starts each week at **$0** by default (set in Admin's "Create a new
user" form, or per-user's `starting_balance`), so placing a pick takes a
balance negative right away — it only comes back up on a win. To stop that
from spiraling, every user has a `min_balance` floor (default **-$200**):
any pick or parlay that would drop their balance past it is rejected before
it's placed, with a message telling them their limit.

The floor is per-user, not global — each manager can set a different limit
for each friend from the **"Set min balance"** column on the Admin users
table (e.g. -200 for one friend, -500 for another). It only blocks *placing*
new wagers; it doesn't retroactively clamp a balance that dips lower from a
pending bet settling as a loss (same as the weekly-reset carryover above —
a big enough outstanding bet can still leave someone past their floor once
it resolves).

## Free play

Free play is a separate currency from `coin_balance` — a manager can grant
it to a user (e.g. as a promo), and the user can wager it just like real
coins. It settles differently, though: since a free-play stake was never
real money,

- a **win** only turns the *profit* (payout minus the free stake) into real
  `coin_balance` — the free stake itself doesn't get added on top
- a **loss** doesn't touch `coin_balance` at all (nothing real was risked),
  and the spent free play doesn't come back
- a **push** refunds the stake back to `free_play` (not `coin_balance`)

For example, a $110 free-play bet at -110 odds that wins adds $100 to the
real balance (not $210); if it loses, the balance doesn't move at all.

Free play never resets automatically (it carries over week to week, unlike
`coin_balance`) — it only changes when a manager grants/adjusts it or a
free-play pick settles. A "Use free play" checkbox appears next to a pick's
wager field whenever the signed-in user has a free-play balance above $0.

### Users page and agent accounts

The **Users** page (`/users`) is visible to admins and any account flagged
**"Is agent"** in Admin. Everyone who can see the page sees *every* user's
balance from the last completed week (reusing the same data as History)
and current free play — visibility isn't restricted by agent code.

Two things *are* still scoped to an agent's own recruits (users where
`agent` matches the agent's own agent code):

- **Adjusting free play** — an agent can only grant/adjust free play for
  their own recruited users (shows "—" instead of a form for anyone else's
  row); admins can adjust anyone's.
- **Adding a new player** — the "Add a new player" form on this page is a
  trimmed-down version of Admin's "Create a new user" (no email needed,
  same as Admin): a non-admin agent's new player is automatically recruited
  under that agent's own code, and they can't grant "Is agent" to the
  account they're creating — both stay admin-only decisions, enforced
  server-side even if someone tampered with the request.

Flag an account as an agent from the **"Agent access"** column on the Admin
users table, or the "Is agent" checkbox when creating a new user — it's
independent of `is_admin` and of which agent code *recruited* that account.

## History

Admin has a **History** page (`/history`) listing every user's balance at
the end of each past, already-reset week — click any column header
(week/name/balance/net) to sort. The week still in progress isn't included
here since it's already visible on the Leaderboard.

There's no separate history table for this — it's reconstructed entirely
from the `coin_transactions` audit log at request time: since every weekly
reset writes the same timestamp for every user in one transaction, those
distinct timestamps are the week boundaries, and a user's balance right
before any boundary is just their current balance minus everything that
happened at or after it (see [`src/lib/history.ts`](src/lib/history.ts)).

The page also shows an **all-time total** ticker (net across every
completed week, everyone combined) and a **By agent** breakdown — one card
per recruiting agent, each showing that agent's all-time net (summed from
the same per-week net figures in the table below) and their recruited
users' current balances.
