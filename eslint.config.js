import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import nextVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['**/dist/', '**/generated/', '**/node_modules/']),
  globalIgnores(['**/.next/', '**/next-env.d.ts']),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  // React, hooks, accessibility and Next.js rules, for the web app only.
  nextVitals.map((config) => ({
    ...config,
    files: (config.files ?? ['**/*.{js,jsx,mjs,ts,tsx}']).map((glob) => `apps/web/${glob}`),
    settings: { ...config.settings, next: { rootDir: 'apps/web/' } },
  })),
  {
    languageOptions: {
      parserOptions: {
        // Type-aware rules read each file's nearest tsconfig.json.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // `_name` marks a value as deliberately unused, e.g. a property removed
      // with rest destructuring.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Tests assert on raw JSON response bodies, which are untyped by nature.
    files: ['**/*.spec.ts', '**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    // Plain JavaScript run by Node: fetch, console, process, ... exist.
    languageOptions: { globals: globals.node },
  },
  prettier,
);
