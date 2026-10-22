/**
 * Run: node question_types/test_interaction.js
 */
'use strict';
const assert = require('assert');
const { mapDragDrop, matchControl, controlsToDragSets } = require('./interaction.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('PASS', name); passed++; }
  catch (e) { console.log('FAIL', name, e.message); failed++; }
}

const items = [
  { text: 'legitimacy', el: { id: 'i1' } },
  { text: 'power', el: { id: 'i2' } },
  { text: 'authority', el: { id: 'i3' } }
];
const zones = [
  { text: 'Right to rule accepted by the people', el: { id: 'z1' } },
  { text: 'Ability to make others do what you want', el: { id: 'z2' } },
  { text: 'Legal right to give orders', el: { id: 'z3' } }
];
// AI inverted: keys are terms, values are definitions (zones hold definitions)
const aiMap = {
  legitimacy: 'Right to rule accepted by the people',
  power: 'Ability to make others do what you want',
  authority: 'Legal right to give orders'
};

test('maps short items onto long zone sentences', () => {
  const { placements, failures } = mapDragDrop(aiMap, items, zones);
  assert.strictEqual(failures.length, 0);
  assert.strictEqual(placements.length, 3);
  assert.strictEqual(placements[0].zone.el.id, 'z1');
  assert.strictEqual(placements[2].zone.el.id, 'z3');
});

test('old bug: searching zones by full sentence when zones are short labels fails if inverted', () => {
  // Real failure shape: zones labeled legitimacy/power/authority, AI values are full sentences
  const shortZones = [
    { text: 'legitimacy', el: { id: 'zL' } },
    { text: 'power', el: { id: 'zP' } },
    { text: 'authority', el: { id: 'zA' } }
  ];
  const longItems = [
    { text: 'Right to rule accepted by the people', el: { id: 'i1' } },
    { text: 'Ability to make others do what you want', el: { id: 'i2' } },
    { text: 'Legal right to give orders', el: { id: 'i3' } }
  ];
  // AI: { full sentence : category }
  const map = {
    'Right to rule accepted by the people': 'legitimacy',
    'Ability to make others do what you want': 'power',
    'Legal right to give orders': 'authority'
  };
  const { placements, failures } = mapDragDrop(map, longItems, shortZones);
  assert.strictEqual(failures.length, 0, JSON.stringify(failures));
  assert.strictEqual(placements.find(p => p.zone.el.id === 'zL').item.el.id, 'i1');
});

test('missing zone is TARGET_NOT_FOUND not silent success', () => {
  const { placements, failures } = mapDragDrop(
    { legitimacy: 'not a real zone' },
    items,
    zones
  );
  assert.strictEqual(placements.length, 0);
  assert.ok(failures.some(f => f.code === 'TARGET_NOT_FOUND'));
});

test('ambiguous short token does not force a bad match below threshold', () => {
  const hit = matchControl('x', [{ text: 'completely unrelated category' }]);
  assert.strictEqual(hit, null);
});

test('duplicate category labels stay distinct by exact text', () => {
  const z = [
    { text: 'power', el: { id: 'a' } },
    { text: 'empowerment programs', el: { id: 'b' } }
  ];
  const { placements } = mapDragDrop({ power: 'power' }, [{ text: 'power', el: { id: 'i' } }], z);
  assert.strictEqual(placements[0].zone.el.id, 'a');
});

test('CDP control map feeds drag mapping', () => {
  const report = {
    controls: [
      { kind: 'draggable', nodeId: 11, name: 'Right to rule accepted by the people', box: { x: 40, y: 200, w: 280, h: 36 }, visible: true },
      { kind: 'draggable', nodeId: 12, name: 'Ability to make others do what you want', box: { x: 40, y: 250, w: 280, h: 36 }, visible: true },
      { kind: 'draggable', nodeId: 13, name: 'Legal right to give orders', box: { x: 40, y: 300, w: 280, h: 36 }, visible: true },
      { kind: 'dropzone', nodeId: 21, name: 'legitimacy', role: null, box: { x: 400, y: 180, w: 220, h: 80 }, visible: true },
      { kind: 'dropzone', nodeId: 22, name: 'power', box: { x: 400, y: 280, w: 220, h: 80 }, visible: true },
      { kind: 'dropzone', nodeId: 23, name: 'authority', box: { x: 400, y: 380, w: 220, h: 80 }, visible: true },
      { kind: 'input', nodeId: 31, name: 'answer', value: '', box: { x: 20, y: 80, w: 120, h: 28 }, visible: true },
      { kind: 'highlight', nodeId: 41, name: 'quickly', ariaSelected: 'true', box: { x: 90, y: 120, w: 60, h: 18 }, visible: true }
    ]
  };
  const { items, zones } = controlsToDragSets(report.controls);
  const mapped = mapDragDrop({
    'Right to rule accepted by the people': 'legitimacy',
    'Ability to make others do what you want': 'power',
    'Legal right to give orders': 'authority'
  }, items, zones);
  assert.strictEqual(mapped.failures.length, 0);
  assert.strictEqual(mapped.placements[0].zone.el.nodeId, 21);
  const inputs = report.controls.filter(c => c.kind === 'input');
  const hi = report.controls.filter(c => c.kind === 'highlight' && c.ariaSelected === 'true');
  assert.strictEqual(inputs[0].value, '');
  assert.strictEqual(hi[0].name, 'quickly');
  console.log('MAP', JSON.stringify(mapped.placements.map(p => ({ item: p.item.text, zone: p.zone.text, nodeId: p.zone.el.nodeId }))));
});
console.log('Passed:', passed, 'Failed:', failed);
process.exit(failed ? 1 : 0);
