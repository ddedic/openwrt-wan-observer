import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const VERSIONS = {
  ruff: /ruff 0\.17\.4\b/,
  shellcheck: /version: 0\.11\.0\b/,
  shfmt: /v3\.14\.1\b/,
  stylua: /stylua 2\.6\.0\b/,
  luacheck: /Luacheck: 1\.2\.0\b|Luacheck 1\.2\.0\b/,
};
const checked = new Set();

export function execute(root, executable, args, input) {
  const env = {
    ...process.env,
    SHELLCHECK_OPTS: '',
    SHFMT_NO_EDITORCONFIG: 'true',
  };
  for (const name of [
    'MAKEFLAGS',
    'MFLAGS',
    'MAKEFILES',
    'LUA_INIT',
    'LUA_INIT_5_1',
    'LUA_INIT_5_2',
    'LUA_INIT_5_3',
    'LUA_INIT_5_4',
    'LUA_INIT_5_5',
  ]) {
    delete env[name];
  }
  const result = spawnSync(executable, args, {
    cwd: root,
    input,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
    env,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${executable}: ${result.error?.message || result.stderr || result.stdout || `exit ${result.status}`}`,
    );
  }
  return result.stdout;
}

export function tool(root, name) {
  const candidates = [
    join(root, '.local/quality-venv/bin', name),
    join(root, '.local/quality-lua/bin', name),
    join(root, 'node_modules/.bin', name),
  ];
  const executable = candidates.find((file) => existsSync(file)) || name;
  const identity = `${root}:${name}:${executable}`;
  if (!checked.has(identity)) {
    const version = execute(root, executable, ['--version']);
    if (!VERSIONS[name]?.test(version)) {
      throw new Error(
        `Expected pinned ${name} version; run npm run setup:quality`,
      );
    }
    checked.add(identity);
  }
  return executable;
}
