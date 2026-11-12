import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import * as prettier from 'prettier';

import { javascriptFiles, requireJavaScript, selectFiles } from './files.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const UI = 'package/wan-observer-glinet/ui';
const CHECK = join(ROOT, 'tooling/quality/check.mjs');

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'wan-quality-'));

  t.after(() => rmSync(root, { recursive: true, force: true }));

  return root;
}

function write(root, file, content) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), content);
}

test('selection includes untracked and renamed paths, excludes deletions and rejects bad bases', (t) => {
  const root = fixture(t);
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();

  git('init', '-q');
  write(root, 'old.js', 'module.exports = 1;\n');
  write(root, 'deleted.js', 'module.exports = 2;\n');
  git('add', '.');
  git(
    '-c',
    'user.name=Test fixture',
    '-c',
    'user.email=fixture@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-qm',
    'Fixture baseline',
  );
  const base = git('rev-parse', 'HEAD');

  assert.deepEqual(selectFiles(root, base), []);
  renameSync(join(root, 'old.js'), join(root, 'renamed.js'));
  rmSync(join(root, 'deleted.js'));
  git('add', '-A');
  write(root, 'new.test.mjs', 'export {};\n');

  assert.deepEqual(selectFiles(root, base), ['new.test.mjs', 'renamed.js']);
  assert.throws(() => selectFiles(root, 'missing-commit'));
  assert.throws(() => selectFiles(root, '--all'));
  assert.throws(() => selectFiles(root, ''));
});

test('canonical discovery includes production, adjacent/legacy tests, preview and quality tooling', async () => {
  const files = javascriptFiles(selectFiles(ROOT));
  const eslint = new ESLint({ cwd: ROOT });

  for (const file of [
    `${UI}/index.js`,
    `${UI}/report.test.js`,
    `${UI}/src/infrastructure/router-api.js`,
    `${UI}/src/features/settings/settings-validation.test.js`,
    'tools/preview/app.js',
    'tooling/quality/check.mjs',
  ]) {
    assert.ok(files.includes(file), `missing ${file}`);
  }

  for (const file of files) {
    assert.equal(await eslint.isPathIgnored(file), false, file);
    assert.ok(
      (await eslint.calculateConfigForFile(file)).rules['no-unused-vars'],
    );
  }
});

test('real ESLint rejects unused bindings, undefined names and inline suppressions', async () => {
  const eslint = new ESLint({ cwd: ROOT });
  const filePath = `${UI}/src/infrastructure/probe.js`;
  const [valid] = await eslint.lintText('module.exports = 1;', { filePath });

  assert.equal(valid.errorCount + valid.warningCount, 0);

  for (const source of [
    'const unused = 1; module.exports = 1;',
    'const _unused = 1; module.exports = 1;',
    'const { value, ...unusedRest } = { value: 1 }; module.exports = value;',
    'module.exports = missing;',
    '/* eslint-disable no-undef */\nmodule.exports = missing;',
  ]) {
    const [invalid] = await eslint.lintText(source, { filePath });

    assert.ok(invalid.errorCount + invalid.warningCount > 0);
  }

  const [suppressed] = await eslint.lintText(
    '/* eslint-disable */\nmodule.exports = 1;',
    { filePath },
  );

  assert.ok(
    suppressed.warningCount > 0,
    'even unnecessary suppression is rejected',
  );

  const invalidConfig = new ESLint({
    cwd: ROOT,
    overrideConfig: { rules: { 'wan-nonexistent-rule': 'error' } },
  });

  await assert.rejects(
    invalidConfig.lintText('module.exports = 1;', { filePath }),
  );
});

test('formatter checks actual bytes with the project configuration', async () => {
  const filepath = join(ROOT, 'tooling/quality/probe.mjs');
  const options = { ...(await prettier.resolveConfig(filepath)), filepath };

  assert.equal(await prettier.check('export const value=1', options), false);
  assert.equal(
    await prettier.check('export const value = 1;\n', options),
    true,
  );
});

test('quality CLI rejects missing bases, invalid bases, empty code selection and overrides', (t) => {
  for (const args of [
    [],
    ['--base'],
    ['--base', 'HEAD', '--rule', 'no-undef:off'],
    ['--base', 'no-such-base'],
    ['--config', 'elsewhere'],
  ]) {
    const result = spawnSync(process.execPath, [CHECK, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    assert.notEqual(result.status, 0);
  }

  const root = fixture(t);
  execFileSync('git', ['init', '-q'], { cwd: root });
  write(root, 'README.md', '# Fixture\n');
  assert.throws(
    () => requireJavaScript(selectFiles(root)),
    /No live JavaScript/,
  );
});

test('resolver rejects production fixture imports, normalized back-edges, re-exports and unresolved aliases', (t) => {
  const cases = [
    [
      'index.js',
      "require('../../../tools/preview/probe.js');",
      'tools/preview/probe.js',
      'production-cannot-import-development',
    ],
    [
      'src/infrastructure/probe.js',
      "require('../features/settings/../settings/secret.js');",
      `${UI}/src/features/settings/secret.js`,
      'infrastructure-cannot-import-product',
    ],
    [
      'src/infrastructure/probe.js',
      "export { value } from '../features/settings/secret.js';",
      `${UI}/src/features/settings/secret.js`,
      'infrastructure-cannot-import-product',
    ],
    [
      'src/infrastructure/probe.js',
      "require('@undeclared/alias');",
      null,
      'no-unresolved-imports',
    ],
    [
      'index.js',
      "require('../../../tests/probe.js');",
      'tests/probe.js',
      'production-cannot-import-development',
    ],
    [
      'src/features/settings/settings-validation.js',
      "require('./side-effect.js');",
      `${UI}/src/features/settings/side-effect.js`,
      'settings-validation-is-pure',
    ],
  ];

  for (const [entry, source, target, rule] of cases) {
    const root = fixture(t);
    write(root, `${UI}/${entry}`, source);
    if (target) write(root, target, 'export const value = 1;\n');
    const result = spawnSync(
      process.execPath,
      [
        join(
          ROOT,
          'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs',
        ),
        '--config',
        join(ROOT, '.dependency-cruiser.cjs'),
        '--output-type',
        'json',
        `${UI}/${entry}`,
      ],
      { cwd: root, encoding: 'utf8' },
    );
    const graph = JSON.parse(result.stdout);

    assert.ok(
      graph.summary.violations.some(
        (violation) => violation.rule.name === rule,
      ),
      `${rule}: ${result.stdout}`,
    );
    assert.ok(graph.summary.advisedExitCode > 0);
  }
});
