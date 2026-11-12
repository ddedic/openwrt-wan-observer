import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import * as prettier from 'prettier';
import { cruise } from 'dependency-cruiser';

import { javascriptFiles, selectFiles } from './files.mjs';
import { groupSources } from './source-kinds.mjs';
import { checkLanguages } from './language-checks.mjs';
import { checkLuaBoundaries } from './source-policy.mjs';
import boundaries from '../../.dependency-cruiser.cjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const all =
  args.length === 2 &&
  args[0] === '--all' &&
  ['--lint-only', '--format-check'].includes(args[1]);
const changed = args.length === 2 && args[0] === '--base' && args[1];

if (!all && !changed) {
  throw new Error(
    'Usage: npm run quality -- --base <commit> (no rule overrides)',
  );
}

const selected = selectFiles(root, all ? undefined : args[1]);
if (!selected.length) {
  throw new Error('No live files selected');
}
const groups = groupSources(root, selected);
const allGroups = groupSources(root, selectFiles(root));
const formatting = !all || args[1] === '--format-check';
const configOwners = {
  'ruff.toml': ['python'],
  '.luacheckrc': ['lua'],
  '.stylua.toml': ['lua'],
  '.editorconfig': ['shell'],
  'eslint.config.mjs': ['javascript'],
};
for (const file of selected) {
  for (const kind of configOwners[file] || []) {
    if (allGroups[kind]) {
      groups[kind] = allGroups[kind];
    }
  }
}
const files = groups.javascript || [];

console.log(
  `Source discovery: ${JSON.stringify(Object.fromEntries(Object.entries(groups).map(([kind, names]) => [kind, names.length])))}`,
);
checkLanguages(root, groups, { formatting });
if (allGroups.lua) {
  checkLuaBoundaries(
    root,
    allGroups.lua.filter((file) => file.startsWith('package/')),
  );
}

console.log(`Checking ${files.length} JavaScript files:\n${files.join('\n')}`);

const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: resolve(root, 'eslint.config.mjs'),
});
const results = files.length ? await eslint.lintFiles(files) : [];

if (results.length !== files.length) {
  throw new Error('Incomplete lint discovery');
}

const formatter = await eslint.loadFormatter('stylish');
const diagnostics = formatter.format(results);

if (diagnostics) {
  process.stdout.write(diagnostics);
}

let failed = results.some((result) => result.errorCount || result.warningCount);

const frozen = JSON.parse(
  await readFile(
    resolve(root, 'tooling/quality/frozen-rendering.json'),
    'utf8',
  ),
);
const frozenPaths = new Set(frozen.files.map((file) => file.path));
for (const file of selected) {
  if (/\.(css|html|svg)$/.test(file) && !frozenPaths.has(file)) {
    throw new Error(
      `Unregistered rendering source needs its approved visual task: ${file}`,
    );
  }
}
for (const file of frozen.files) {
  const bytes = await readFile(resolve(root, file.path));
  if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
    throw new Error(
      `Frozen rendering source changed without its approved visual task: ${file.path}`,
    );
  }
}

if (formatting) {
  const options = JSON.parse(
    await readFile(resolve(root, '.prettierrc.json'), 'utf8'),
  );

  for (const file of selected) {
    if (frozenPaths.has(file) || !/\.(?:[cm]?js|jsonc?|ya?ml|md)$/.test(file)) {
      continue;
    }
    const info = await prettier.getFileInfo(resolve(root, file));

    if (!info.inferredParser) {
      continue;
    }

    const content = await readFile(resolve(root, file), 'utf8');

    if (!(await prettier.check(content, { ...options, filepath: file }))) {
      console.error(`Format: ${file}`);
      failed = true;
    }
  }
}

const graph = await cruise(javascriptFiles(selectFiles(root)), {
  ...boundaries.options,
  ruleSet: boundaries,
  outputType: 'json',
});
const report = JSON.parse(graph.output);

if (!report.modules.length) {
  throw new Error('Empty dependency graph');
}

for (const violation of report.summary.violations) {
  console.error(`${violation.rule.name}: ${violation.from} -> ${violation.to}`);
  failed = true;
}

console.log(
  `Resolved ${report.modules.length} modules; ${report.summary.violations.length} boundary violations`,
);
if (failed) {
  process.exitCode = 1;
}
