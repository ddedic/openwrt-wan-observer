const assert = require('node:assert/strict');
const test = require('node:test');

const { componentSource } = require('./component-source');
const { SCENARIOS, renderScenario } = require('./render-scenarios');
const expected = require('./fixtures/render-contract.json');

for (const native of [false, true]) {
  for (const scenario of SCENARIOS) {
    test(`preserves ${native ? 'native' : 'plain'} ${scenario} rendering from ${expected.baseline}`, () => {
      assert.equal(
        renderScenario(componentSource(), scenario, native).digest,
        expected.cases[`${native}:${scenario}`],
      );
    });
  }
}
