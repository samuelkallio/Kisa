// Ranking-laskennan testit. Ajo: node --test tests/
// Lataa ranking.html:n RANKING-LOGIC-lohkon (ja vertailua varten index.html:n PURE-LOGIC-lohkon) ilman build-vaihetta.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function block(file, start, end) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const a = src.indexOf(start), b = src.indexOf(end);
  if (a < 0 || b < 0) throw new Error(`${file}: merkkejä ${start}/${end} ei löytynyt`);
  return src.slice(a, b);
}
const R = vm.runInNewContext(block('ranking.html', '// ==== RANKING-LOGIC-START', '// ==== RANKING-LOGIC-END') +
  ';({ rkCompute, rkApply, rkParams, rkLabel, rkSuggest, rkAliasKey, rkParseGames, rkParseLevels, rkParsePlacement, rkFromKisaEvent, rkTableRows, rkMergeImports, rkImportPids })', {});
const K = vm.runInNewContext('const LOCAL_LATENCY = 0;' + block('index.html', '// ==== PURE-LOGIC-START', '// ==== PURE-LOGIC-END') +
  ';({ computeRatings, computeInitialCourts })', {});

function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
function kisaEvent(names, seed, createdAt = '2026-11-01T16:00:00Z') {
  const r = rng(seed);
  const courts = K.computeInitialCourts(names);
  const rounds = [0, 1, 2].map(i => ({ roundIndex: i, results: {} }));
  courts.forEach(c => c.rounds.forEach((p, i) => { rounds[i].results[c.courtIndex] = { team1Score: Math.floor(r() * 22), team2Score: Math.floor(r() * 22), timestamp: 'x' }; }));
  return { playerCode: 'ABCDE', name: 'Testi', createdAt, seedByCourt: true, playerNames: names, courts, rounds, previousCycles: [] };
}
// vm-kontekstin taulukoilla on eri prototyyppi, joten vertailu JSON-muodossa
const same = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m);
const reg = (...names) => Object.fromEntries(names.map((n, i) => ['p' + i, { name: n }]));

test('Kisa-tuonti uusilla pelaajilla antaa saman tason kuin Kisan tapahtumataso', () => {
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
  const ev = kisaEvent(names, 7);
  const kr = K.computeRatings(ev);
  const imp = Object.assign(R.rkFromKisaEvent(ev), { id: 'i1', source: 'kisa' });
  const st = { players: {} };
  R.rkApply(st, imp, Object.assign(R.rkParams({}), { lambdaNew: 0.5 }));
  names.forEach(n => assert.ok(Math.abs(kr[n] - st.players[n].mu) < 1e-6, n));
});

test('Nimien kohdistus: alias, sama nimi, lyhenne ja epäselvä', () => {
  const players = reg('Jukka Holopainen', 'Anna Virtanen', 'Mikko Mäki', 'Mikko Mattila');
  assert.equal(R.rkSuggest('JukkaH', players, {}).pid, 'p0');
  assert.equal(R.rkSuggest('Jukka', players, {}).pid, 'p0');
  assert.equal(R.rkSuggest('J. Holopainen', players, {}).pid, 'p0');
  assert.equal(R.rkSuggest('holopainen', players, {}).pid, 'p0');
  assert.equal(R.rkSuggest('anna virtanen', players, {}).how, 'exact');
  const amb = R.rkSuggest('Mikko', players, {});
  assert.equal(amb.pid, null); assert.equal(amb.how, 'ambiguous'); same([...amb.candidates].sort(), ['p2', 'p3']);
  const al = R.rkSuggest('Mikko', players, { [R.rkAliasKey('mikko')]: 'p3' });
  assert.equal(al.pid, 'p3'); assert.equal(al.how, 'alias');
  assert.equal(R.rkSuggest('Kalle', players, {}).pid, null);
});

test('CSV-jäsennys: nelin- ja kaksinpeli, otsikko, virheet', () => {
  const g = R.rkParseGames('p1;p2;p3;p4;s1;s2\nA;B;C;D;21;15\nA,C,21-18\nA\tB\tC\tD\t10\t21');
  same(g.errors, []);
  assert.equal(g.games.length, 3);
  same(g.games[1], { t1: ['A'], t2: ['C'], a: 21, b: 18 });
  assert.ok(R.rkParseGames('A;B;C;21;15').errors.length);
  const l = R.rkParseLevels('Anna; 1043\n2; Mikko; 987');
  same(l.levels, [{ name: 'Anna', value: 1043 }, { name: 'Mikko', value: 987 }]);
  const p = R.rkParsePlacement('Anna\nMikko\nJukka');
  same(p.places.map(x => x.place), [1, 2, 3]);
  assert.ok(R.rkParsePlacement('1;Anna\nMikko').errors.length);
});

function gamesImport(id, date, games) { return { id, date, name: id, source: 'games', games: games.map(([t1, t2, a, b]) => ({ t1, t2, a, b })) }; }

