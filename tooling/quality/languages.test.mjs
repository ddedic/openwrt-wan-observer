import assert from 'node:assert/strict';
import test from 'node:test';

import { selectFiles } from './files.mjs';
import { groupSources, sourceKind } from './source-kinds.mjs';
import { checkLuaBoundaries } from './source-policy.mjs';
import { createQualityRepository } from './test-repository.mjs';

test('canonical language discovery covers every live source family and extensionless CLIs', () => {
  const root = process.cwd();
  const groups = groupSources(root, selectFiles(root));
  for (const kind of ['javascript', 'python', 'lua', 'shell', 'jq', 'make']) {
    assert.ok(groups[kind]?.length > 0, kind);
  }
  assert.ok(
    groups.shell.includes('package/wan-observer/files/wan-observer-collect'),
  );
  assert.ok(
    groups.lua.includes('package/wan-observer-glinet/files/wan-observer.cgi'),
  );
  for (const file of selectFiles(root).filter((name) =>
    /\.(py|lua|cgi|jq|sh)$/.test(name),
  )) {
    assert.ok(sourceKind(root, file), file);
  }
});

const cases = [
  ['python', 'probe.py', 'value = 1\n', 'print(missing)\n'],
  ['lua', 'probe.lua', 'return { value = 1 }\n', 'return missing\n'],
  [
    'shell',
    'probe.sh',
    "#!/bin/sh\nprintf '%s\\n' 'ok'\n",
    '#!/bin/sh\nprintf "%s\\n" $missing\n',
  ],
  ['jq', 'probe.jq', 'def pass: .;\n', 'def pass: missing_builtin;\n'],
  ['make', 'Makefile', 'all:\n\t@:\n', 'this is not make syntax\n'],
];
for (const [kind, file, valid, invalid] of cases) {
  test(`actual ${kind} checker accepts valid source and rejects a real error`, (t) => {
    const fixture = createQualityRepository(t);
    fixture.write(file, valid);
    let result = fixture.check();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    fixture.write(file, invalid);
    result = fixture.check();
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
  });
}

for (const [file, source] of [
  ['probe.py', '# fmt: off\nvalue = 1\n'],
  ['probe.lua', '-- stylua: ignore\nreturn { value = 1 }\n'],
  ['probe.sh', "#!/bin/sh\n# shellcheck disable=SC2086\nprintf '%s\\n' 'ok'\n"],
]) {
  test(`inline suppression is rejected in ${file} even when code is otherwise valid`, (t) => {
    const fixture = createQualityRepository(t);
    fixture.write(file, source);
    const result = fixture.check();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /suppression is forbidden/);
  });
}

test('comment policy accepts suppression-like literals and rejects nested Python weakening', (t) => {
  const fixture = createQualityRepository(t);
  fixture.write('probe.py', "value = '# noqa'\n");
  fixture.write('probe.lua', "return 'luacheck: ignore'\n");
  fixture.write(
    'probe.sh',
    "#!/bin/sh\nprintf '%s\\n' '# shellcheck disable=SC2086'\n",
  );
  let result = fixture.check();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  fixture.write('nested/.ruff.toml', '[lint]\nignore = ["F821"]\n');
  fixture.write('nested/probe.py', 'print(missing)\n');
  result = fixture.check();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /F821/);
});

test('unsupported new source and frozen rendering changes fail explicitly', (t) => {
  const fixture = createQualityRepository(t);
  fixture.write('probe.ts', 'const value = 1;\n');
  let result = fixture.check();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unconfigured live source language/);
  const rendered = createQualityRepository(t);
  rendered.write('view.css', 'body { color: red; }\n');
  rendered.write(
    'tooling/quality/frozen-rendering.json',
    JSON.stringify({ files: [{ path: 'view.css', sha256: '0'.repeat(64) }] }),
  );
  result = rendered.check();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Frozen rendering source changed/);
});

test('Lua boundaries resolve parenthesized, string-call and protected requires', (t) => {
  const fixture = createQualityRepository(t);
  const folder = 'package/wan-observer-glinet/lua/wan_observer/';
  const service = `${folder}services/dashboard.lua`;
  const http = `${folder}http/handler.lua`;
  fixture.write(http, 'return {}\n');
  for (const source of [
    "return require('wan_observer.http.handler')\n",
    "return require 'wan_observer.http.handler'\n",
    "return pcall(require, 'wan_observer.http.handler')\n",
  ]) {
    fixture.write(service, source);
    assert.throws(
      () => checkLuaBoundaries(fixture.root, [service, http]),
      /service cannot import transport/,
    );
  }
  fixture.write(service, "return 'io.popen'\n");
  assert.equal(checkLuaBoundaries(fixture.root, [service, http]), 2);
  fixture.write(service, "return io['popen']('true')\n");
  assert.throws(
    () => checkLuaBoundaries(fixture.root, [service, http]),
    /command adapter/,
  );
});

test('environment options cannot suppress ShellCheck diagnostics', (t) => {
  const fixture = createQualityRepository(t);
  fixture.write('probe.sh', "#!/bin/sh\nprintf '%s\\n' $missing\n");
  const result = fixture.check({
    env: { SHELLCHECK_OPTS: '--exclude=SC2086,SC2154' },
  });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /SC2086|SC2154/);
});
