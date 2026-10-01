// @ts-check
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Layer rule from docs/03-frontend.md: features → entities → shared, never upward or sideways. */
const layer = (pattern, message) => ({ group: [pattern], message });

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/next-env.d.ts',
      '**/test-results/**',
      '**/playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'packages/visualizer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['apps/web/src/shared/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            layer('@/entities/*', 'shared/ must not import entities/'),
            layer('@/features/*', 'shared/ must not import features/'),
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/entities/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [layer('@/features/*', 'entities/ must not import features/')] },
      ],
    },
  },
  {
    files: ['packages/*/src/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [layer('@/*', 'packages must not import from apps')] },
      ],
    },
  },
);
