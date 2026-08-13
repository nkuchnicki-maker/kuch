import "server-only";
import type { Pool } from "pg";
import { americanToDecimal } from "./odds";

type Outcome = "win" | "loss" | "push";

// Pure win/loss/push logic for a two-team matchup pick, shared by straight
// picks and parlay legs. Returns null if the line is missing the field
// needed to grade this pick type (shouldn't happen in practice).
//
// hasDrawOption marks a soccer-style 3-way moneyline (the line had a real
// Draw price at pick time) — a tie there is a genuine "draw" outcome with
// its own price, not a push: home/away lose outright, and "draw" itself
// becomes a winnable pick_side. Every other sport keeps the old push-on-tie
// 2-way behavior (rare, but possible — e.g. an NFL tie).
export function determineMatchupOutcome(
  pickType: string,
  pickSide: string,
  spread: number | null,
  total: number | null,
  homeScore: number,
  awayScore: number,
  hasDrawOption = false,
): Outcome | null {
  if (pickType === "spread" && spread != null) {
    const adjustedHome = homeScore + spread;
    if (adjustedHome === awayScore) return "push";
    if (pickSide === "home") return adjustedHome > awayScore ? "win" : "loss";
    return adjustedHome < awayScore ? "win" : "loss";
  }
  if (pickType === "total" && total != null) {
    const sum = homeScore + awayScore;
    if (sum === total) return "push";
    if (pickSide === "over") return sum > total ? "win" : "loss";
    return sum < total ? "win" : "loss";
  }
  if (pickType === "moneyline") {
    if (hasDrawOption) {
      if (homeScore === awayScore) return pickSide === "draw" ? "win" : "loss";
      if (pickSide === "draw") return "loss";
      if (pickSide === "home") return homeScore > awayScore ? "win" : "loss";
      return awayScore > homeScore ? "win" : "loss";
    }
    if (homeScore === awayScore) return "push";
    if (pickSide === "home") return homeScore > awayScore ? "win" : "loss";
    return awayScore > homeScore ? "win" : "loss";
  }
  return null;
}

// Outright events (e.g. golf) have no push case at this level — a tie
// isn't possible once a single champion is declared.
export function determineOutrightOutcome(
  pickSide: string,
  winnerName: string,
): "win" | "loss" {
  return pickSide === winnerName ? "win" : "loss";
}

async function creditOutcome(
  db: Pool,
  entity: {
    id: string;
    user_id: string;
    wager: string;
    potential_payout: string;
    is_free_play: boolean;
    stake_debited: boolean;
  },
  outcome: "win" | "push",
  kind: "pick" | "parlay",
) {
  const relatedColumn = kind === "pick" ? "related_pick_id" : "related_parlay_id";

  if (entity.is_free_play) {
    // Free play stake was never real money: a push just gives the same
    // free-play stake back (not real coins), and a win only turns the
    // profit — payout minus the free stake — into real coin_balance. A
    // loss is already a no-op at the call site, same as real-money picks.
    if (outcome === "push") {
      await db.query("update users set free_play = free_play + $1 where id = $2", [
        entity.wager,
        entity.user_id,
      ]);
      return;
    }
    const profit = Number(entity.potential_payout) - Number(entity.wager);
    if (profit <= 0) return;
    await db.query(
      `insert into coin_transactions (user_id, amount, reason, ${relatedColumn})
       values ($1, $2, 'fp_payout', $3)`,
      [entity.user_id, profit, entity.id],
    );
    await db.query("update users set coin_balance = coin_balance + $1 where id = $2", [
      profit,
      entity.user_id,
    ]);
    return;
  }

  // stake_debited=false means the stake was never taken out of coin_balance
  // at placement (see reserveWager in wager.ts) — so a push needs no
  // refund (nothing to give back) and a win pays out profit only (the
  // stake is still sitting in the balance, untouched). stake_debited=true
  // rows are the old model, grandfathered in: still get the full amount.
  if (!entity.stake_debited) {
    if (outcome === "push") return;
    const profit = Number(entity.potential_payout) - Number(entity.wager);
    if (profit <= 0) return;
    await db.query(
      `insert into coin_transactions (user_id, amount, reason, ${relatedColumn})
       values ($1, $2, 'pick_payout', $3)`,
      [entity.user_id, profit, entity.id],
    );
    await db.query("update users set coin_balance = coin_balance + $1 where id = $2", [
      profit,
      entity.user_id,
    ]);
    return;
  }

  const amount = outcome === "win" ? entity.potential_payout : entity.wager;
  const reason = outcome === "win" ? "pick_payout" : "pick_refund";

  await db.query(
    `insert into coin_transactions (user_id, amount, reason, ${relatedColumn})
     values ($1, $2, $3, $4)`,
    [entity.user_id, amount, reason, entity.id],
  );
  await db.query(
    "update users set coin_balance = coin_balance + $1 where id = $2",
    [amount, entity.user_id],
  );
}

