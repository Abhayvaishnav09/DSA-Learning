// @ts-check
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
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
      '**/.vercel/**',
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
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: [
      'apps/web/**/*.{ts,tsx}',
      'packages/visualizer/**/*.{ts,tsx}',
      'packages/ui/**/*.{ts,tsx}',
    ],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y-x': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.strict.rules,
      // Scrollable regions and code blocks must be focusable to scroll by keyboard (WCAG 2.1.1).
      'jsx-a11y-x/no-noninteractive-tabindex': [
        'error',
        { roles: ['tabpanel', 'region'], tags: ['pre'] },
      ],
    },
  },
  {
    // Type-aware rules for backend and library code: the bugs types can catch but tsc doesn't.
    files: ['packages/*/src/**/*.ts', 'services/*/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { arguments: false } },
      ],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true },
      ],
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],
    },
  },
  {
    // Tests poke at loosely-typed JSON responses.
    files: ['**/test/**/*.ts', '**/*.test.ts', '**/*.test.tsx'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
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
            layer('@/widgets/*', 'shared/ must not import widgets/'),
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/features/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            layer('@/app/*', 'features/ must not import app/'),
            layer('@/widgets/*', 'features/ must not import widgets/'),
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
        {
          patterns: [
            layer('@/features/*', 'entities/ must not import features/'),
            layer('@/widgets/*', 'entities/ must not import widgets/'),
          ],
        },
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
