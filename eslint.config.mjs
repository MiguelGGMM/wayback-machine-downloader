// eslint.config.mjs
import js from '@eslint/js';
import * as parser from '@typescript-eslint/parser';
import pluginTs from '@typescript-eslint/eslint-plugin';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist', 'node_modules', 'tests'] },
  //js.configs.recommended,
  { ...js.configs.recommended, files: ['**/*.js', '**/*.mjs', '**/*.cjs'] },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser,
      parserOptions: {
        project: ['./tsconfig.json'], // enable type-aware rules (optional but nice)
        tsconfigRootDir: import.meta.dirname,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': pluginTs,
    },
    rules: {
      // turn on some TS rules; add more as you like
      '@typescript-eslint/consistent-type-imports': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-misused-promises': [
        'warn',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@/no-duplicate-imports': 'warn',
    },
  },
  eslintConfigPrettier,
];
