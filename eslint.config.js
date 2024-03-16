'use strict';
const globals = require('globals');
const js = require('@eslint/js');
const node = require('eslint-plugin-n');
const security = require('eslint-plugin-security');
const sonarjs = require('eslint-plugin-sonarjs');

const { FlatCompat } = require('@eslint/eslintrc');
const compat = new FlatCompat();

module.exports = [
  js.configs.recommended,
  ...compat.config(node.configs.recommended),
  security.configs.recommended,
  ...compat.config(sonarjs.configs.recommended),
  {
    files: [ '**/*.js' ],
    plugins: {
      node,
      security,
      sonarjs,
    },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
    },
    rules: {
      'array-element-newline': [
        'error',
        'consistent',
      ],
      'arrow-parens': [
        'error',
        'always',
      ],
      'arrow-spacing': [
        'error',
        {
          'after': true,
          'before': true,
        },
      ],
      'block-scoped-var': 'error',
      'block-spacing': 'error',
      'brace-style': 'error',
      'callback-return': 'error',
      'camelcase': 'error',
      'class-methods-use-this': 'error',
      'comma-dangle': [
        'error',
        'always-multiline',
      ],
      'comma-spacing': [
        'error',
        {
          'after': true,
          'before': false,
        },
      ],
      'comma-style': [
        'error',
        'last',
      ],
      'indent': [
        'warn',
        2,
        {
          'SwitchCase': 1,
        },
      ],
      'sonarjs/cognitive-complexity': 'warn',
      'sonarjs/no-duplicate-string': 'warn',
      'keyword-spacing': 'error',
      'linebreak-style': [
        'error',
        'unix',
      ],
      'no-unused-vars': [
        'error', {
          'varsIgnorePattern': '^_',
        },
      ],
      'object-curly-spacing': [
        'error',
        'always',
      ],
      'prefer-const': 'error',
      'quotes': [
        'error',
        'single',
      ],
      'semi': [
        'error',
        'always',
      ],
      'strict': 'error',
      'vars-on-top': 'error',
    },
  },
  {
    files: ['test/**'],
    languageOptions: {
      globals: {
        ...globals.mocha,
      },
    },
    rules: {
      "n/no-unpublished-require": "off",
    },
  },
];
