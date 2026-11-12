import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import * as prettier from 'prettier';
import { cruise } from 'dependency-cruiser';

import { javascriptFiles, requireJavaScript, selectFiles } from './files.mjs';
import boundaries from '../../.dependency-cruiser.cjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const all =
  args.length === 2 && args[0] === '--all' && args[1] === '--lint-only';
const changed = args.length === 2 && args[0] === '--base' && args[1];

if (!all && !changed) {
  throw new Error(
    'Usage: npm run quality -- --base <commit> (no rule overrides)',
  );
}

const selected = selectFiles(root, all ? undefined : args[1]);
const files = requireJavaScript(selected);

console.log(`Checking ${files.length} JavaScript files:\n${files.join('\n')}`);

const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: resolve(root, 'eslint.config.mjs'),
});
const results = await eslint.lintFiles(files);

if (results.length !== files.length) {
  throw new Error('Incomplete lint discovery');
}

const formatter = await eslint.loadFormatter('stylish');
const diagnostics = formatter.format(results);

if (diagnostics) process.stdout.write(diagnostics);

let failed = results.some((result) => result.errorCount || result.warningCount);

if (!all) {
  const options = JSON.parse(
    await readFile(resolve(root, '.prettierrc.json'), 'utf8'),
  );

  for (const file of selected) {
    const info = await prettier.getFileInfo(resolve(root, file));

    if (!info.inferredParser) continue;

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

if (!report.modules.length) throw new Error('Empty dependency graph');

for (const violation of report.summary.violations) {
  console.error(`${violation.rule.name}: ${violation.from} -> ${violation.to}`);
  failed = true;
}

console.log(
  `Resolved ${report.modules.length} modules; ${report.summary.violations.length} boundary violations`,
);
if (failed) process.exitCode = 1;
