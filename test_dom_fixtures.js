/**
 * Lightweight DOM fixture tests (no browser) for highlight + fill completion contracts.
 * Run: node question_types/test_dom_fixtures.js
 */
'use strict';
const assert = require('assert');
const { verifyCompletion, isChoiceSelected, createSubmissionGuard, MAX_RECOVERY_ATTEMPTS } = require('./completion.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('PASS', name); passed++; }
  catch (e) { console.log('FAIL', name, e.message); failed++; }
}

function el(tag, attrs, kids) {
  const o = {
    tagName: (tag || 'DIV').toUpperCase(),
    className: attrs.className || '',
    id: attrs.id || '',
    value: attrs.value != null ? attrs.value : '',
    offsetParent: attrs.hidden ? null : {},
    attributes: attrs,
    children: kids || [],
    parentElement: null,
    isContentEditable: !!attrs.contentEditable,
    innerText: attrs.innerText || '',
    textContent: attrs.innerText || '',
    getAttribute(k) { return this.attributes[k] != null ? this.attributes[k] : (k === 'aria-selected' || k === 'aria-pressed' || k === 'aria-checked' ? (this.attributes[k] || null) : null); },
    matches(sel) { return sel === 'input' && this.tagName === 'INPUT'; },
    querySelector() { return null; },
    closest(sel) { return sel === '#cinder-ixl-panel' && this._inPanel ? this : null; }
  };
  (kids || []).forEach(k => { k.parentElement = o; });
  return o;
}

test('highlight incomplete when no selection', () => {
  const c1 = el('span', { className: 'select-words-chunk', innerText: 'quickly' });
  const c2 = el('span', { className: 'select-words-chunk', innerText: 'happy' });
  const root = {
    querySelectorAll(sel) {
      if (/select-word/i.test(sel)) return [c1, c2];
      return [];
    }
  };
  const r = verifyCompletion('text-highlight', { root });
  assert.strictEqual(r.complete, false);
});

test('highlight complete when aria-selected true', () => {
  const c1 = el('span', { className: 'select-words-chunk', innerText: 'quickly', 'aria-selected': 'true' });
  const c2 = el('span', { className: 'select-words-chunk', innerText: 'happy' });
  const root = {
    querySelectorAll(sel) {
      if (/select-word/i.test(sel)) return [c1, c2];
      return [];
    }
  };
  const r = verifyCompletion('text-highlight', { root });
  assert.strictEqual(r.complete, true);
});

test('highlight complete when selected class present', () => {
  const c1 = el('span', { className: 'select-words-chunk is-selected', innerText: 'quickly' });
  const root = { querySelectorAll(sel) { return /select-word/i.test(sel) ? [c1] : []; } };
  const r = verifyCompletion('text-highlight', { root });
  assert.strictEqual(r.complete, true);
});

test('fill exact match 10.15 not 10.1510.15', () => {
  const input = el('input', { className: 'fillIn', value: '10.1510.15' });
  input.tagName = 'INPUT';
  const root = {
    querySelectorAll(sel) {
      if (/input|fillIn|textarea|contenteditable/i.test(sel) || sel.includes('fill')) return [input];
      return [];
    }
  };
  const r = verifyCompletion('fill-in', { root, intendedAnswer: '10.15' });
  assert.strictEqual(r.complete, false);
});

test('fill exact match accepts 10.15', () => {
  const input = el('input', { className: 'fillIn', value: '10.15' });
  input.tagName = 'INPUT';
  const root = {
    querySelectorAll(sel) {
      if (/input|fillIn|textarea|contenteditable/i.test(sel) || sel.includes('fill')) return [input];
      return [];
    }
  };
  const r = verifyCompletion('fill-in', { root, intendedAnswer: '10.15' });
  assert.strictEqual(r.complete, true);
});

test('lifecycle: stop concept — recovery exhaust is terminal', () => {
  const g = createSubmissionGuard();
  for (let i = 0; i < MAX_RECOVERY_ATTEMPTS + 1; i++) g.onIncomplete();
  assert.strictEqual(g.state, 'ERROR');
  assert.ok(g.onIncomplete().stop);
});

console.log('\n---');
console.log('Passed:', passed, 'Failed:', failed);
process.exit(failed ? 1 : 0);