// Takes the stake at settlement time for a pick/parlay that lost without
// ever having it debited at placement (see reserveWager) — a no-op for
// free play (its stake was already spent from free_play at placement, per
// debitFreePlay) or for stake_debited=true rows (old model: already gone).
async function debitOnLoss(
  db: Pool,
  entity: { id: string; user_id: string; wager: string; is_free_play: boolean; stake_debited: boolean },
  kind: "pick" | "parlay",
) {
  if (entity.is_free_play || entity.stake_debited) return;

  const relatedColumn = kind === "pick" ? "related_pick_id" : "related_parlay_id";
  await db.query(
    `insert into coin_transactions (user_id, amount, reason, ${relatedColumn})
     values ($1, $2, 'pick_loss', $3)`,
    [entity.user_id, -Number(entity.wager), entity.id],
  );
  await db.query("update users set coin_balance = coin_balance - $1 where id = $2", [
    Number(entity.wager),
    entity.user_id,
  ]);
}

// If every leg of a parlay has now been graded (win/loss/push), compute
// its final outcome and credit/debit the user. No-ops if legs are still
// pending (e.g. other legs are on games that haven't finished yet) or if
// the parlay was already settled.
async function trySettleParlay(db: Pool, parlayId: string) {
  const { rows: parlays } = await db.query<{
    id: string;
    user_id: string;
    wager: string;
    status: string;
    is_free_play: boolean;
    stake_debited: boolean;
  }>(
    "select id, user_id, wager, status, is_free_play, stake_debited from parlays where id = $1",
    [parlayId],
  );
  const parlay = parlays[0];
  if (!parlay || parlay.status !== "pending") return;

  const { rows: legs } = await db.query<{ status: string; odds: number }>(
    "select status, odds from parlay_legs where parlay_id = $1",
    [parlayId],
  );

  // A single lost leg dooms the whole parlay no matter what the other legs
  // are doing — settle it as a loss immediately instead of leaving it
  // pending for however long it takes the rest of the legs' games to
  // finish. Any leg that's still genuinely pending when this runs later
  // (its own game finishes) still gets its own status recorded normally by
  // settleMatchupParlayLegs/settleOutrightParlayLegs; trySettleParlay just
  // no-ops on it at that point since the parlay is already settled.
  if (legs.some((l) => l.status === "loss")) {
    await db.query(
      "update parlays set status = 'loss', settled_at = now() where id = $1",
      [parlayId],
    );
    await debitOnLoss(db, parlay, "parlay");
    return;
  }

  if (legs.some((l) => l.status === "pending")) return; // still waiting on other games

  if (legs.every((l) => l.status === "push")) {
    await db.query(
      "update parlays set status = 'push', settled_at = now() where id = $1",
      [parlayId],
    );
    await creditOutcome(db, { ...parlay, potential_payout: parlay.wager }, "push", "parlay");
    return;
  }

  // No losses, and not every leg pushed: pushed legs drop out of the
  // combined odds (standard parlay reduction), remaining legs must all win.
  const winningLegs = legs.filter((l) => l.status === "win");
  const combinedDecimal = winningLegs.reduce(
    (acc, l) => acc * americanToDecimal(l.odds),
    1,
  );
  const actualPayout = Number(parlay.wager) * combinedDecimal;

  // Persist the real payout (may be lower than the original estimate if
  // any leg pushed) so later reads don't show the stale pre-settlement figure.
  await db.query(
    "update parlays set status = 'win', potential_payout = $1, settled_at = now() where id = $2",
    [actualPayout, parlayId],
  );
  await creditOutcome(
    db,
    { ...parlay, potential_payout: String(actualPayout) },
    "win",
    "parlay",
  );
}

