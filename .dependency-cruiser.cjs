const UI = 'package/wan-observer-glinet/ui';
const FEATURES = ['dashboard', 'history', 'reports', 'settings', 'speedtest'];
const TEST_SOURCE = '(\\.test\\.js$|/tests/)';

module.exports = {
  forbidden: [
    {
      name: 'production-cannot-import-development',
      severity: 'error',
      from: { path: `^${UI}/`, pathNot: TEST_SOURCE },
      to: {
        path: '(^tools/|^tooling/|(^|/)(tests|preview|fixtures)/|\\.test\\.[cm]?js$)',
      },
    },
    {
      name: 'infrastructure-cannot-import-product',
      severity: 'error',
      from: { path: `^${UI}/src/infrastructure/`, pathNot: TEST_SOURCE },
      to: { path: `^${UI}/(index\\.js$|src/(app|features)/)` },
    },
    {
      name: 'features-cannot-import-app',
      severity: 'error',
      from: { path: `^${UI}/src/features/`, pathNot: TEST_SOURCE },
      to: { path: `^${UI}/src/app/` },
    },
    ...FEATURES.map((feature) => ({
      name: `${feature}-cannot-import-another-feature`,
      severity: 'error',
      from: { path: `^${UI}/src/features/${feature}/`, pathNot: TEST_SOURCE },
      to: {
        path: `^${UI}/src/features/`,
        pathNot: `^${UI}/src/features/${feature}/`,
      },
    })),
    {
      name: 'shared-components-cannot-import-product',
      severity: 'error',
      from: { path: `^${UI}/src/components/`, pathNot: TEST_SOURCE },
      to: { path: `^${UI}/src/(app|features)/` },
    },
    {
      name: 'settings-validation-is-pure',
      severity: 'error',
      from: { path: `^${UI}/src/features/settings/settings-validation\\.js$` },
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
