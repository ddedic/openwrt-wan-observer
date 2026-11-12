const assert = require('node:assert/strict');
const test = require('node:test');

const { componentSource } = require('./component-source');
const { renderScenario } = require('./render-scenarios');

function find(node, predicate) {
  if (Array.isArray(node)) {
    return node.flatMap((child) => find(child, predicate));
  }
  if (!node || typeof node !== 'object') {
    return [];
  }
  return [
    ...(predicate(node) ? [node] : []),
    ...find(node.children, predicate),
  ];
}

function text(node) {
  if (Array.isArray(node)) {
    return node.map(text).join(' ');
  }
  if (node && typeof node === 'object') {
    return text(node.children);
  }
  return node == null ? '' : String(node);
}

test('settings inputs, blur and discard confirmation update the owning page', () => {
  const scene = renderScenario(componentSource(), 'settings');
  const input = find(
    scene.tree,
    (node) => node.data.attrs?.id === 'wo-f-download_mbps',
  )[0];

  input.data.on.input({ target: { value: '321' } });
  input.data.on.blur();
  assert.equal(scene.page.form.download_mbps, '321');
  assert.equal(scene.page.touched.download_mbps, true);

  const cancel = find(
    scene.render(),
    (node) => node.tag === 'button' && text(node) === 'Cancel',
  )[0];
  cancel.data.on.click();
  assert.equal(scene.page.confirmDiscard, true);
  assert.equal(scene.page.sheet, 'settings');

  const keep = find(
    scene.render(),
    (node) => node.tag === 'button' && text(node) === 'Keep editing',
  )[0];
  keep.data.on.click();
  assert.equal(scene.page.confirmDiscard, false);
  assert.equal(scene.page.form.download_mbps, '321');
});

test('export appendix and modal close callbacks preserve page ownership', () => {
  const scene = renderScenario(componentSource(), 'export');
  const appendix = find(
    scene.tree,
    (node) => node.data.attrs?.id === 'wo-f-appendix',
  )[0];

  appendix.data.on.change({ target: { checked: true } });
  assert.equal(scene.page.appendix, true);

  const dialog = find(scene.tree, (node) => node.tag === 'dialog')[0];
  assert.equal(dialog.data.ref, 'dialog');
  let prevented = false;
  let stopped = false;
  dialog.data.on.keydown({
    key: 'Escape',
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {
      stopped = true;
    },
  });
  assert.equal(prevented && stopped, true);
  assert.equal(scene.page.sheet, '');
});

test('the shared dialog keeps Tab inside the page-owned dialog', () => {
  const scene = renderScenario(componentSource(), 'settings');
  const dialog = find(scene.tree, (node) => node.tag === 'dialog')[0];
  const focused = [];
  const first = { offsetParent: {}, focus: () => focused.push('first') };
  const last = { offsetParent: {}, focus: () => focused.push('last') };
  const target = {
    querySelectorAll: () => [first, last],
    contains: () => true,
  };
  const event = { key: 'Tab', currentTarget: target, preventDefault: () => {} };

  scene.document.activeElement = first;
  dialog.data.on.keydown({ ...event, shiftKey: true });
  scene.document.activeElement = last;
  dialog.data.on.keydown({ ...event, shiftKey: false });

  assert.deepEqual(focused, ['last', 'first']);
});

test('history callbacks toggle the live page repeatedly and reset expanded rows when filtering', () => {
  const scene = renderScenario(componentSource(), 'recorded');
  const record = scene.page.payload.measurements[0];
  scene.page.payload.measurements = Array.from({ length: 8 }, (_, index) => ({
    ...record,
    timestamp: `2026-11-12T11:${String(index).padStart(2, '0')}:00Z`,
  }));

  const show = find(
    scene.render(),
    (node) => node.tag === 'button' && text(node).startsWith('Show all'),
  )[0];
  show.data.on.click();
  assert.equal(scene.page.showAll, true);
  show.data.on.click();
  assert.equal(
    scene.page.showAll,
    false,
    'callback must read the live page, not a stale snapshot',
  );

  scene.page.showAll = true;
  const label = find(
    scene.render(),
    (node) =>
      node.tag === 'label' && text(node).includes('Slow and failed only'),
  )[0];
  const input = find(label, (node) => node.tag === 'input')[0];
  input.data.on.change({ target: { checked: true } });
  assert.equal(scene.page.issuesOnly, true);
  assert.equal(scene.page.showAll, false);
});
