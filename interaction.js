/**
 * Shared interaction mapping — pure functions, no DOM.
 * Maps AI answer structures onto discovered controls.
 */
'use strict';

function normStr(s) {
  return String(s || '').toLowerCase().replace(/[–—−]/g, '-').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenOverlap(a, b) {
  const ta = normStr(a).split(' ').filter(w => w.length > 2);
  const tb = new Set(normStr(b).split(' ').filter(w => w.length > 2));
  if (!ta.length || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / ta.length;
}

/**
 * Match item label to a discovered draggable.
 * Prefer exact, then contains (shorter inside longer), then token overlap >= 0.6.
 */
function matchControl(label, controls) {
  const n = normStr(label);
  if (!n || !controls || !controls.length) return null;
  let hit = controls.find(c => normStr(c.text) === n);
  if (hit) return hit;
  hit = controls.find(c => {
    const ct = normStr(c.text);
    if (!ct) return false;
    const short = n.length < ct.length ? n : ct;
    const long = n.length < ct.length ? ct : n;
    return short.length >= 3 && long.includes(short) && short.length / long.length >= 0.35;
  });
  if (hit) return hit;
  let best = null, bestScore = 0;
  for (const c of controls) {
    const s = tokenOverlap(label, c.text);
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return best && bestScore >= 0.6 ? best : null;
}

/**
 * Map {item: zoneAnswerText} onto discovered items + zones.
 * Zone labels are short categories ("legitimacy"); AI zone values are often full sentences.
 * Match if zone label is contained in the answer sentence OR answer is contained in zone text.
 */
function mapDragDrop(itemMap, items, zones) {
  const placements = [];
  const failures = [];
  if (!itemMap || typeof itemMap !== 'object' || Array.isArray(itemMap)) {
    return { placements, failures: [{ code: 'UNSUPPORTED_SHAPE', detail: 'answer must be object map' }] };
  }
  for (const [itemText, zoneText] of Object.entries(itemMap)) {
    const item = matchControl(itemText, items);
    if (!item) {
      failures.push({ code: 'TARGET_NOT_FOUND', role: 'item', label: itemText });
      continue;
    }
    // Prefer zone whose short label appears inside the AI sentence
    let zone = null;
    const zn = normStr(zoneText);
    zone = zones.find(z => {
      const zt = normStr(z.text);
      if (!zt) return false;
      if (zt === zn) return true;
      if (zt.length >= 3 && zn.includes(zt)) return true;
      if (zn.length >= 3 && zt.includes(zn) && zn.length / zt.length >= 0.4) return true;
      return false;
    }) || null;
    if (!zone) zone = matchControl(zoneText, zones);
    if (!zone) {
      failures.push({ code: 'TARGET_NOT_FOUND', role: 'zone', label: zoneText, item: item.text });
      continue;
    }
    placements.push({ item, zone, itemLabel: itemText, zoneLabel: zoneText });
  }
  return { placements, failures };
}

function interactionResult(partial) {
  return {
    stage: partial.stage || 'attempted',
    ok: !!partial.ok,
    code: partial.code || (partial.ok ? 'OK' : 'STATE_NOT_OBSERVED'),
    detail: partial.detail || '',
    observed: partial.observed || null
  };
}

function controlsToDragSets(controls) {
  const items = (controls || []).filter(c => c.kind === 'draggable' && c.name).map(c => ({ text: c.name, el: { nodeId: c.nodeId } }));
  const zones = (controls || []).filter(c => c.kind === 'dropzone' && c.name).map(c => ({ text: c.name, el: { nodeId: c.nodeId } }));
  return { items, zones };
}

module.exports = {
  normStr,
  tokenOverlap,
  matchControl,
  mapDragDrop,
  interactionResult,
  controlsToDragSets
};
