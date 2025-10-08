import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'
import svelte from 'eslint-plugin-svelte'

export default defineConfig([
	js.configs.recommended,
	...tseslint.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		ignores: ['dist/**', 'test-results/**', 'test/types/basic.ts'],
	},
	{
		rules: { '@typescript-eslint/no-explicit-any': 'off' },
	},
	{
		files: ['playwright.config.*', 'test/server.js', 'index.test.js', 'eslint.config.*'],
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
		rules: {
			'@typescript-eslint/ban-ts-comment': 'off',
		},
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: { parser: tseslint.parser },
			globals: { ...globals.es2021, ...globals.browser },
		},
		rules: {
			'no-inner-declarations': 'off',
			'no-self-assign': 'off',
			'svelte/no-at-html-tags': 'off',
			'svelte/require-each-key': 'off',
			'svelte/prefer-svelte-reactivity': 'off',
			'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
		},
	},
	{
		rules: {
			'no-empty': ['error', { allowEmptyCatch: true }],
		},
	},
])
