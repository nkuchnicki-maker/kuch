# Bettor Edge

A play-money sports pick'em app for you and your friends. No real money is
ever purchased, wagered, or redeemed — "coins" are just points for bragging
rights and weekly leaderboards.

## How it works

- You (the admin) create a login for each friend and give them a starting
  coin balance. There's no public sign-up. Each new user is credited to a
  recruiting **agent** (`OWN`, `MJ`, or `BO`) for reporting on History.
  Admin can also **delete** a user from the same table — this permanently
  erases their account and every pick/parlay/transaction they've ever made
  (confirmed with a dialog first; admins can't delete their own account).
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
3. The workflow runs every 15 minutes by default. You can also trigger it
   manually from the repo's **Actions** tab (`workflow_dispatch`).

### A note on the free tier's request budget

The Odds API's free tier gives ~500 credits/month — a much bigger paid plan
changes this math entirely (see below). Measured (not estimated) costs per
call: an odds request (h2h + spreads + totals, 1 region) is **3 credits per
sport**, a scores check is **2 credits per sport**, and a golf outrights
request is **1 credit per tournament**. With all 6 sports + 4 golf
tournaments tracked, one full sync run costs **~34 credits**
(6 × (3+2) + 4). At every 15 minutes that's ~294,000 credits/month — you
need a paid plan for this cadence; on the free tier, dial the interval
back (see below) or you'll exhaust the monthly budget fast. If you're close
to the limit:

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
to its own route (`/api/sync/live`). It only calls The Odds API for sports
that currently have a live game in your database — on a day with nothing in
progress it costs **0 credits** (just a cheap database check), so it doesn't
compound the full sync's cost when nothing's happening.

The cost only shows up during an actual live window: each check that finds
a live sport costs 5 credits (3 for odds + 2 for scores) for that sport.

#### Getting to a ~40-second refresh with only GitHub Actions

GitHub Actions can't reliably schedule a workflow more often than every 5
minutes — shorter cron intervals get silently throttled. To still get
near-continuous live odds, [`sync-live-odds.yml`](.github/workflows/sync-live-odds.yml)
fires on that 5-minute floor, but the job itself loops internally, polling
`/api/sync/live` every 40 seconds for most of that window; consecutive
5-minute runs chain together into effectively continuous ~40-second
coverage without needing any infrastructure beyond GitHub Actions.

At a 40-second interval, a single 3-hour live game costs
~270 checks × 5 credits = 1,350 credits for that one game's window — this
needs a decent credit budget (a paid Odds API plan) to run comfortably
across a whole season. To control it on a smaller budget:

- Widen the loop's `sleep 40` (and the `end=$((SECONDS + 260))` window if
  you also change the outer cron) in `sync-live-odds.yml`.
- Narrow `TRACKED_SPORTS` in `src/lib/sync.ts` to just the sport(s) you
  actually want live odds for — the live sync reuses that same list.
- Set up the GitHub Actions repo secrets (`APP_URL`, `SYNC_SECRET` — same
  values as the full sync workflow) to actually enable this cron; without
  them it simply never fires, and live games just keep the odds from
  whenever you last ran a manual/full sync.

GitHub Actions' own scheduling isn't perfectly precise even at 5 minutes
either — expect firing times to drift by a few minutes, especially on the
free tier, which is part of why the internal loop runs a little past the
nominal 5-minute mark rather than stopping exactly at it.

## Odds display and live game state

Every spread and total option now shows its price next to it (e.g. `Home
-3.5 (-110)`), not just moneyline — previously the standard -110 juice was
applied silently. See `formatAmericanOdds` in
[`src/lib/odds.ts`](src/lib/odds.ts).

