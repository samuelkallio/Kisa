'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { L, names, sorted, createEvent, playCycle, applyPromotions, strengthScores, randomScores, mulberry32 } = require('./helpers');

const courtsOf = ev => ev.courts.map(c => sorted(c.players));

test('boundaryExchangePlayers: one player crosses a 4/4 or 4/5 boundary, two cross a 5/5 boundary', () => {
  const mk = sizes => { let i = 0; return sizes.map(s => ({ players: Array.from({ length: s }, () => `p${++i}`) })); };
  // Standings = list order, so each court's last player is its worst and first is its best.
  const run = sizes => {
    const courts = mk(sizes);
    const standings = courts.flatMap(c => c.players).map(name => ({ name }));
    return { courts, ...L.boundaryExchangePlayers(courts, standings) };
  };
  let r = run([4, 4]);
  assert.deepEqual(r.lists, [['p1', 'p2', 'p3', 'p5'], ['p6', 'p7', 'p8', 'p4']]);
  assert.deepEqual(sorted([...r.moved]), ['p4', 'p5']);

  r = run([4, 5]);
  assert.deepEqual(r.lists, [['p1', 'p2', 'p3', 'p5'], ['p6', 'p7', 'p8', 'p9', 'p4']]);

  r = run([5, 5]);
  assert.deepEqual(r.lists, [['p1', 'p2', 'p3', 'p6', 'p7'], ['p8', 'p9', 'p10', 'p4', 'p5']]);
  assert.equal(r.moved.size, 4);

  // Middle court of three both receives and sends at each boundary.
  r = run([4, 4, 4]);
  assert.deepEqual(r.lists, [['p1', 'p2', 'p3', 'p5'], ['p6', 'p7', 'p4', 'p9'], ['p10', 'p11', 'p12', 'p8']]);
});

test('8 players: the best on court 2 goes up and the worst on court 1 goes down', () => {
  const ev = createEvent(names(8));
  // P8 is the strongest player, P4 the weakest.
  playCycle(ev, strengthScores(['P8', 'P1', 'P2', 'P3', 'P5', 'P6', 'P7', 'P4']));
  const { courts } = L.computeNextCycle(ev);
  assert.deepEqual(courts.map(c => sorted(c.players)), [['P1', 'P2', 'P3', 'P8'], ['P4', 'P5', 'P6', 'P7']]);
});

test('10 players on two 5-player courts: the two lowest-ranked on court 1 swap with the two highest on court 2', () => {
  const ev = createEvent(names(10));
  playCycle(ev, randomScores(mulberry32(3)));
  const rank = {};
  L.computeStandings(ev).forEach((s, i) => { rank[s.name] = i; });
  const byRank = arr => [...arr].sort((a, b) => rank[a] - rank[b]);
  const [top, bottom] = ev.courts.map(c => byRank(c.players));
  const expected = [sorted([...top.slice(0, 3), ...bottom.slice(0, 2)]), sorted([...bottom.slice(2), ...top.slice(3)])];
  applyPromotions(ev);
  assert.deepEqual(courtsOf(ev), expected);
});

test('a dominant player climbs one court per cycle to the top court and stays there', () => {
  const p = names(16);
  const order = ['P16', ...p.slice(0, 15)]; // P16 starts on the bottom court but is the best
  const ev = createEvent(p);
  const score = strengthScores(order);
  const courtOf = () => ev.courts.find(c => c.players.includes('P16')).courtNumber;
  const path = [courtOf()];
  for (let c = 0; c < 5; c++) { playCycle(ev, score); applyPromotions(ev); path.push(courtOf()); }
  assert.deepEqual(path, [4, 3, 2, 1, 1, 1]);
});

test('promotion keeps every player exactly once and court sizes valid, for every player count', () => {
  for (let n = 4; n <= 22; n++) {
    if (!L.isValidPlayerCount(n)) continue;
    const expectedSizes = sorted(L.sizesForCount(n)).join();
    for (let seed = 1; seed <= 5; seed++) {
      const rng = mulberry32(seed * 31 + n);
      const ev = createEvent(names(n));
      for (let c = 0; c < 5; c++) {
        playCycle(ev, randomScores(rng));
        applyPromotions(ev);
        const all = ev.courts.flatMap(x => x.players);
        assert.deepEqual(sorted(all), sorted(names(n)), `n=${n} seed=${seed} cycle=${c}`);
        assert.equal(sorted(ev.courts.map(x => x.players.length)).join(), expectedSizes, `n=${n} seed=${seed} cycle=${c}`);
        ev.courts.forEach((court, i) => {
          assert.equal(court.courtIndex, i);
          assert.equal(court.rounds.length, 3);
          for (const r of court.rounds) {
            const inRound = [...r.team1, ...r.team2, ...(r.resting ? [r.resting] : [])];
            assert.deepEqual(sorted(inRound), sorted(court.players));
          }
        });
      }
    }
  }
});

test('a 5-player court can move between positions to share out rests', () => {
  // 9 players: one 4-court and one 5-court. Over a few cycles the 5-court should not be stuck in one place
  // while there are players on the 4-court who have never rested.
  const ev = createEvent(names(9));
  const rng = mulberry32(42);
  const positions = new Set();
  for (let c = 0; c < 6; c++) {
    positions.add(ev.courts.findIndex(x => x.players.length === 5));
    playCycle(ev, randomScores(rng));
    applyPromotions(ev);
  }
  assert.equal(positions.size, 2);
});

test('projectedCourtMap: null before any result, then matches computeNextCycle', () => {
  const ev = createEvent(names(8));
  assert.equal(L.projectedCourtMap(ev), null);
  playCycle(ev, strengthScores(['P8', 'P1', 'P2', 'P3', 'P5', 'P6', 'P7', 'P4']));
  const m = L.projectedCourtMap(ev);
  assert.equal(m.P8, 1); assert.equal(m.P4, 2); assert.equal(m.P1, 1); assert.equal(m.P5, 2);
});
