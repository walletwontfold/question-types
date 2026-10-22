#!/usr/bin/env node
/**
 * QA crawler — registry inventory + independent oracle checks on fixtures.
 * Does not auto-submit live IXL. Distinguishes SIMULATED vs BROWSER vs unit.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const { verifyCompletion, createSubmissionGuard } = require('./completion.js');
const { createStore } = require('./knowledge_store.js');

const root = __dirname;
const registry = JSON.parse(fs.readFileSync(path.join(root, 'registry.json'), 'utf8'));
const outDir = path.join(root, 'qa_results');
fs.mkdirSync(outDir, { recursive: true });

const HANDLERS = {
  'fill-in': 'applyFillIn', 'multiple-choice': 'applyMultipleChoice', 'multiple-select': 'applyMultipleChoice',
  'fraction': 'applyFraction', 'dropdown': 'applyDropdown', 'text-highlight': 'applyTextHighlight',
  'choice-matrix': 'applyChoiceMatrix', 'drag-drop': 'applyDragDrop', 'matching-sorting': 'partial',
  'graph-placement': null, 'number-line': null, 'hot-spot': null, 'equation-editor': null,
  'tables-charts': null, 'unknown': null
};

function inventory() {
  return registry.types.map(t => ({
    id: t.id,
    trust: t.trust,
    handler: HANDLERS[t.id] === undefined ? 'UNKNOWN_MAP' : (HANDLERS[t.id] || null),
    status: !HANDLERS[t.id] ? 'NOT_IMPLEMENTED' : 'HAS_HANDLER'
  }));
}

/** Minimal DOM mock for oracle */
function makeHighlightRoot(selectedIndex) {
  const words = ['The', 'cat', 'ran', 'quickly', 'home'];
  const chunks = words.map((w, i) => ({
    className: 'select-words-chunk' + (i === selectedIndex ? ' is-selected' : ''),
    innerText: w,
    offsetParent: {},
    getAttribute(k) {
      if (k === 'aria-selected') return i === selectedIndex ? 'true' : null;
      return null;
    },
    matches() { return false; },
    querySelector() { return null; },
    parentElement: null
  }));
  return {
    querySelectorAll(sel) {
      if (/select-word/i.test(sel)) return chunks;
      return [];
    }
  };
}

function makeFillRoot(value) {
  const input = {
    tagName: 'INPUT', className: 'fillIn', value, offsetParent: {}, id: 'ans',
    getAttribute: () => 'answer', closest: () => null, isContentEditable: false,
    matches: (s) => s === 'input', querySelector: () => null, parentElement: null
  };
  return {
    querySelectorAll(sel) {
      if (/input|fillIn|textarea|contenteditable/i.test(sel) || String(sel).includes('fill')) return [input];
      return [];
    }
  };
}

const results = [];

function record(r) {
  results.push(r);
  const mark = r.outcome === 'PASS' ? 'PASS' : r.outcome === 'FAIL' ? 'FAIL' : r.outcome;
  console.log(mark, r.id, '-', r.case, ':', r.detail || '');
}

// --- Inventory ---
const inv = inventory();
console.log('\n=== REGISTRY INVENTORY ===');
inv.forEach(x => console.log(`  ${x.id} trust=${x.trust} handler=${x.handler || '—'} ${x.status}`));

// --- Oracle: text-highlight ---
record({
  id: 'text-highlight', case: 'no-selection',
  outcome: verifyCompletion('text-highlight', { root: makeHighlightRoot(-1) }).complete === false ? 'PASS' : 'FAIL',
  detail: 'oracle complete=false when none selected', kind: 'SIMULATED'
});
record({
  id: 'text-highlight', case: 'selected-quickly',
  outcome: verifyCompletion('text-highlight', { root: makeHighlightRoot(3) }).complete === true ? 'PASS' : 'FAIL',
  detail: 'oracle complete=true when quickly selected', kind: 'SIMULATED'
});

// Simulated handler claim vs oracle disagreement
const claimedSuccess = true; // old bug: log success after click
const oracle = verifyCompletion('text-highlight', { root: makeHighlightRoot(-1) });
record({
  id: 'text-highlight', case: 'handler-claim-vs-oracle',
  outcome: (claimedSuccess && !oracle.complete) ? 'PASS' : 'FAIL',
  detail: 'detects disagreement: handler claimed success, oracle incomplete', kind: 'SIMULATED'
});

