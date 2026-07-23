import "server-only";
import type { Pool } from "pg";
import { americanToDecimal } from "./odds";

type Outcome = "win" | "loss" | "push";

// Pure win/loss/push logic for a two-team matchup pick, shared by straight
// picks and parlay legs. Returns null if the line is missing the field
// needed to grade this pick type (shouldn't happen in practice).
export function determineMatchupOutcome(
  pickType: string,
  pickSide: string,
  spread: number | null,
  total: number | null,
  homeScore: number,
  awayScore: number,
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
  }>("select id, user_id, wager, status, is_free_play from parlays where id = $1", [parlayId]);
  const parlay = parlays[0];
  if (!parlay || parlay.status !== "pending") return;

  const { rows: legs } = await db.query<{ status: string; odds: number }>(
    "select status, odds from parlay_legs where parlay_id = $1",
    [parlayId],
  );
  if (legs.some((l) => l.status === "pending")) return; // still waiting on other games

  if (legs.some((l) => l.status === "loss")) {
    await db.query(
      "update parlays set status = 'loss', settled_at = now() where id = $1",
      [parlayId],
    );
    return; // wager was already debited at placement
  }

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
  }>(
    `select pl.id, pl.parlay_id, pl.pick_type, pl.pick_side,
            coalesce(pl.spread_at_pick, l.spread) as spread,
            coalesce(pl.total_at_pick, l.total) as total
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
    spread: string | null;
    total: string | null;
  }>(
    `select p.id, p.user_id, p.pick_type, p.pick_side, p.wager, p.potential_payout,
            p.is_free_play,
            coalesce(p.spread_at_pick, l.spread) as spread,
            coalesce(p.total_at_pick, l.total) as total
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
    );
    if (!outcome) continue; // line missing needed field, skip (shouldn't happen)

    await db.query(
      "update picks set status = $1, settled_at = now() where id = $2",
      [outcome, pick.id],
    );

    if (outcome === "win" || outcome === "push") {
      await creditOutcome(db, pick, outcome, "pick");
    }
    // loss: wager was already debited at pick time, nothing further to do
  }

  await settleMatchupParlayLegs(db, gameId, homeScore, awayScore);
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
  }>(
    `select id, user_id, pick_side, wager, potential_payout, is_free_play
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
    }
  }

  await settleOutrightParlayLegs(db, gameId, winnerName);
}
