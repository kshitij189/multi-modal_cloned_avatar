export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        // Browser
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        localStorage: 'readonly',
        customElements: 'readonly',
        HTMLElement: 'readonly',
        CustomEvent: 'readonly',
        AbortController: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        crypto: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        ReadableStream: 'readonly',
        // Node
        process: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': 'off',
      // The project ships zero runtime dependencies on purpose (CLAUDE.md).
      // A default export is harder to grep than a named one.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'No default exports — named exports only. See CLAUDE.md conventions.',
        },
      ],
    },
  },
  {
    // Config files legitimately need default exports, and the Cloudflare Workers module
    // format REQUIRES the entry point to default-export its handler object. Narrow
    // exception rather than dropping the rule.
    files: ['vite.config.js', 'eslint.config.js', 'worker/index.js'],
    rules: { 'no-restricted-syntax': 'off' },
  },
];