async function settleAffectedParlays(db: Pool, parlayIds: Set<string>) {
  for (const parlayId of parlayIds) {
    await trySettleParlay(db, parlayId);
  }
}

async function settleMatchupParlayLegs(
  db: Pool,
  gameId: string,
  homeScore: number,
  awayScore: number,
) {
  const { rows: legs } = await db.query<{
    id: string;
    parlay_id: string;
    pick_type: string;
    pick_side: string;
    spread: string | null;
    total: string | null;
    moneyline_draw: number | null;
  }>(
    `select pl.id, pl.parlay_id, pl.pick_type, pl.pick_side,
            coalesce(pl.spread_at_pick, l.spread) as spread,
            coalesce(pl.total_at_pick, l.total) as total,
            l.moneyline_draw
     from parlay_legs pl
     join lines l on l.id = pl.line_id
     where pl.game_id = $1 and pl.status = 'pending'`,
    [gameId],
  );

  const affectedParlays = new Set<string>();
  for (const leg of legs) {
    const outcome = determineMatchupOutcome(
      leg.pick_type,
      leg.pick_side,
      leg.spread != null ? Number(leg.spread) : null,
      leg.total != null ? Number(leg.total) : null,
      homeScore,
      awayScore,
      leg.moneyline_draw != null,
    );
    if (!outcome) continue;
    await db.query(
      "update parlay_legs set status = $1, settled_at = now() where id = $2",
      [outcome, leg.id],
    );
    affectedParlays.add(leg.parlay_id);
  }

  await settleAffectedParlays(db, affectedParlays);
}

async function settleOutrightParlayLegs(
  db: Pool,
  gameId: string,
  winnerName: string,
) {
  const { rows: legs } = await db.query<{
    id: string;
    parlay_id: string;
    pick_side: string;
  }>(
    `select id, parlay_id, pick_side from parlay_legs
     where game_id = $1 and status = 'pending' and pick_type = 'outright'`,
    [gameId],
  );

  const affectedParlays = new Set<string>();
  for (const leg of legs) {
    const outcome = determineOutrightOutcome(leg.pick_side, winnerName);
    await db.query(
      "update parlay_legs set status = $1, settled_at = now() where id = $2",
      [outcome, leg.id],
    );
    affectedParlays.add(leg.parlay_id);
  }

  await settleAffectedParlays(db, affectedParlays);
}

