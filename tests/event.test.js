'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { L, names, sorted, createEvent, playCycle } = require('./helpers');

test('isCycleComplete and computeRoundStatus follow entered results', () => {
  const ev = createEvent(names(9));
  assert.equal(L.isCycleComplete(ev), false);
  assert.deepEqual(L.computeRoundStatus(ev), { totalEntered: 0, total: 6, currentRound: 1, completed: false, hasAny: false });
  ev.rounds[0].results[0] = { team1Score: 11, team2Score: 4 };
  ev.rounds[0].results[1] = { team1Score: 11, team2Score: 4 };
  ev.rounds[1].results[1] = { team1Score: 11, team2Score: 4 };
  assert.deepEqual(L.computeRoundStatus(ev), { totalEntered: 3, total: 6, currentRound: 2, completed: false, hasAny: true });
  assert.equal(L.hasAnyEräResults(ev, 1), true);
  assert.equal(L.hasAnyEräResults(ev, 2), false);
  playCycle(ev, () => [11, 4]);
  assert.equal(L.isCycleComplete(ev), true);
  assert.equal(L.computeRoundStatus(ev).completed, true);
  assert.equal(L.isCycleComplete(null), false);
  assert.equal(L.isCycleComplete({ courts: [], rounds: [] }), false);
});

test('planPlayerChanges: adding a player keeps results on courts that did not change', () => {
  const ev = createEvent(names(8));
  playCycle(ev, () => [11, 4]);
  const plan = L.planPlayerChanges(ev, [...names(8), 'New']);
  assert.deepEqual(plan.courts.map(c => c.players.length), [4, 5]);
  // Court 1 is unchanged: its pairings and results survive.
  assert.equal(plan.courts[0].rounds, ev.courts[0].rounds);
  for (let r = 0; r < 3; r++) assert.deepEqual(plan.rounds[r].results[0], { team1Score: 11, team2Score: 4 });
  // Court 2 got a new player: new pairings, its results are dropped and reported.
  for (let r = 0; r < 3; r++) assert.equal(plan.rounds[r].results[1], undefined);
  assert.deepEqual(plan.resetCourts, [2]);
  assert.ok(plan.courts[1].players.includes('New'));
});

test('planPlayerChanges: removing a player from a 5-court keeps it where it was, invalid counts return null', () => {
  const ev = createEvent(names(9));
  const list = names(9).filter(p => p !== 'P9');
  const plan = L.planPlayerChanges(ev, list);
  assert.deepEqual(plan.courts.map(c => c.players.length), [4, 4]);
  assert.deepEqual(plan.resetCourts, []);
  assert.equal(L.planPlayerChanges(ev, names(7)), null);
});

test('rebalanceCourtSizes moves players across boundaries toward target sizes, preferring not to move someone twice', () => {
  const lists = [['a', 'b', 'c', 'd', 'e'], ['f', 'g', 'h', 'i']];
  const seed = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 1000, g: 1001, h: 1002, i: 1003 };
  // Court 1 must shrink to 4: its lowest-seeded player moves down.
  assert.deepEqual(L.rebalanceCourtSizes(lists, [4, 5], seed), [['a', 'b', 'c', 'd'], ['f', 'g', 'h', 'i', 'e']]);
  // ...unless that player already moved this cycle.
  assert.deepEqual(L.rebalanceCourtSizes(lists, [4, 5], seed, new Set(['e'])), [['a', 'b', 'c', 'e'], ['f', 'g', 'h', 'i', 'd']]);
  // Court 1 must grow: the best on court 2 comes up.
  assert.deepEqual(L.rebalanceCourtSizes([['a', 'b', 'c', 'd'], ['f', 'g', 'h', 'i', 'j']], [5, 4], seed),
    [['a', 'b', 'c', 'd', 'f'], ['g', 'h', 'i', 'j']]);
});

test('Firebase key encoding round-trips awkward player names', () => {
  const tricky = ['Matti.M', 'a/b', '$x#[y]', '50%', 'Ääkkönen', 'tab\there'];
  for (const n of tricky) {
    const k = L.encKey(n);
    assert.ok(!/[.$#\[\]\/]/.test(k), k);
    assert.equal(L.decKey(k), n);
  }
  const m = { 'Matti.M': 2, 'a/b': 1 };
  assert.deepEqual(L.decodeMap(L.encodeMap(m)), m);
  assert.deepEqual(L.getRestState({ restCounts: L.encodeMap({ 'x.y': 1 }) }), { restCounts: { 'x.y': 1 }, lastRestCycle: {} });
});

test('playerNameError, codes and HTML escaping', () => {
  assert.equal(L.playerNameError('Matti'), null);
  assert.ok(L.playerNameError(''));
  assert.ok(L.playerNameError('x'.repeat(31)));
  assert.ok(L.playerNameError('constructor'));
  assert.ok(L.playerNameError('a\u0001b'));
  assert.equal(L.normalizeCode('  ab c1 '), 'ABC1');
  assert.equal(L.isValidCodeFormat('ABC12'), true);
  assert.equal(L.isValidCodeFormat('AB'), false);
  const id = L.generateId();
  assert.match(id, /^[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(L.esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(L.teamStr(['A<', 'B']), 'A&lt; &amp; B');
});

test('computePlacementProgression ranks players within their court after each round', () => {
  const ev = createEvent(names(8));
  ev.rounds[0].results[0] = { team1Score: 11, team2Score: 2 };
  const prog = L.computePlacementProgression(ev);
  assert.deepEqual(sorted(Object.keys(prog)), sorted(names(8)));
  const court1 = ev.courts[0].players.map(p => prog[p][0]);
  assert.deepEqual(sorted(court1.map(String)), ['1', '2', '3', '4']);
  assert.equal(prog.P1[1], null);
});
