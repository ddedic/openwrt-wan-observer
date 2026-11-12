const ui = 'package/wan-observer-glinet/ui';

module.exports = {
  forbidden: [
    {
      name: 'production-cannot-import-development',
      severity: 'error',
      from: { path: `^${ui}/`, pathNot: '\\.test\\.js$' },
      to: {
        path: '(^tools/|^tooling/|^tests/|^site/|(^|/)(preview|fixtures)/|\\.test\\.[cm]?js$)',
      },
    },
    {
      name: 'infrastructure-cannot-import-product',
      severity: 'error',
      from: { path: `^${ui}/src/infrastructure/`, pathNot: '\\.test\\.js$' },
      to: { path: `^${ui}/(index\\.js$|src/(app|features)/)` },
    },
    {
      name: 'settings-validation-is-pure',
      severity: 'error',
      from: { path: `^${ui}/src/features/settings/settings-validation\\.js$` },
      to: { path: '.' },
    },
    {
      name: 'no-unresolved-imports',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: {
      extensions: ['.js', '.cjs', '.mjs', '.json', '.css'],
    },
  },
};
