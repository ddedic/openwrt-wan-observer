import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function createQualityRepository(t) {
  const root = mkdtempSync(join(tmpdir(), 'wan-quality-project-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of [
    'package.json',
    'eslint.config.mjs',
    '.prettierrc.json',
    '.dependency-cruiser.cjs',
    'ruff.toml',
    '.luacheckrc',
    '.stylua.toml',
    'tooling/quality/check.mjs',
    'tooling/quality/files.mjs',
    'tooling/quality/source-kinds.mjs',
    'tooling/quality/native-tools.mjs',
    'tooling/quality/source-policy.mjs',
    'tooling/quality/language-checks.mjs',
  ]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(ROOT, file), join(root, file));
  }
  writeFileSync(
    join(root, 'tooling/quality/frozen-rendering.json'),
    '{"files":[]}\n',
  );
  symlinkSync(join(ROOT, 'node_modules'), join(root, 'node_modules'), 'dir');
  mkdirSync(join(root, '.local'));
  for (const name of ['quality-venv', 'quality-lua']) {
    if (existsSync(join(ROOT, '.local', name))) {
      symlinkSync(
        join(ROOT, '.local', name),
        join(root, '.local', name),
        'dir',
      );
    }
  }
  writeFileSync(join(root, '.gitignore'), 'node_modules\n.local/\n');
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Test fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-qm',
      'Fixture baseline',
    ],
    { cwd: root },
  );
  return {
    root,
    write(file, content) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), content);
    },
    check({ env = {} } = {}) {
      return spawnSync(
        process.execPath,
        [join(root, 'tooling/quality/check.mjs'), '--base', 'HEAD'],
        { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } },
      );
    },
  };
}
