import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { execute, tool } from './native-tools.mjs';
import { assertNoSuppression } from './source-policy.mjs';

export function checkLanguages(root, groups, { formatting = false } = {}) {
  for (const kind of ['python', 'lua', 'shell']) {
    for (const file of groups[kind] || []) {
      assertNoSuppression(root, file, kind);
    }
  }
  if (groups.python?.length) {
    const ruff = tool(root, 'ruff');
    execute(root, ruff, [
      'check',
      '--config',
      resolve(root, 'ruff.toml'),
      '--ignore-noqa',
      ...groups.python,
    ]);
    if (formatting) {
      execute(root, ruff, [
        'format',
        '--check',
        '--config',
        resolve(root, 'ruff.toml'),
        ...groups.python,
      ]);
    }
  }
  if (groups.lua?.length) {
    execute(root, tool(root, 'luacheck'), [
      '--no-default-config',
      '--config',
      resolve(root, '.luacheckrc'),
      '--codes',
      ...groups.lua,
    ]);
    if (formatting) {
      execute(root, tool(root, 'stylua'), [
        '--check',
        '--config-path',
        resolve(root, '.stylua.toml'),
        '--verify',
        ...groups.lua,
      ]);
    }
  }
  if (groups.shell?.length) {
    execute(root, tool(root, 'shellcheck'), [
      '--norc',
      '--shell=sh',
      ...groups.shell,
    ]);
    if (formatting) {
      execute(root, tool(root, 'shfmt'), [
        '-d',
        '-ln',
        'posix',
        '-i',
        '2',
        ...groups.shell,
      ]);
    }
  }
  for (const file of groups.jq || []) {
    const source = readFileSync(join(root, file), 'utf8');
    const definitions = [
      ...source.matchAll(
        /^def\s+([A-Za-z_][A-Za-z0-9_]*)(?:\(([^)]*)\))?\s*:/gm,
      ),
    ];
    if (!definitions.length) {
      throw new Error(
        `jq library needs named column-zero definitions: ${file}`,
      );
    }
    const references = definitions.map((definition) => {
      const args = definition[2];

      return args === undefined
        ? definition[1]
        : `${definition[1]}(${args
            .split(';')
            .map(() => 'null')
            .join(';')})`;
    });
    const program = `${source}\nif . == "__quality_compile_only__" then (${references.join(',')}) else empty end\n`;
    const temp = mkdtempSync(join(tmpdir(), 'wan-jq-check-'));
    try {
      const filter = join(temp, 'compile.jq');
      writeFileSync(filter, program);
      execute(root, 'jq', [
        '-n',
        '-L',
        dirname(resolve(root, file)),
        '-f',
        filter,
      ]);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
  for (const file of groups.make || []) {
    const temp = mkdtempSync(join(tmpdir(), 'wan-make-check-'));
    try {
      writeFileSync(join(temp, 'rules.mk'), `INCLUDE_DIR := ${temp}\n`);
      writeFileSync(join(temp, 'package.mk'), '');
      writeFileSync(
        join(temp, 'check.mk'),
        `include ${resolve(root, file)}\n.PHONY: __quality__\n__quality__:\n\t@:\n`,
      );
      execute(root, 'make', [
        '--no-builtin-rules',
        '--just-print',
        '-f',
        join(temp, 'check.mk'),
        '__quality__',
        `TOPDIR=${temp}`,
      ]);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
}
