import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const gitFiles = (root, args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);

export function selectFiles(root, base) {
  const live = gitFiles(root, [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ]).filter(
    (file) =>
      existsSync(join(root, file)) && statSync(join(root, file)).isFile(),
  );

  if (base === undefined) {
    return [...new Set(live)].sort();
  }

  if (!base || base.startsWith('-')) {
    throw new Error('A commit base is required');
  }

  const commit = execFileSync(
    'git',
    ['rev-parse', '--verify', `${base}^{commit}`],
    {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  ).trim();
  const changed = new Set([
    ...gitFiles(root, [
      'diff',
      '--name-only',
      '--diff-filter=ACMRT',
      '-z',
      commit,
    ]),
    ...gitFiles(root, ['ls-files', '--others', '--exclude-standard', '-z']),
  ]);

  return [...new Set(live)].filter((file) => changed.has(file)).sort();
}

export function javascriptFiles(files) {
  return files.filter((file) => /\.[cm]?js$/.test(file));
}

export function requireJavaScript(files) {
  const selected = javascriptFiles(files);

  if (!selected.length) {
    throw new Error('No live JavaScript files selected');
  }

  return selected;
}
