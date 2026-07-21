'use strict';

const nodeGlobals = {
  process: 'readonly', console: 'readonly', Buffer: 'readonly', __dirname: 'readonly',
  module: 'readonly', require: 'readonly', global: 'readonly', globalThis: 'readonly',
  fetch: 'readonly', URL: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
  setImmediate: 'readonly', clearImmediate: 'readonly', setInterval: 'readonly',
  clearInterval: 'readonly', queueMicrotask: 'readonly', structuredClone: 'readonly',
  crypto: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly'
};

const browserGlobals = {
  window: 'readonly', document: 'readonly', URL: 'readonly', fetch: 'readonly',
  getComputedStyle: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
  setInterval: 'readonly', clearInterval: 'readonly', requestAnimationFrame: 'readonly',
  console: 'readonly', navigator: 'readonly', HTMLElement: 'readonly', Node: 'readonly'
};

module.exports = [
  {
    files: ['services/**/*.js', 'utils/**/*.js', 'routes/**/*.js', 'server.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...nodeGlobals }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-duplicate-imports': 'error',
      'no-console': 'warn'
    }
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...nodeGlobals }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-duplicate-imports': 'error',
      'no-console': 'off'
    }
  },
  {
    files: ['test/browser/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...browserGlobals }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-duplicate-imports': 'error',
      'no-console': 'off'
    }
  },
  {
    ignores: ['node_modules/**', '.temp/**', 'data/**', 'public/**', 'legacy/**', 'coverage/**']
  }
];
