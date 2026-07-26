-- Soccer's h2h market already returns a third "Draw" outcome alongside
-- home/away, which we previously discarded. Storing it lets a moneyline
-- pick be graded as a genuine 3-way market (draw wins on a tied score,
-- home/away lose outright) instead of always pushing on a tie.
alter table lines add column if not exists moneyline_draw integer;
