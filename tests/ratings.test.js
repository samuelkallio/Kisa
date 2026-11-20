'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { L, names, createEvent, playCycle, emptyRounds } = require('./helpers');

// A one-court event with explicit results per round: [[t1, t2], ...].
function oneCourtEvent(players, scores, extra = {}) {
  const ev = { playerNames: players, courts: L.computeInitialCourts(players), rounds: emptyRounds(), previousCycles: [], ...extra };
  scores.forEach(([a, b], r) => { ev.rounds[r].results[0] = { team1Score: a, team2Score: b }; });
  return ev;
}

test('no games and no seed prior: everyone rated 0 (label 1000)', () => {
  const r = L.computeRatings({ playerNames: ['A', 'B', 'C', 'D'], courts: [], rounds: [] });
  assert.deepEqual(r, { A: 0, B: 0, C: 0, D: 0 });
  assert.equal(L.ratingLabel(0), 1000);
  assert.equal(L.ratingLabel(0.5), 1050);
  assert.equal(L.ratingLabel(undefined), 1000);
});

test('seed prior: before any games, ratings follow the seed order and are symmetric around 0', () => {
  const p = names(8);
  const r = L.computeRatings({ playerNames: p, seedOrder: p, courts: [], rounds: [] });
  for (let i = 0; i < 7; i++) assert.ok(r[p[i]] > r[p[i + 1]]);
  assert.ok(Math.abs(r.P1 + r.P8) < 1e-9);
  assert.ok(Math.abs(p.reduce((s, x) => s + r[x], 0)) < 1e-9);
  // useSeedPrior: false turns it off.
  const off = L.computeRatings({ playerNames: p, seedOrder: p, useSeedPrior: false, courts: [], rounds: [] });
  assert.ok(p.every(x => off[x] === 0));
});

test('qnormApprox is a sane inverse normal CDF', () => {
  assert.ok(Math.abs(L.qnormApprox(0.5)) < 1e-9);
  assert.ok(Math.abs(L.qnormApprox(0.975) - 1.959964) < 1e-4);
  assert.ok(Math.abs(L.qnormApprox(0.01) + 2.326348) < 1e-4);
  assert.ok(Math.abs(L.qnormApprox(0.2) + L.qnormApprox(0.8)) < 1e-9);
});

test('winning raises a rating and losing lowers it', () => {
  const p = ['A', 'B', 'C', 'D'];
  // Rounds: A&D v B&C, A&C v B&D, A&B v C&D. A's team wins every game.
  const ev = oneCourtEvent(p, [[11, 5], [11, 5], [11, 5]]);
  const r = L.computeRatings(ev);
  assert.ok(r.A > 0 && r.A > r.B && r.A > r.C && r.A > r.D);
  // B, C and D each won one game and lost two; by symmetry they are equal.
  assert.ok(Math.abs(r.B - r.C) < 1e-6 && Math.abs(r.C - r.D) < 1e-6);
  assert.ok(r.B < 0);
});

test('a bigger margin moves ratings further', () => {
  const p = ['A', 'B', 'C', 'D'];
  const close = L.computeRatings(oneCourtEvent(p, [[11, 9], [11, 9], [11, 9]]));
  const blowout = L.computeRatings(oneCourtEvent(p, [[11, 1], [11, 1], [11, 1]]));
  assert.ok(blowout.A - blowout.B > close.A - close.B);
});

test('draws: all-drawn games leave everyone level, count as ties, and score 0.5', () => {
  const p = ['A', 'B', 'C', 'D'];
  const ev = oneCourtEvent(p, [[8, 8], [0, 0], [10, 10]]);
  const r = L.computeRatings(ev);
  p.forEach(x => assert.ok(Math.abs(r[x]) < 1e-9, `${x}=${r[x]}`));
  const st = L.gameStats(L.collectGames(ev), p);
  p.forEach(x => assert.deepEqual(
    { w: st[x].wins, t: st[x].ties, l: st[x].losses, n: st[x].played }, { w: 0, t: 3, l: 0, n: 3 }));
  const rows = L.computeStandings(ev);
  rows.forEach(row => { assert.equal(row.winRate, 0.5); assert.equal(row.share, 0.5); });
  // Level on everything: order falls back to the player list.
  assert.deepEqual(rows.map(x => x.name), p);
  assert.equal(L.recordStr(rows[0]), '0–3–0');
});

