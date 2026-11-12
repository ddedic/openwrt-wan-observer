import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function sourceKind(root, file) {
  if (/\.[cm]?js$/.test(file)) {
    return 'javascript';
  }
  if (/\.py$/.test(file)) {
    return 'python';
  }
  if (/\.(lua|cgi)$/.test(file) || file === '.luacheckrc') {
    return 'lua';
  }
  if (/\.jq$/.test(file)) {
    return 'jq';
  }
  if (/\.sh$/.test(file)) {
    return 'shell';
  }
  if (/(^|\/)Makefile$/.test(file)) {
    return 'make';
  }

  const first = readFileSync(join(root, file)).subarray(0, 128).toString();
  if (/^#!.*\b(sh|bash|ash)\b/.test(first)) {
    return 'shell';
  }
  if (/^#!.*\bpython3?\b/.test(first)) {
    return 'python';
  }
  if (
    first.startsWith('#!') ||
    /\.(ts|tsx|jsx|rs|go|rb|pl|php|c|h|java|swift|kt)$/.test(file)
  ) {
    throw new Error(`Unconfigured live source language: ${file}`);
  }
  return null;
}

export function groupSources(root, files) {
  const groups = {};
  for (const file of files) {
    const kind = sourceKind(root, file);
    if (kind) {
      (groups[kind] ??= []).push(file);
    }
  }
  return groups;
}
