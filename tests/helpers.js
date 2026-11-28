'use strict';
const { loadLogic } = require('./load-logic');

const L = loadLogic();

// Small deterministic PRNG so failures are reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function names(n, prefix = 'P') {
  return Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
}

function emptyRounds() {
  return [0, 1, 2].map(r => ({ roundIndex: r, results: {} }));
}

// Same shape as createEvent() in index.html.
function createEvent(playerNames, opts = {}) {
  return {
    playerCode: 'TEST1', name: 'Test', playerNames: [...playerNames],
    courts: L.computeInitialCourts(playerNames),
    seedOrder: [...playerNames], useSeedPrior: opts.useSeedPrior !== false,
    rounds: emptyRounds(), previousCycles: [], restCounts: {}, lastRestCycle: {}, status: 'active'
  };
}

// scoreFn(team1, team2, courtIndex, roundIndex) -> [team1Score, team2Score]
function playCycle(ev, scoreFn) {
  for (let r = 0; r < 3; r++) {
    for (const court of ev.courts) {
      const pair = court.rounds[r];
      const [a, b] = scoreFn(pair.team1, pair.team2, court.courtIndex, r);
      ev.rounds[r].results[court.courtIndex] = { team1Score: a, team2Score: b };
    }
  }
  return ev;
}

// Mirrors applyPromotions() in index.html, including the encodeMap round trip
// the stored rest state goes through.
function applyPromotions(ev) {
  if (!L.isCycleComplete(ev)) throw new Error('cycle not complete');
  const standings = L.computeStandings(ev);
  const { courts, restCounts, lastRestCycle } = L.computeNextCycle(ev);
  ev.previousCycles = [...(ev.previousCycles || []), { courts: ev.courts, rounds: ev.rounds, standings }];
  ev.courts = courts;
  ev.rounds = emptyRounds();
  ev.restCounts = L.encodeMap(restCounts);
  ev.lastRestCycle = L.encodeMap(lastRestCycle);
  return ev;
}

// Score function where a lower "strength rank" always wins (names earlier in
// `order` are stronger). Ties when equal team strength.
function strengthScores(order) {
  const rank = {};
  order.forEach((p, i) => { rank[p] = i; });
  return (t1, t2) => {
    const s1 = t1.reduce((q, p) => q + rank[p], 0), s2 = t2.reduce((q, p) => q + rank[p], 0);
    if (s1 === s2) return [8, 8];
    return s1 < s2 ? [11, 6] : [6, 11];
  };
}

function randomScores(rng) {
  return () => {
    const r = rng();
    if (r < 0.1) return [9, 9];
    const loser = Math.floor(rng() * 10);
    return rng() < 0.5 ? [11, loser] : [loser, 11];
  };
}

function sorted(arr) { return [...arr].sort(); }

module.exports = { L, mulberry32, names, emptyRounds, createEvent, playCycle, applyPromotions, strengthScores, randomScores, sorted };