test('a draw is worth half a win in win rate', () => {
  const p = ['A', 'B', 'C', 'D'];
  // A: win, draw, loss
  const ev = oneCourtEvent(p, [[11, 5], [7, 7], [5, 11]]);
  const row = L.computeStandings(ev).find(x => x.name === 'A');
  assert.equal(row.wins, 1); assert.equal(row.ties, 1); assert.equal(row.losses, 1);
  assert.equal(row.winRate, 0.5);
  assert.equal(row.pointsFor, 23); assert.equal(row.pointsAgainst, 23);
});

test('gameStats tracks points for/against and statsRow derives averages', () => {
  const games = [{ t1: ['A', 'B'], t2: ['C', 'D'], a: 11, b: 4 }, { t1: ['A', 'C'], t2: ['B', 'D'], a: 6, b: 11 }];
  const st = L.gameStats(games, ['A', 'B', 'C', 'D']);
  assert.deepEqual(st.A, { wins: 1, ties: 0, losses: 1, played: 2, pf: 17, pa: 15 });
  assert.deepEqual(st.D, { wins: 1, ties: 0, losses: 1, played: 2, pf: 15, pa: 17 });
  assert.deepEqual(st.C, { wins: 0, ties: 0, losses: 2, played: 2, pf: 10, pa: 22 });
  const row = L.statsRow('A', st.A, 0.1);
  assert.equal(row.pointDiffSum, 2);
  assert.equal(row.avgPointDiff, 1);
  assert.equal(row.winRate, 0.5);
  assert.ok(Math.abs(row.share - 17 / 32) < 1e-12);
  // A player with no games
  const empty = L.statsRow('Z', { wins: 0, ties: 0, losses: 0, played: 0, pf: 0, pa: 0 }, 0);
  assert.equal(empty.winRate, 0); assert.equal(empty.share, 0.5); assert.equal(empty.avgPointDiff, 0);
});

test('sortByRating: rating, then win rate, then point share, then list order', () => {
  const rows = [
    { name: 'C', rating: 0, winRate: 0.5, share: 0.5 },
    { name: 'A', rating: 0, winRate: 0.5, share: 0.5 },
    { name: 'B', rating: 0, winRate: 0.5, share: 0.6 },
    { name: 'D', rating: 0, winRate: 0.7, share: 0.1 },
    { name: 'E', rating: 0.2, winRate: 0, share: 0 }
  ];
  assert.deepEqual(L.sortByRating(rows, ['A', 'B', 'C', 'D', 'E']).map(r => r.name), ['E', 'D', 'B', 'A', 'C']);
});

test('collectGames includes previous cycles, and maxRound / currentOnly limit it', () => {
  const ev = createEvent(names(4), { useSeedPrior: false });
  playCycle(ev, () => [11, 3]);
  assert.equal(L.collectGames(ev).length, 3);
  assert.equal(L.collectGames(ev, { maxRound: 0 }).length, 1);
  ev.previousCycles = [{ courts: ev.courts, rounds: ev.rounds }];
  assert.equal(L.collectGames(ev).length, 6);
  assert.equal(L.collectGames(ev, { currentOnly: true }).length, 3);
  assert.deepEqual(L.collectGames(ev).map(g => g.cycle), [0, 0, 0, 1, 1, 1]);
});

test('capDiff caps point difference at MAX_POINT_DIFF either way', () => {
  assert.equal(L.MAX_POINT_DIFF, 5);
  assert.equal(L.capDiff(3), 3);
  assert.equal(L.capDiff(9), 5);
  assert.equal(L.capDiff(-9), -5);
  assert.equal(L.capDiff(0), 0);
});
