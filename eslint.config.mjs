import js from '@eslint/js';
import globals from 'globals';
import importX from 'eslint-plugin-import-x';
import stylistic from '@stylistic/eslint-plugin';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '.local/**', '.serena/**'] },
  {
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: { ecmaVersion: 'latest' },
    plugins: { 'import-x': importX, '@stylistic': stylistic },
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      ...js.configs.recommended.rules,
      curly: ['error', 'all'],
      'no-nested-ternary': 'error',
      'import-x/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
            'object',
            'type',
          ],
          'newlines-between': 'always-and-inside-groups',
          alphabetize: { order: 'ignore' },
        },
      ],
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: 'import', next: '*' },
        { blankLine: 'any', prev: 'import', next: 'import' },
        { blankLine: 'always', prev: ['const', 'let'], next: 'return' },
        { blankLine: 'any', prev: ['const', 'let'], next: ['const', 'let'] },
      ],
      'no-unused-vars': ['error', { caughtErrors: 'all' }],
      'no-warning-comments': [
        'error',
        { terms: ['prettier-ignore'], location: 'anywhere' },
      ],
    },
  },
  {
    files: ['package/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.browser },
    },
  },
  {
    files: [
      '**/*.test.js',
      '**/*.mjs',
      '**/*.cjs',
      'package/wan-observer-glinet/ui/tests/**/*.js',
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['tools/preview/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
  },
  {
    files: ['tooling/browser/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
