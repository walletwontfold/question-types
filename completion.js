/**
 * Answer completion verification — evidence-based, type-specific.
 * Never treat "click succeeded" as "answer registered".
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CinderCompletion = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normalize(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function isChoiceSelected(el) {
    if (!el) return false;
    let cur = el;
    for (let depth = 0; depth < 6 && cur; depth++) {
      const aria = (
        (cur.getAttribute && (cur.getAttribute('aria-pressed') || cur.getAttribute('aria-selected') || cur.getAttribute('aria-checked'))) || ''
      ).toLowerCase();
      if (aria === 'true') return true;
      const cls = String(cur.className || '');
      if (/SelectableTile--selected|TileMultipleChoices--selected|is-selected|isSelected|--chosen|--active|tile--selected|answer--selected|select-word--selected|selected|highlighted|is-highlighted/i.test(cls)) return true;
      if (cur.getAttribute && (cur.getAttribute('data-selected') === 'true' || cur.getAttribute('data-state') === 'selected')) return true;
      const input = cur.matches && cur.matches('input') ? cur : (cur.querySelector && cur.querySelector('input[type="radio"], input[type="checkbox"]'));
      if (input && input.checked) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  function getFillValues(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return [];
    const inputs = [...d.querySelectorAll(
      'input.fillIn, .fillIn input, input[class*="fillIn"], .science-fill-in, ' +
      'input[aria-label="answer"], input[type="text"]:not([type="hidden"]), input[type="number"], textarea, [contenteditable="true"]'
    )].filter(el => {
      if (!el || el.offsetParent === null) return false;
      if (el.closest && el.closest('#cinder-ixl-panel')) return false;
      const id = (el.id || '');
      if (/^c-|^cinder/i.test(id)) return false;
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (type === 'password' || type === 'hidden') return false;
      return true;
    });
    return inputs.map(el => {
      if (el.isContentEditable) return normalize(el.innerText || el.textContent);
      return normalize(el.value);
    });
  }

  function countSelectedTiles(root) {
    const scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope) return 0;
    const tiles = [...scope.querySelectorAll('.SelectableTile, [class*="SelectableTile"], .TileMultipleChoices, [class*="TileMultipleChoices"]')];
    return tiles.filter(isChoiceSelected).length;
  }

  /**
   * verifyCompletion(qtype, opts) -> { complete: boolean, evidence: string, details: object }
   * opts: { root, intendedAnswer, minSelected }
   */
  function verifyCompletion(qtype, opts) {
    opts = opts || {};
    const root = opts.root || null;
    const intended = opts.intendedAnswer;
    const details = { qtype, checks: [] };

    if (qtype === 'fill-in' || qtype === 'fraction' || qtype === 'text-entry') {
      const values = getFillValues(root || (typeof document !== 'undefined' ? document : null));
      const nonEmpty = values.filter(v => v.length > 0);
      details.checks.push({ name: 'fill-nonempty', values, nonEmpty: nonEmpty.length });
      if (!nonEmpty.length) {
        return { complete: false, evidence: 'no fill-in value registered', details };
      }
      if (intended != null && intended !== '') {
        const want = normalize(String(intended));
        // exact (normalized whitespace/case) — do not accept prefix/contains (10.1510.15 must fail for 10.15)
        const hit = nonEmpty.some(v => v === want);
        details.checks.push({ name: 'fill-matches-intended', hit, intended: String(intended), values: nonEmpty });
        if (!hit) {
          return { complete: false, evidence: 'fill value does not match intended', details, mismatch: true };
        }
      }
      return { complete: true, evidence: 'fill-in has registered value', details };
    }

    if (qtype === 'multiple-choice' || qtype === 'multiple-select' || qtype === 'multiselect') {
      const n = countSelectedTiles(root);
      const min = opts.minSelected != null ? opts.minSelected : 1;
      details.checks.push({ name: 'selected-tiles', count: n, min });
      if (n < min) {
        return { complete: false, evidence: `selected tiles ${n} < required ${min}`, details };
      }
      return { complete: true, evidence: `${n} tile(s) selected`, details };
    }

    if (qtype === 'dropdown') {
      const d = root || (typeof document !== 'undefined' ? document : null);
      if (!d) return { complete: false, evidence: 'no document', details };
      const natives = [...d.querySelectorAll('select')].filter(el => el.offsetParent !== null);
      const filledNative = natives.filter(s => s.value && s.selectedIndex >= 0 && s.options[s.selectedIndex] && s.options[s.selectedIndex].text);
      const triggers = [...d.querySelectorAll('.drop-down-input, [class*="dropDownInput"]')].filter(el => el.offsetParent !== null);
      const triggerText = triggers.map(t => normalize(t.innerText || t.getAttribute('aria-label') || ''));
      const anyTrigger = triggerText.some(t => t && !/select|choose|—|-/i.test(t));
      details.checks.push({ name: 'dropdown', filledNative: filledNative.length, triggers: triggerText });
      if (filledNative.length || anyTrigger) {
        return { complete: true, evidence: 'dropdown has selection', details };
      }
      return { complete: false, evidence: 'no dropdown selection registered', details };
    }

    if (qtype === 'text-highlight') {
      const d = root || (typeof document !== 'undefined' ? document : null);
      if (!d) return { complete: false, evidence: 'no document', details };
      const chunks = [...d.querySelectorAll('.select-words-chunk, .select-word, [class*="selectWords"], [class*="SelectWords"]')];
      const selected = chunks.filter(el => {
        if (isChoiceSelected(el)) return true;
        const cls = String(el.className || '');
        if (/selected|active|highlighted/i.test(cls)) return true;
        const aria = (el.getAttribute && (el.getAttribute('aria-selected') || el.getAttribute('aria-pressed') || '')) || '';
        return String(aria).toLowerCase() === 'true';
      });
      details.checks.push({ name: 'highlight-selected', count: selected.length, total: chunks.length });
      if (!selected.length) return { complete: false, evidence: 'no highlight selection', details };
      return { complete: true, evidence: 'highlight selection present', details };
    }

    if (qtype === 'choice-matrix' || qtype === 'matching-sorting') {
      const d = root || (typeof document !== 'undefined' ? document : null);
      if (!d) return { complete: false, evidence: 'no document', details };
      const cells = [...d.querySelectorAll('.choiceCell, [class*="choiceCell"]')];
      const selected = cells.filter(isChoiceSelected);
      details.checks.push({ name: 'matrix-cells', selected: selected.length, total: cells.length });
      if (!selected.length) return { complete: false, evidence: 'no matrix cell selected', details };
      return { complete: true, evidence: `${selected.length} matrix cell(s) selected`, details };
    }

    if (qtype === 'drag-drop') {
      const d = root || (typeof document !== 'undefined' ? document : null);
      if (!d) return { complete: false, evidence: 'no document', details };
      const zones = [...d.querySelectorAll('.dropZone, [class*="dropZone"], [class*="drop-zone"]')];
      // heuristic: zone has child with text or data
      const occupied = zones.filter(z => (z.innerText || '').trim().length > 0 || z.querySelector('[class*="draggable"]'));
      details.checks.push({ name: 'drop-zones', occupied: occupied.length, zones: zones.length });
      if (!occupied.length && zones.length) return { complete: false, evidence: 'no drop zone occupied', details };
      // if no zones found, cannot verify — uncertain
      if (!zones.length) return { complete: false, evidence: 'no drop zones found to verify', details, uncertain: true };
      return { complete: true, evidence: `${occupied.length} zone(s) occupied`, details };
    }

    if (qtype === 'graph' || qtype === 'graph-placement' || qtype === 'number-line' || qtype === 'hot-spot' || qtype === 'equation-editor' || qtype === 'unknown') {
      details.checks.push({ name: 'unsupported-auto-complete', qtype });
      return { complete: false, evidence: `no automated completion check for ${qtype}`, details, unsupported: true };
    }

    // default: require some evidence of interaction
    return { complete: false, evidence: 'unknown type — refuse auto-complete', details, unsupported: true };
  }

  /**
   * State machine helpers for incomplete recovery.
   * States: DETECTED → IDENTIFIED → ANSWERING → VERIFYING → READY_TO_SUBMIT → SUBMITTING → RESULT_CHECK
   *          └──── recovery ────→ IDENTIFIED / ANSWERING (bounded)
   */
  const MAX_SUBMIT_ATTEMPTS = 2;
  const MAX_RECOVERY_ATTEMPTS = 2;

  function createSubmissionGuard() {
    let submitAttempts = 0;
    let recoveryAttempts = 0;
    let state = 'DETECTED';
    const log = [];

    function transition(to, reason) {
      log.push({ from: state, to, reason, t: Date.now() });
      state = to;
    }

    function canSubmit(completion) {
      if (submitAttempts >= MAX_SUBMIT_ATTEMPTS) {
        transition('ERROR', 'max submit attempts');
        return false;
      }
      if (!completion || !completion.complete) {
        transition('VERIFYING', completion ? completion.evidence : 'no completion');
        return false;
      }
      if (completion.unsupported) return false;
      transition('READY_TO_SUBMIT', completion.evidence);
      return true;
    }

    function recordSubmit() {
      submitAttempts++;
      transition('SUBMITTING', 'attempt ' + submitAttempts);
    }

    function onIncomplete() {
      recoveryAttempts++;
      if (recoveryAttempts > MAX_RECOVERY_ATTEMPTS) {
        transition('ERROR', 'max recovery attempts');
        return { recover: false, stop: true };
      }
      transition('ANSWERING', 'incomplete recovery ' + recoveryAttempts);
      return { recover: true, stop: false, attempt: recoveryAttempts };
    }

    function onResultOk() {
      transition('RESULT_CHECK', 'ok');
      submitAttempts = 0;
      recoveryAttempts = 0;
    }

    function reset() {
      submitAttempts = 0;
      recoveryAttempts = 0;
      state = 'DETECTED';
      log.length = 0;
    }

    return {
      get state() { return state; },
      get submitAttempts() { return submitAttempts; },
      get recoveryAttempts() { return recoveryAttempts; },
      get log() { return log.slice(); },
      transition,
      canSubmit,
      recordSubmit,
      onIncomplete,
      onResultOk,
      reset,
      MAX_SUBMIT_ATTEMPTS,
      MAX_RECOVERY_ATTEMPTS
    };
  }

  return {
    verifyCompletion,
    isChoiceSelected,
    getFillValues,
    countSelectedTiles,
    createSubmissionGuard,
    MAX_SUBMIT_ATTEMPTS,
    MAX_RECOVERY_ATTEMPTS,
    normalize
  };
});