// --- Oracle: fill-in duplication ---
record({
  id: 'fill-in', case: 'reject-duplicated-10.15',
  outcome: verifyCompletion('fill-in', { root: makeFillRoot('10.1510.15'), intendedAnswer: '10.15' }).complete === false ? 'PASS' : 'FAIL',
  detail: 'duplicated value must not complete', kind: 'SIMULATED'
});
record({
  id: 'fill-in', case: 'accept-exact-10.15',
  outcome: verifyCompletion('fill-in', { root: makeFillRoot('10.15'), intendedAnswer: '10.15' }).complete === true ? 'PASS' : 'FAIL',
  detail: 'exact value completes', kind: 'SIMULATED'
});

// --- Submission guard ---
const g = createSubmissionGuard();
const blocked = !g.canSubmit({ complete: false, evidence: 'no highlight' });
record({
  id: '_guard', case: 'block-unverified',
  outcome: blocked ? 'PASS' : 'FAIL',
  detail: 'submission blocked when incomplete', kind: 'UNIT'
});

// --- Trust: cannot promote on failed test ---
const store = createStore({ types: [{ id: 'text-highlight', trust: 'candidate' }] });
// failed oracle does not call setTrust validated
record({
  id: 'text-highlight', case: 'no-silent-trust-promotion',
  outcome: store.isAutoEligible('text-highlight') === false ? 'PASS' : 'FAIL',
  detail: 'candidate remains ineligible', kind: 'UNIT'
});

// --- Chrome fixture dump (capability) ---
let chromeOk = false;
const fixturePath = path.join(root, 'fixtures', 'text_highlight.html');
try {
  const r = spawnSync('google-chrome', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--virtual-time-budget=2000',
    'file://' + fixturePath
  ], { encoding: 'utf8', timeout: 15000 });
  chromeOk = r.status === 0 || (r.stdout && r.stdout.length > 0) || (r.stderr && /DevTools/.test(r.stderr));
  // dump-dom alternate
  const r2 = spawnSync('google-chrome', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--dump-dom',
    'file://' + fixturePath
  ], { encoding: 'utf8', timeout: 20000 });
  const dom = r2.stdout || '';
  const hasChunks = /select-words-chunk/.test(dom);
  const chromeMissing = r2.error || r2.status == null;
  record({
    id: '_env', case: 'chrome-headless-fixture-dump',
    outcome: hasChunks ? 'PASS' : (chromeMissing ? 'BLOCKED' : 'FAIL'),
    detail: hasChunks ? 'fixture DOM contains chunks' : (chromeMissing ? 'chrome unavailable' : 'dump missing chunks status=' + r2.status),
    kind: 'BROWSER_HEADLESS'
  });
  if (hasChunks) {
    fs.writeFileSync(path.join(outDir, 'text_highlight_dump.html'), dom.slice(0, 50000));
  }
} catch (e) {
  record({
    id: '_env', case: 'chrome-headless-fixture-dump',
    outcome: 'BLOCKED', detail: String(e.message || e), kind: 'BROWSER_HEADLESS'
  });
}

// Coverage matrix merge
const matrix = inv.map(row => {
  const typeResults = results.filter(r => r.id === row.id);
  let browser = 'NOT_TESTED';
  let simulated = typeResults.some(r => r.kind === 'SIMULATED' && r.outcome === 'PASS');
  let failed = typeResults.some(r => r.outcome === 'FAIL');
  if (failed) browser = 'FAILED';
  else if (simulated) browser = 'SIMULATED_PASS';
  if (!row.handler) browser = row.status === 'NOT_IMPLEMENTED' ? 'NOT_IMPLEMENTED' : browser;
  return { ...row, oracle: typeResults, overall: failed ? 'FAILED' : (row.handler ? (simulated ? 'SIMULATED_PASS' : 'NOT_TESTED') : 'NOT_IMPLEMENTED') };
});

const summary = {
  generatedAt: new Date().toISOString(),
  chromeHeadlessAttempted: true,
  results,
  matrix,
  counts: results.reduce((a, r) => { a[r.outcome] = (a[r.outcome] || 0) + 1; return a; }, {})
};
fs.writeFileSync(path.join(outDir, 'crawler_report.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(root, 'coverage_matrix.json'), JSON.stringify({ generatedAt: summary.generatedAt, rows: matrix }, null, 2));

console.log('\n=== SUMMARY ===');
console.log(summary.counts);
const fails = results.filter(r => r.outcome === 'FAIL');
if (fails.length) {
  console.log('FAILURES:', fails.map(f => f.id + '/' + f.case).join(', '));
  process.exit(1);
}
console.log('All crawler oracle checks passed (see qa_results/crawler_report.json)');
process.exit(0);