// Settles every pending pick (and any parlay legs) on a game against its
// final score: marks win/loss/push, credits payouts/refunds, and updates
// coin balances. Used both by the admin's manual "Settle" button and the
// automated live-score sync.
export async function settlePicksForGame(
  db: Pool,
  gameId: string,
  homeScore: number,
  awayScore: number,
) {
  await db.query(
    "update games set status = 'final', home_score = $1, away_score = $2 where id = $3",
    [homeScore, awayScore, gameId],
  );

  const { rows: picks } = await db.query<{
    id: string;
    user_id: string;
    pick_type: string;
    pick_side: string;
    wager: string;
    potential_payout: string;
    is_free_play: boolean;
    stake_debited: boolean;
    spread: string | null;
    total: string | null;
    moneyline_draw: number | null;
  }>(
    `select p.id, p.user_id, p.pick_type, p.pick_side, p.wager, p.potential_payout,
            p.is_free_play, p.stake_debited,
            coalesce(p.spread_at_pick, l.spread) as spread,
            coalesce(p.total_at_pick, l.total) as total,
            l.moneyline_draw
     from picks p
     join lines l on l.id = p.line_id
     where p.game_id = $1 and p.status = 'pending'`,
    [gameId],
  );

  for (const pick of picks) {
    const outcome = determineMatchupOutcome(
      pick.pick_type,
      pick.pick_side,
      pick.spread != null ? Number(pick.spread) : null,
      pick.total != null ? Number(pick.total) : null,
      homeScore,
      awayScore,
      pick.moneyline_draw != null,
    );
    if (!outcome) continue; // line missing needed field, skip (shouldn't happen)

    await db.query(
      "update picks set status = $1, settled_at = now() where id = $2",
      [outcome, pick.id],
    );

    if (outcome === "win" || outcome === "push") {
      await creditOutcome(db, pick, outcome, "pick");
    } else {
      await debitOnLoss(db, pick, "pick");
    }
  }

  await settleMatchupParlayLegs(db, gameId, homeScore, awayScore);
}

// Voids a game that got postponed/cancelled in real life — refunds every
// pending straight pick in full (same credit math as a push: stake back,
// no profit) and drops pending parlay legs on it out of their parlays as
// pushes (standard parlay reduction), rather than leaving them pending
// forever with no path to ever settle. Admin-triggered only (see
// voidGameAction) — there's no reliable automatic way to distinguish "the
// league postponed this" from "the score feed just hasn't updated yet".
export async function voidGame(db: Pool, gameId: string): Promise<void> {
  await db.query("update games set status = 'cancelled' where id = $1", [gameId]);

  const { rows: picks } = await db.query<{
    id: string;
    user_id: string;
    wager: string;
    potential_payout: string;
    is_free_play: boolean;
    stake_debited: boolean;
  }>(
    `select id, user_id, wager, potential_payout, is_free_play, stake_debited
     from picks where game_id = $1 and status = 'pending'`,
    [gameId],
  );
  for (const pick of picks) {
    await db.query(
      "update picks set status = 'cancelled', settled_at = now() where id = $1",
      [pick.id],
    );
    await creditOutcome(db, pick, "push", "pick");
  }

  const { rows: legs } = await db.query<{ id: string; parlay_id: string }>(
    "select id, parlay_id from parlay_legs where game_id = $1 and status = 'pending'",
    [gameId],
  );
  const affectedParlays = new Set<string>();
  for (const leg of legs) {
    await db.query(
      "update parlay_legs set status = 'push', settled_at = now() where id = $1",
      [leg.id],
    );
    affectedParlays.add(leg.parlay_id);
  }
  await settleAffectedParlays(db, affectedParlays);
}

// Settles an outright event (e.g. a golf tournament): every pick naming
// the declared winner wins, everyone else loses. No push case — if a
// tournament ends in a tie/playoff, settle against the eventual champion.
export async function settleOutrightEvent(
  db: Pool,
  gameId: string,
  winnerName: string,
) {
  await db.query(
    "update games set status = 'final', winner_name = $1 where id = $2",
    [winnerName, gameId],
  );

  const { rows: picks } = await db.query<{
    id: string;
    user_id: string;
    pick_side: string;
    wager: string;
    potential_payout: string;
    is_free_play: boolean;
    stake_debited: boolean;
  }>(
    `select id, user_id, pick_side, wager, potential_payout, is_free_play, stake_debited
     from picks
     where game_id = $1 and status = 'pending' and pick_type = 'outright'`,
    [gameId],
  );

  for (const pick of picks) {
    const outcome = determineOutrightOutcome(pick.pick_side, winnerName);

    await db.query(
      "update picks set status = $1, settled_at = now() where id = $2",
      [outcome, pick.id],
    );

    if (outcome === "win") {
      await creditOutcome(db, pick, outcome, "pick");
    } else {
      await debitOnLoss(db, pick, "pick");
    }
  }

  await settleOutrightParlayLegs(db, gameId, winnerName);
}