test('Uusi pelaaja suhteutetaan rankattuihin: vahvoja voittava nousee heidän yläpuolelleen', () => {
  const P = R.rkParams({});
  const st = { players: {} };
  const g1 = [];
  for (let i = 0; i < 6; i++) { g1.push([['s1', 's2'], ['w1', 'w2'], 21, 8]); g1.push([['s1', 'w1'], ['s2', 'w2'], 21, 15]); }
  R.rkApply(st, gamesImport('i1', '2026-01-05', g1), P);
  assert.ok(st.players.s1.mu > st.players.w1.mu);
  const g2 = [];
  for (let i = 0; i < 4; i++) { g2.push([['n', 'w1'], ['s1', 's2'], 21, 14]); g2.push([['n', 'w2'], ['s1', 'w1'], 21, 13]); }
  R.rkApply(st, gamesImport('i2', '2026-01-12', g2), P);
  assert.ok(st.players.n.mu > st.players.s1.mu, 'uusi pelaaja voitti vahvimmat');
});

test('Tauko pienentää varmuutta, joten seuraava tapahtuma liikuttaa enemmän', () => {
  const P = R.rkParams({});
  const base = [];
  for (let i = 0; i < 8; i++) base.push([['a', 'b'], ['c', 'd'], 15, 15]);
  const run = (gapDate) => {
    const st = { players: {} };
    ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26', '2026-02-02'].forEach((d, w) => R.rkApply(st, gamesImport('w' + w, d, base), P));
    const before = st.players.a.mu;
    R.rkApply(st, gamesImport('x', gapDate, [[['a', 'b'], ['c', 'd'], 21, 5]]), P);
    return st.players.a.mu - before;
  };
  assert.ok(run('2026-12-01') > run('2026-02-09'));
});

test('Lopputasot siirretään asteikolle rankattujen avulla', () => {
  const P = R.rkParams({});
  const st = { players: {} };
  const g = [];
  for (let i = 0; i < 8; i++) { g.push([['a', 'b'], ['c', 'd'], 21, 10]); g.push([['a', 'c'], ['b', 'd'], 18, 15]); }
  R.rkApply(st, gamesImport('i1', '2026-03-01', g), P);
  const muA = st.players.a.mu, muD = st.players.d.mu;
  // Tapahtumassa kaikki 50 pistettä "liian korkealla": korjaus poistaa sen, uusi pelaaja asettuu suhteessa
  const lv = { a: 1000 + 100 * muA + 50, d: 1000 + 100 * muD + 50, n: 1000 + 100 * muA + 50 };
  const res = R.rkApply(st, { id: 'i2', date: '2026-03-08', name: 'x', source: 'levels', scale: 'kisa', levels: lv }, P);
  assert.ok(Math.abs(st.players.n.mu - muA) < 1e-9, 'uusi samalle tasolle kuin a');
  assert.ok(Math.abs(st.players.a.mu - muA) < 1e-9 && Math.abs(st.players.d.mu - muD) < 1e-9, 'rankatut eivät muutu');
  assert.equal(res.ranked, 2);
});

test('Sijoitustuonti järjestää pelaajat sijoituksen mukaan', () => {
  const st = { players: {} };
  R.rkApply(st, { id: 'i1', date: '2026-04-01', name: 'x', source: 'placement', places: { a: 1, b: 2, c: 3, d: 4 } }, R.rkParams({}));
  assert.ok(st.players.a.mu > st.players.b.mu && st.players.b.mu > st.players.c.mu && st.players.c.mu > st.players.d.mu);
  assert.equal(st.players.a.games, 0);
});

test('Uudelleenlaskenta käyttää päivämääräjärjestystä, ei tuontijärjestystä', () => {
  const g = [[['a', 'b'], ['c', 'd'], 21, 12], [['a', 'c'], ['b', 'd'], 21, 19]];
  const players = reg('A', 'B', 'C', 'D');
  const map = { p0: 'a', p1: 'b', p2: 'c', p3: 'd' };
  const registry = Object.fromEntries(Object.entries(map).map(([k, v]) => [v, players[k]]));
  const i1 = gamesImport('x1', '2026-05-01', g), i2 = gamesImport('x2', '2026-05-08', g.map(([t1, t2, a, b]) => [t2, t1, a, b]));
  const r1 = R.rkCompute({ players: registry, imports: { x1: i1, x2: i2 } });
  const r2 = R.rkCompute({ players: registry, imports: { x2: Object.assign({}, i2, { importedAt: '1' }), x1: Object.assign({}, i1, { importedAt: '2' }) } });
  ['a', 'b', 'c', 'd'].forEach(p => assert.ok(Math.abs(r1.players[p].mu - r2.players[p].mu) < 1e-12));
  const rows = R.rkTableRows(r1, registry, '2026-05-10');
  assert.equal(rows.length, 4); assert.equal(rows[0].rank, 1);
  assert.ok(R.rkTableRows(r1, registry, '2027-05-10').length === 0, 'passiiviset piilossa oletuksena');
});

test('Pelaajien yhdistäminen korvaa tunnisteen ja estää päällekkäisyyden', () => {
  const imports = { i1: gamesImport('i1', '2026-01-01', [[['a', 'b'], ['c', 'd'], 21, 10]]), i2: gamesImport('i2', '2026-01-08', [[['x', 'b'], ['c', 'd'], 21, 10]]) };
  imports.i2.names = { x: 'Jukka', b: 'B' };
  const m = R.rkMergeImports(imports, 'x', 'a');
  same(Object.keys(m.imports), ['i2']);
  same([...m.imports.i2.games[0].t1], ['a', 'b']);
  assert.equal(m.imports.i2.names.a, 'Jukka');
  assert.ok(R.rkMergeImports(imports, 'b', 'a').error);
});