Live Sports also shows the current period/clock next to the score (e.g.
`8:42 - 3rd Quarter`, `Bot 6th`) via ESPN's public scoreboard endpoint
([`src/lib/espnScores.ts`](src/lib/espnScores.ts)) — one fetch per sport
with a live game, matched to our games by team name. This is purely a
display enhancement: it's a free, unofficial, undocumented endpoint that
could change shape or go away without notice, so it's wrapped to fail
silently (the extra detail just doesn't show) rather than break the page,
and it never feeds odds, scores, or settlement — that's still all The Odds
API, unchanged.

Live Sports also auto-refreshes itself every 20 seconds
([`src/app/live-sports/LiveRefresher.tsx`](src/app/live-sports/LiveRefresher.tsx),
a small client component that calls Next's `router.refresh()` on an
interval) so scores, odds, market locks, and the game clock update on
their own — no manual reload needed. The Lines (prematch) page doesn't
auto-refresh, since nothing on it changes on a timescale where that
matters.

## Bet integrity (line movement, market locks, and the live-bet hold)

Sportsbook-style protection against betting on a number that's about to
change, all in [`src/lib/marketLock.ts`](src/lib/marketLock.ts):

- **Big-move detection.** Every sync (prematch or live) compares the
  incoming odds to what was already stored. A move counts as "big" if a
  spread or total shifts by **1.5 or more**, or a moneyline by **40 or
  more** — tune `BIG_MOVE_THRESHOLDS` if these feel too twitchy or too
  loose once this is running against real games.
- **Market locks.** A live game's line locks for **60 seconds**
  (`LOCK_DURATION_SECONDS`) whenever its score changes (a scoring play —
  the clearest possible signal a "big play" just happened) or its odds move
  big while live. Prematch big moves just get flagged
  (`lines.last_big_move_at`) for visibility — there's no lock before
  kickoff. A locked game shows a **"Market Locked"** badge on Live Sports.
- **The 10-second hold.** Placing a bet on a game that's *currently live*
  captures the line at submission, waits `BET_HOLD_SECONDS` (10s), then
  re-checks the line and lock state right before committing — long enough
  for a big play mid-processing to show up. A small move during that
  window still goes through at the originally-shown number; a big move or
  a lock rejects the bet outright (no debit). A **"Processing your
  bet…"** modal shows during the hold, resolving to **Bet Accepted** or
  **Bet Rejected** with the reason. Pre-match bets skip all of this and
  place instantly, same as always.
- **Frozen grading.** A spread/total pick or parlay leg freezes the number
  it was placed against (`spread_at_pick`/`total_at_pick`) instead of
  being graded against whatever the line says at settlement time — this is
  what makes the hold meaningful in the first place; otherwise a bet could
  survive the hold and still get re-graded against a moved number later.
  Moneyline picks already froze their odds via `potential_payout`, so they
  didn't need this.

This holds/locks parlays too: a parlay with any live leg gets held once
for the *whole* parlay (not once per leg), and every live leg is
re-verified after that single wait — one big move or lock on any leg
rejects the entire parlay, none of it partially places.

The 10-second hold runs inside a server action, which on some Vercel plans
would otherwise hit the platform's default execution timeout — `layout.tsx`
sets `export const maxDuration = 30` (route segment config applies to every
Server Action invoked from that layout, which covers the bet slip since it
lives there) to give it room.

### Closing the "stale data" gap

The lock/hold system above is *reactive* — it only kicks in once a periodic
sync (every 40s–5min for live odds) actually notices a move. That leaves a
real window: if a live game's last update was a while ago (a blowout with
nothing left to detect, garbage time, the clock just running out), someone
watching the broadcast could see the game is effectively decided and place a
"sure thing" bet before the next scheduled poll ever catches up.

To close that, placing a bet on a game that's currently `live` now forces a
**synchronous, on-demand score check** right at submission time
(`refreshLiveGameIfNeeded` in [`src/lib/sync.ts`](src/lib/sync.ts)) instead of
trusting however-stale the DB's cached status is — both right before the
10-second hold starts, and again right after it ends (catching the rarer
case where the game finishes during the hold itself). If that check finds
the game already over, the bet gets rejected outright rather than accepted
against a foregone conclusion; if it finds a fresh score change, it locks
the market the same as a normal sync would, so the same live-bet check that
would have let someone snipe a move is the thing that catches them instead.
This costs one extra Odds API call per live bet (not per poll), which is
negligible next to the sync cadence itself. If the freshness check itself
fails (API hiccup), the bet is rejected rather than silently allowed through
on unverified data — fail closed, not open.

### Other guardrails

- **One open pick per game.** Previously the "no two legs from the same
  game" rule only applied *within* a single parlay — nothing stopped
  placing two separate straight bets on the same game (e.g. spread and
  moneyline on the same side across two tickets). `hasOpenPickOnGame` in
  [`src/lib/wager.ts`](src/lib/wager.ts) now blocks placing any new
  pick/parlay leg on a game you already have a pending pick or parlay leg
  on, checked both up front (fail fast, before wasting a live bet's hold)
  and again inside the debit transaction (race-safe against two submissions
  landing at once).
- **Placement rate limit.** `enforceBetRateLimit` rejects a new pick/parlay
  if the same user placed one less than 2 seconds ago — a cheap guardrail
  against a script hammering the bet-placement actions, which is worse here
  than usual since a live bet also holds a server invocation open for 10s.
- **Voiding a postponed/cancelled game.** If a real-world game gets
  postponed or cancelled, there was previously no way to resolve picks
  already placed on it — they'd sit `pending` forever and permanently drag
  down that user's balance on every future weekly reset (pending wagers get
  subtracted from the fresh starting balance). Admin's Games table now has
  a **"Cancel/void"** button (`voidGameAction` → `voidGame` in
  [`src/lib/settle.ts`](src/lib/settle.ts)) that refunds every pending
  pick/leg on that game in full — same math as a push — and marks the game
  `cancelled`. This is manual/admin-triggered only; there's no reliable
  automatic way to tell "the league postponed this" apart from "the score
  feed just hasn't updated yet".
- **Constant-time secret check.** The three `/api/*` routes gated by
  `SYNC_SECRET` now compare it with `crypto.timingSafeEqual`
  ([`src/lib/apiAuth.ts`](src/lib/apiAuth.ts)) instead of `!==`, removing a
  (low-value, but free-to-fix) timing side channel.

## Casino (blackjack, roulette, baccarat) — and the house edge

