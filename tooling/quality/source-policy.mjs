import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import lua from 'luaparse';

import { execute, tool } from './native-tools.mjs';

const SUPPRESSION =
  /\b(noqa|(?:fmt|ruff|stylua|luacheck|pyright)\s*:|type\s*:\s*ignore|shellcheck\s+(?:disable|enable|source|shell|external-sources)\s*=)/i;

function walk(node, callback) {
  if (!node || typeof node !== 'object') {
    return;
  }
  callback(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      value.forEach((child) => walk(child, callback));
    } else if (value && typeof value === 'object') {
      walk(value, callback);
    }
  }
}

export function assertNoSuppression(root, file, kind) {
  const content = readFileSync(join(root, file), 'utf8');
  let comments = [];
  if (kind === 'python') {
    const script = `import io,json,sys,tokenize\ns=sys.stdin.read()\nprint(json.dumps([t.string for t in tokenize.generate_tokens(io.StringIO(s).readline) if t.type==tokenize.COMMENT]))`;
    comments = JSON.parse(execute(root, 'python3', ['-c', script], content));
  } else if (kind === 'lua') {
    comments = lua
      .parse(content, { luaVersion: '5.1', comments: true })
      .comments.map((comment) => comment.value);
  } else if (kind === 'shell') {
    const tree = JSON.parse(
      execute(
        root,
        tool(root, 'shfmt'),
        ['--to-json', '-ln', 'posix', '--filename', file],
        content,
      ),
    );
    walk(tree, (node) => {
      if (node.Hash && typeof node.Text === 'string') {
        comments.push(node.Text);
      }
    });
  }
  if (comments.some((comment) => SUPPRESSION.test(comment))) {
    throw new Error(
      `Inline checker/formatter suppression is forbidden: ${file}`,
    );
  }
}

export function checkLuaBoundaries(root, files) {
  const moduleRoot = 'package/wan-observer-glinet/lua/';
  const imports = new Map();
  for (const file of files) {
    const ast = lua.parse(readFileSync(join(root, file), 'utf8'), {
      luaVersion: '5.1',
      comments: true,
      encodingMode: 'pseudo-latin1',
    });
    const requires = [];
    let containsProcess = false;
    walk(ast, (node) => {
      if (
        node.type === 'MemberExpression' &&
        node.base?.name === 'io' &&
        node.identifier?.name === 'popen'
      ) {
        containsProcess = true;
      }
      if (
        node.type === 'IndexExpression' &&
        node.base?.name === 'io' &&
        node.index?.value === 'popen'
      ) {
        containsProcess = true;
      }
      let argument;
      if (node.type === 'CallExpression' && node.base?.name === 'require') {
        argument = node.arguments?.[0];
      } else if (
        node.type === 'StringCallExpression' &&
        node.base?.name === 'require'
      ) {
        argument = node.argument;
      } else if (
        node.type === 'CallExpression' &&
        node.base?.name === 'pcall' &&
        node.arguments?.[0]?.name === 'require'
      ) {
        argument = node.arguments?.[1];
      } else {
        return;
      }
      const name = argument?.value;
      if (typeof name !== 'string') {
        throw new Error(
          `Dynamic Lua require needs a reviewed contract: ${file}`,
        );
      }
      requires.push(name);
      if (name.startsWith('wan_observer.')) {
        const target = `${moduleRoot}${name.replaceAll('.', '/')}.lua`;
        if (!files.includes(target)) {
          throw new Error(`Unresolved Lua module: ${file} -> ${name}`);
        }
        const isTransport =
          name.startsWith('wan_observer.http.') ||
          name === 'wan_observer.application';
        if (file.includes('/services/') && isTransport) {
          throw new Error(
            `Lua service cannot import transport: ${file} -> ${name}`,
          );
        }
        if (
          file.includes('/adapters/') &&
          (isTransport || name.startsWith('wan_observer.services.'))
        ) {
          throw new Error(
            `Lua adapter cannot import application: ${file} -> ${name}`,
          );
        }
        if (
          file.includes('/contracts/') &&
          !name.startsWith('wan_observer.contracts.')
        ) {
          throw new Error(
            `Lua contract cannot import application: ${file} -> ${name}`,
          );
        }
      }
    });
    imports.set(file, requires);
    if (
      containsProcess &&
      file !== `${moduleRoot}wan_observer/adapters/commands.lua`
    ) {
      throw new Error(
        `Process execution belongs to the command adapter: ${file}`,
      );
    }
  }
  return imports.size;
}
