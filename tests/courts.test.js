'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { L, names, sorted } = require('./helpers');

test('valid player counts: 4..5, 8..10, 12..15, then everything from 16 up', () => {
  const valid = [];
  for (let n = 0; n <= 20; n++) if (L.isValidPlayerCount(n)) valid.push(n);
  assert.deepEqual(valid, [4, 5, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.equal(L.isValidPlayerCount(4.5), false);
  assert.equal(L.isValidPlayerCount(-4), false);
});

test('sizesForCount uses only 4- and 5-player courts and sums to n', () => {
  for (let n = 4; n <= 40; n++) {
    const sizes = L.sizesForCount(n);
    if (!L.isValidPlayerCount(n)) { assert.equal(sizes, null, `n=${n}`); continue; }
    assert.equal(sizes.length, Math.floor(n / 4), `n=${n}`);
    assert.ok(sizes.every(s => s === 4 || s === 5), `n=${n}`);
    assert.equal(sizes.reduce((a, b) => a + b, 0), n, `n=${n}`);
  }
});

test('sizesForCount puts 5-player courts at the bottom by default, keeps earlier 5-player courts when asked', () => {
  assert.deepEqual(L.sizesForCount(9), [4, 5]);
  assert.deepEqual(L.sizesForCount(14), [4, 5, 5]);
  assert.deepEqual(L.sizesForCount(9, [5, 4]), [5, 4]);
  assert.deepEqual(L.sizesForCount(14, [5, 4, 4]), [5, 4, 5]);
});

test('computeInitialCourts fills courts in list order, 5-player courts last', () => {
  const p = names(13);
  const courts = L.computeInitialCourts(p);
  assert.deepEqual(courts.map(c => c.players.length), [4, 4, 5]);
  assert.deepEqual(courts.flatMap(c => c.players), p);
  assert.deepEqual(courts.map(c => c.courtNumber), [1, 2, 3]);
  assert.deepEqual(courts.map(c => c.courtIndex), [0, 1, 2]);
  assert.deepEqual(L.computeInitialCourts(names(10)).map(c => c.players.length), [5, 5]);
  assert.deepEqual(L.computeInitialCourts(names(8)).map(c => c.players.length), [4, 4]);
});

test('4-player court: three rounds, everyone partners everyone exactly once', () => {
  const p = ['A', 'B', 'C', 'D'];
  const rounds = L.generateCourtRounds4p(p);
  assert.equal(rounds.length, 3);
  const partners = new Set();
  for (const r of rounds) {
    assert.equal(r.resting, null);
    assert.deepEqual(sorted([...r.team1, ...r.team2]), p);
    partners.add(sorted(r.team1).join()); partners.add(sorted(r.team2).join());
  }
  assert.equal(partners.size, 6, 'all 6 possible pairs appear');
});

test('5-player court: each round has 4 distinct players and 1 rester, the 3 resters rest once each', () => {
  const p = ['A', 'B', 'C', 'D', 'E'];
  const resters = ['C', 'D', 'E'];
  const rounds = L.generateCourtRounds5p(p, resters);
  assert.equal(rounds.length, 3);
  assert.deepEqual(rounds.map(r => r.resting), resters);
  const playCount = Object.fromEntries(p.map(x => [x, 0]));
  const partners = new Set();
  for (const r of rounds) {
    const playing = [...r.team1, ...r.team2];
    assert.equal(new Set(playing).size, 4);
    assert.ok(!playing.includes(r.resting));
    assert.deepEqual(sorted([...playing, r.resting]), p);
    playing.forEach(x => playCount[x]++);
    partners.add(sorted(r.team1).join()); partners.add(sorted(r.team2).join());
  }
  assert.deepEqual(playCount, { A: 3, B: 3, C: 2, D: 2, E: 2 });
  assert.equal(partners.size, 6, 'no pair partners twice');
});

test('makeCourt picks resters only for 5-player courts', () => {
  assert.deepEqual(L.makeCourt(0, names(4), {}, {}, -1).resters, []);
  const c5 = L.makeCourt(1, names(5), {}, {}, -1);
  assert.equal(c5.courtNumber, 2);
  assert.equal(c5.resters.length, 3);
  assert.equal(new Set(c5.resters).size, 3);
});

test('getCombinations', () => {
  assert.deepEqual(L.getCombinations([1, 2, 3], 2), [[1, 2], [1, 3], [2, 3]]);
  assert.deepEqual(L.getCombinations([1, 2], 0), [[]]);
  assert.deepEqual(L.getCombinations([1, 2], 3), []);
  assert.equal(L.getCombinations([0, 1, 2, 3, 4, 5], 3).length, 20);
});
