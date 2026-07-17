import "server-only";
import type { Pool } from "pg";

type PendingPick = {
  id: string;
  user_id: string;
  pick_type: string;
  pick_side: string;
  wager: string;
  potential_payout: string;
  spread: string | null;
  total: string | null;
  moneyline_home: number | null;
  moneyline_away: number | null;
};

async function creditOutcome(
  db: Pool,
  pick: { id: string; user_id: string; wager: string; potential_payout: string },
  outcome: "win" | "push",
) {
  const amount = outcome === "win" ? pick.potential_payout : pick.wager;
  const reason = outcome === "win" ? "pick_payout" : "pick_refund";

  await db.query(
    `insert into coin_transactions (user_id, amount, reason, related_pick_id)
     values ($1, $2, $3, $4)`,
    [pick.user_id, amount, reason, pick.id],
  );
  await db.query(
    "update users set coin_balance = coin_balance + $1 where id = $2",
    [amount, pick.user_id],
  );
}

// Settles every pending pick on a game against its final score: marks
// win/loss/push, credits payouts/refunds, and updates coin balances.
// Used both by the admin's manual "Settle" button and the automated
// live-score sync.
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

  const { rows: picks } = await db.query<PendingPick>(
    `select p.id, p.user_id, p.pick_type, p.pick_side, p.wager, p.potential_payout,
            l.spread, l.total, l.moneyline_home, l.moneyline_away
     from picks p
     join lines l on l.id = p.line_id
     where p.game_id = $1 and p.status = 'pending'`,
    [gameId],
  );

  for (const pick of picks) {
    let outcome: "win" | "loss" | "push";

    if (pick.pick_type === "spread" && pick.spread != null) {
      const spread = Number(pick.spread);
      const adjustedHome = homeScore + spread;
      if (adjustedHome === awayScore) outcome = "push";
      else if (pick.pick_side === "home")
        outcome = adjustedHome > awayScore ? "win" : "loss";
      else outcome = adjustedHome < awayScore ? "win" : "loss";
    } else if (pick.pick_type === "total" && pick.total != null) {
      const total = Number(pick.total);
      const sum = homeScore + awayScore;
      if (sum === total) outcome = "push";
      else if (pick.pick_side === "over") outcome = sum > total ? "win" : "loss";
      else outcome = sum < total ? "win" : "loss";
    } else if (pick.pick_type === "moneyline") {
      if (homeScore === awayScore) outcome = "push";
      else if (pick.pick_side === "home")
        outcome = homeScore > awayScore ? "win" : "loss";
      else outcome = awayScore > homeScore ? "win" : "loss";
    } else {
      continue; // line missing needed field, skip (shouldn't happen)
    }

    await db.query(
      "update picks set status = $1, settled_at = now() where id = $2",
      [outcome, pick.id],
    );

    if (outcome === "win" || outcome === "push") {
      await creditOutcome(db, pick, outcome);
    }
    // loss: wager was already debited at pick time, nothing further to do
  }
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
  }>(
    `select id, user_id, pick_side, wager, potential_payout
     from picks
     where game_id = $1 and status = 'pending' and pick_type = 'outright'`,
    [gameId],
  );

  for (const pick of picks) {
    const outcome = pick.pick_side === winnerName ? "win" : "loss";

    await db.query(
      "update picks set status = $1, settled_at = now() where id = $2",
      [outcome, pick.id],
    );

    if (outcome === "win") {
      await creditOutcome(db, pick, outcome);
    }
  }
}
