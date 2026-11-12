const { resolve } = require('node:path');

const { buildSync } = require('esbuild');

let source;

function componentSource() {
  if (!source) {
    const result = buildSync({
      entryPoints: [resolve(__dirname, '../index.js')],
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'cjs',
      loader: { '.css': 'text' },
      external: ['jspdf'],
    });

    source = result.outputFiles[0].text;
  }

  return source;
}

module.exports = { componentSource };
