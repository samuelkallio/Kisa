'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { L, names, createEvent, playCycle, applyPromotions, randomScores, mulberry32 } = require('./helpers');

test('selectRestersForCycle: fewest rests first, then longest since last rest, then list order', () => {
  const p = ['A', 'B', 'C', 'D', 'E'];
  assert.deepEqual(L.selectRestersForCycle(p, {}, {}, -1), ['A', 'B', 'C']);
  assert.deepEqual(L.selectRestersForCycle(p, { A: 1, B: 1 }, { A: 0, B: 0 }, 5), ['C', 'D', 'E']);
  // D and E both rested once; D longer ago, so D goes first.
  assert.deepEqual(L.selectRestersForCycle(p, { A: 2, B: 2, C: 2, D: 1, E: 1 }, { D: 1, E: 2 }, 5), ['D', 'E', 'A']);
});

test('selectRestersForCycle never picks someone who rested last cycle while others are available', () => {
  const p = ['A', 'B', 'C', 'D', 'E'];
  // A, B, C rested last cycle (index 0) and have fewer rests than D/E would suggest; still avoided.
  const res = L.selectRestersForCycle(p, { A: 1, B: 1, C: 1, D: 3, E: 3 }, { A: 0, B: 0, C: 0, D: -5, E: -5 }, 0);
  assert.deepEqual(res.slice(0, 2).sort(), ['D', 'E']);
  assert.equal(res.length, 3);
});

test('a lone 5-player court rotates rests evenly (spread at most 1)', () => {
  const ev = createEvent(names(5));
  const rng = mulberry32(7);
  for (let c = 0; c < 10; c++) { playCycle(ev, randomScores(rng)); applyPromotions(ev); }
  const rc = L.decodeMap(ev.restCounts);
  const counts = names(5).map(p => rc[p] || 0);
  assert.equal(counts.reduce((a, b) => a + b, 0), 30);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `counts ${counts}`);
});

test('computeNextCycle tallies rest counts and last rest cycle from the finished cycle', () => {
  const ev = createEvent(names(9));
  playCycle(ev, () => [11, 5]);
  const resters = ev.courts[1].resters;
  const { restCounts, lastRestCycle } = L.computeNextCycle(ev);
  for (const p of resters) { assert.equal(restCounts[p], 1); assert.equal(lastRestCycle[p], 0); }
  assert.equal(Object.keys(restCounts).length, 3);
});

test('computeRestCountsLive counts only rounds that have a result', () => {
  const ev = createEvent(names(5));
  assert.deepEqual(L.computeRestCountsLive(ev), {});
  ev.rounds[0].results[0] = { team1Score: 11, team2Score: 3 };
  assert.deepEqual(L.computeRestCountsLive(ev), { [ev.courts[0].rounds[0].resting]: 1 });
});

// Property check over many simulated events with random results.
for (const n of [5, 9, 10, 13, 14, 15, 17, 19]) {
  test(`simulated ${n}-player event: resters avoid back-to-back rests whenever their court allows`, () => {
    for (let seed = 1; seed <= 15; seed++) {
      const rng = mulberry32(seed * 1000 + n);
      const ev = createEvent(names(n));
      for (let c = 0; c < 6; c++) {
        const last = ev.previousCycles.length - 1;
        const lr = L.decodeMap(ev.lastRestCycle);
        for (const court of ev.courts) {
          if (court.players.length !== 5) { assert.deepEqual(court.resters, []); continue; }
          const fresh = court.players.filter(p => (lr[p] ?? -1000) !== last).length;
          const repeats = court.resters.filter(p => (lr[p] ?? -1000) === last).length;
          assert.equal(repeats, Math.max(0, 3 - fresh), `seed ${seed} cycle ${c} court ${court.courtNumber}`);
        }
        playCycle(ev, randomScores(rng));
        applyPromotions(ev);
      }
    }
  });
}

test('with a single 5-player court among several, nobody ever rests two cycles in a row', () => {
  for (const n of [9, 13, 17, 21]) {
    for (let seed = 1; seed <= 15; seed++) {
      const rng = mulberry32(seed * 7 + n);
      const ev = createEvent(names(n));
      for (let c = 0; c < 8; c++) {
        const last = ev.previousCycles.length - 1;
        const lr = L.decodeMap(ev.lastRestCycle);
        const resters = ev.courts.flatMap(ct => ct.resters);
        assert.ok(resters.every(p => (lr[p] ?? -1000) !== last), `n=${n} seed ${seed} cycle ${c}`);
        playCycle(ev, randomScores(rng));
        applyPromotions(ev);
      }
    }
  }
});
