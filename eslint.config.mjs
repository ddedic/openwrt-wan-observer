import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '.local/**', '.serena/**'] },
  {
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: { ecmaVersion: 'latest' },
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      ...js.configs.recommended.rules,
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
    files: ['**/*.test.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['tools/preview/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
  },
];
