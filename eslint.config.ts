import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'

export default defineConfig([
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        ignores: ['dist/**', 'test-results/**'],
    },
    {
        rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },
    {
        files: [
            'builder.js',
            'playwright.config.*',
            'test/server.js',
            'test/uvu/**/*.js',
            'eslint.config.*',
        ],
        languageOptions: { globals: { ...globals.es2021, ...globals.node } },
    },
    {
        files: ['test/e2e/**/*.js'],
        languageOptions: { globals: { ...globals.es2021, ...globals.node, ...globals.browser } },
    },
    {
        files: ['src/**/*.js', 'test/site/**/*.js'],
        languageOptions: { globals: { ...globals.es2021, ...globals.browser } },
    },
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tseslint.parser,
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.es2021, ...globals.node },
        },
    },
])
