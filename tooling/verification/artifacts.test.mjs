import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

const require = createRequire(
  new URL('../../package/wan-observer-glinet/ui/package.json', import.meta.url),
);
const { buildSync } = require('esbuild');
const UI = 'package/wan-observer-glinet/ui/';

test('release bundle includes runtime suppliers and excludes fixture/development inputs', () => {
  const result = buildSync({
    entryPoints: [`${UI}index.js`],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'cjs',
    loader: { '.css': 'text' },
    legalComments: 'external',
    outfile: resolve('.local/verification/view.js'),
    metafile: true,
  });
  const inputs = Object.keys(result.metafile.inputs);
  assert.ok(inputs.length > 0);
  for (const input of inputs) {
    assert.ok(
      input.startsWith(UI),
      `Unexpected supplier/source root: ${input}`,
    );
    assert.doesNotMatch(
      input,
      /(^|\/)(tests|fixtures|preview|tooling|vue|playwright)(\/|$)|\.test\.[cm]?js$/,
    );
  }
  assert.ok(inputs.some((input) => input.includes('/node_modules/jspdf/')));
  const code = result.outputFiles.find((file) =>
    file.path.endsWith('view.js'),
  ).text;
  const legal = result.outputFiles.find((file) =>
    file.path.endsWith('LEGAL.txt'),
  ).text;
  assert.equal([...code.matchAll(/__WAN_OBSERVER_VERSION__/g)].length, 1);
  assert.match(legal, /jsPDF/i);
  for (const output of Object.values(result.metafile.outputs)) {
    assert.equal(
      output.imports.filter((dependency) => dependency.external).length,
      0,
    );
  }
});
