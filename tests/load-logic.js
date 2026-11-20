// Loads the pure tournament logic straight out of index.html (between the
// PURE-LOGIC-START / PURE-LOGIC-END markers) into a sandbox, so the app keeps
// working as a single file with no build step and the tests always run
// against the exact code the browser runs.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HTML_PATH = path.join(__dirname, '..', 'index.html');
const START = '// ==== PURE-LOGIC-START';
const END = '// ==== PURE-LOGIC-END';

function extractLogicSource(html) {
  const s = html.indexOf(START);
  const e = html.indexOf(END);
  if (s < 0 || e < 0 || e < s) throw new Error('PURE-LOGIC markers not found in index.html');
  return html.slice(s + START.length, e);
}

function loadLogic() {
  const src = extractLogicSource(fs.readFileSync(HTML_PATH, 'utf8'));
  // Top-level function and const names in the block. Function declarations
  // would leak onto the sandbox anyway, but consts do not, so collect both
  // and return them from the script's completion value.
  const names = new Set();
  const ID = '[\\p{L}_$][\\p{L}\\p{N}_$]*';
  for (const m of src.matchAll(new RegExp(`^ {4}function\\s+(${ID})`, 'gmu'))) names.add(m[1]);
  for (const m of src.matchAll(/^ {4}const\s+([^\n]*)/gmu)) {
    for (const d of m[1].matchAll(new RegExp(`(?:^|,\\s*)(${ID})\\s*=(?!=)`, 'gu'))) names.add(d[1]);
  }
  // Compiled as a function in this realm (so arrays/objects compare cleanly
  // with assert.deepStrictEqual). LOCAL_LATENCY comes from the surrounding app
  // script and is only read by the localStorage backend.
  const body = `${src}\nreturn { ${[...names].join(', ')} };`;
  const fn = vm.compileFunction(body, ['LOCAL_LATENCY'], { filename: HTML_PATH });
  return fn(0);
}

module.exports = { loadLogic, extractLogicSource };