A separate tab (blocked for agent-only accounts, same as Lines/Live
Sports/My Picks) with three instantly-resolved games — no pending state,
each round debits the wager and settles in one action. Logic lives in
[`src/lib/casino/`](src/lib/casino/); server actions in
[`src/app/casino/actions.ts`](src/app/casino/actions.ts).

**This is deliberately rigged.** Every round rolls a `CASINO_HOUSE_EDGE`
chance (currently 0.35 — see below for why that number and not 0.7) of
forcing the round to NOT be a player win, resolved through each game's
real rules rather than a hand-picked fake result:

- **Roulette**: on a forced round, the wheel is redrawn until it lands on
  a number that doesn't match the bet (standard payouts: 35:1 straight
  number, 1:1 on red/black/even/odd/high/low).
- **Baccarat**: has zero player decisions in real life, so a forced round
  just replays full random hands under the real player/banker draw-rule
  table until one doesn't match the bet — the hand that ships is always a
  genuine one, just resampled. (Standard rules: Banker bet pays 1.95:1
  after 5% commission, Player 1:1, Tie 8:1, and a Tie voids/pushes a
  Player or Banker bet rather than losing it.)
- **Blackjack** is the one with real player decisions (hit/stand), so it
  can't be resampled after the fact — instead, on a forced round the
  dealer's initial deal is completely fair (naturals are never
  suppressed), but if the player doesn't bust, the dealer keeps hitting
  past the normal "stand at 17" rule specifically to catch up to and beat
  the player's total (still fair/random cards otherwise, and this never
  makes the dealer bust more than the real rules already would). Hand
  state (both hands, the wager, and the forced-round flag) travels between
  deal/hit/stand as an AES-256-GCM encrypted token
  ([`src/lib/casino/handToken.ts`](src/lib/casino/handToken.ts)) — signing
  alone wouldn't be enough, since a signed-but-plaintext token would let
  anyone read the forced-round flag straight out of devtools.

**Why `CASINO_HOUSE_EDGE = 0.35` and not `0.7`.** The "force a non-win"
roll isn't the same number as the final observed house win rate, because
each game still applies real odds in the non-forced branch, and real
casino games already favor the house even before rigging anything — the
two effects compound. Simulating both ways: setting the constant literally
to 0.7 overshoots to roughly an **85-90%** house win rate; 0.35 was reverse
-engineered by simulation to land the actual observed rate at the intended
**~70% house / ~30% player** for typical bets (outside roulette bets,
banker in baccarat, ordinary blackjack play). Long-shot bets (a straight
roulette number, a baccarat tie) end up even harder than that — same
mechanism compounding on already-worse real odds, which is the *correct*
direction (a riskier bet should still pay out less often than a safer one,
even in a rigged casino; forcing every bet type to the same flat win rate
regardless of real odds would make the highest-payout longshot bets the
obviously correct move, not the trap they're supposed to be).

None of this is disclosed in the UI — the whole point was a hidden house
edge — but it's fully documented here and in code comments for whoever's
maintaining it. To change the target, adjust `CASINO_HOUSE_EDGE` in
[`src/lib/casino/rig.ts`](src/lib/casino/rig.ts) and re-verify with a
simulation rather than assuming the constant equals the outcome.

Every round is also capped at `MAX_CASINO_WAGER` (currently $100) per
hand/spin/deal, enforced server-side in
[`src/app/casino/actions.ts`](src/app/casino/actions.ts) — the wager
inputs also set an HTML `max` attribute to match, but that's just a UI
hint; only the server-side check is actually load-bearing.

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

An account that's an agent but *not* an admin gets a stripped-down nav —
just **Leaderboard**, **History**, and **Users**. Lines, Live Sports, My
Picks, and Admin are hidden, and navigating to those URLs directly
redirects to `/users` (the pick-placement server actions reject agent-only
accounts too, so this isn't just a hidden link). Admins keep full access to
everything regardless of whether they're also flagged as an agent.

An agent *can* tune **min balance** for their own recruited users (same
"Set min balance" form Admin has), but a few things stay admin-only even
though agents can see this page:

- **Grant or adjust free play** — only the admin can (shows "—" instead of
  a form for agent viewers on every row, not just other agents' recruits).
- **Tune min balance for someone else's recruits** — an agent adjusting a
  user outside their own agent code gets "—" instead of a form, same as
  free play; admins can adjust anyone's.
- **Pick a new player's recruiting agent, or grant "Is agent"** — the "Add
  a new player" form on this page is a trimmed-down version of Admin's
  "Create a new user" (no email needed, same as Admin): a non-admin agent's
  new player is automatically recruited under that agent's own code, and
  they can't flag the account they're creating as an agent itself — both
  stay admin-only decisions, enforced server-side even if someone tampered
  with the request.

Flag an account as an agent from the **"Agent access"** column on the Admin
users table, or the "Is agent" checkbox when creating a new user — it's
independent of `is_admin` and of which agent code *recruited* that account.

## History

Admin (and agents) have a **History** page (`/history`) listing every
user's balance at the end of each past, already-reset week. A dropdown
picks which week to view, defaulting to the most recent, and clicking a
column header (name/balance/net) sorts within that week. The week still in
progress isn't included here since it's already visible on the Leaderboard.

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
