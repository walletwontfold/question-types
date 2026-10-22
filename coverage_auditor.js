#!/usr/bin/env node
/**
 * Registry coverage auditor — compares registry.json to known solver handlers & tests.
 * Does NOT claim browser verification. Statuses: IMPLEMENTED, PARTIAL, REGISTERED_ONLY, UNSUPPORTED.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const registry = JSON.parse(fs.readFileSync(path.join(__dirname, 'registry.json'), 'utf8'));

// Solver handler map (static inventory from IXLSolver.user.js)
const HANDLERS = {
  'fill-in': { apply: 'applyFillIn', complete: true, unit: true },
  'multiple-choice': { apply: 'applyMultipleChoice', complete: true, unit: true },
  'multiple-select': { apply: 'applyMultipleChoice', complete: true, unit: true },
  'fraction': { apply: 'applyFraction', complete: true, unit: true },
  'dropdown': { apply: 'applyDropdown', complete: true, unit: false },
  'text-highlight': { apply: 'applyTextHighlight', complete: true, unit: true },
  'choice-matrix': { apply: 'applyChoiceMatrix', complete: true, unit: false },
  'drag-drop': { apply: 'applyDragDrop', complete: true, unit: false },
  'matching-sorting': { apply: 'partial', complete: true, unit: false },
  'graph-placement': { apply: null, complete: false, unit: true },
  'number-line': { apply: null, complete: false, unit: false },
  'hot-spot': { apply: null, complete: false, unit: true },
  'equation-editor': { apply: null, complete: false, unit: true },
  'tables-charts': { apply: null, complete: false, unit: false },
  'unknown': { apply: null, complete: false, unit: true }
};

const rows = [];
for (const t of registry.types) {
  const h = HANDLERS[t.id] || {};
  let status = 'REGISTERED_ONLY';
  if (!h.apply && (t.trust === 'unknown' || t.id === 'unknown' || t.id === 'graph-placement')) status = 'UNSUPPORTED';
  else if (h.apply === 'partial') status = 'PARTIAL';
  else if (h.apply) status = h.unit ? 'IMPLEMENTED_UNIT' : 'IMPLEMENTED_NO_UNIT';
  if (t.trust === 'deprecated') status = 'DEPRECATED';
  rows.push({
    id: t.id,
    trust: t.trust,
    confidence: t.confidence,
    handler: h.apply || '—',
    completion: !!h.complete,
    unitTests: !!h.unit,
    status,
    browser: 'NOT_TESTED'
  });
}

console.log('| id | trust | handler | completion | unit | status | browser |');
console.log('|----|-------|---------|------------|------|--------|---------|');
for (const r of rows) {
  console.log(`| ${r.id} | ${r.trust} | ${r.handler} | ${r.completion} | ${r.unitTests} | ${r.status} | ${r.browser} |`);
}

const out = path.join(__dirname, 'coverage_matrix.json');
fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
console.log('\nWrote', out);
console.log('Counts:', rows.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {}));
