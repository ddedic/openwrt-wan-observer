const assert = require('node:assert/strict');
const test = require('node:test');

const { createWanObserverPage } = require('../src/app/WanObserverPage');
const {
  createHistoryWorkflow,
} = require('../src/features/history/history-workflow');
const {
  createSpeedtestWorkflow,
} = require('../src/features/speedtest/speedtest-workflow');
const {
  createSettingsWorkflow,
} = require('../src/features/settings/settings-workflow');
const {
  createExportWorkflow,
} = require('../src/features/reports/export-workflow');

test('page explicitly composes workflow methods without collisions or shared state', () => {
  const request = () => assert.fail('assembly must not make requests');
  const groups = [
    createHistoryWorkflow(request),
    createSpeedtestWorkflow(request),
    createSettingsWorkflow(request),
    createExportWorkflow(),
  ];
  const names = groups.flatMap((group) => Object.keys(group));
  assert.equal(new Set(names).size, names.length);

  const page = createWanObserverPage('synthetic CSS');
  assert.equal(page.name, 'wan-observer');
  for (const name of names) {
    assert.equal(typeof page.methods[name], 'function', name);
  }
  const first = page.data();
  const second = page.data();
  first.active.down = 7;
  assert.equal(second.active.down, -1);
});
