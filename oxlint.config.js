import globals from 'globals'

const rune_globals = {
	$state: 'readonly',
	$derived: 'readonly',
	$effect: 'readonly',
	$props: 'readonly',
}

export default {
	categories: { correctness: 'error' },
	ignorePatterns: [
		'dist/**/*',
		'test-results/**/*',
		'test/types/basic.ts',
		'test/site/*mre*',
		'test/site/plain-svelte*',
		'test/site/routes/Mre*.svelte',
		'**/*.d.ts',
	],
	overrides: [
		{
			files: ['playwright.config.*', 'test/server.js', 'index.test.js', 'oxlint.config.js'],
			languageOptions: { globals: { ...globals.es2021, ...globals.node } },
		},
		{
			files: ['test/e2e/**/*.js'],
			languageOptions: {
				globals: { ...globals.es2021, ...globals.node, ...globals.browser },
			},
		},
		{
			files: ['index.js', 'utils.js', 'test/site/**/*.js'],
			languageOptions: {
				globals: { ...globals.es2021, ...globals.browser, ...rune_globals },
			},
		},
		{
			files: ['**/*.ts'],
			languageOptions: { globals: { ...globals.es2021, ...globals.node } },
		},
		{
			files: ['**/*.svelte'],
			languageOptions: { globals: { ...globals.es2021, ...globals.browser } },
			rules: {
				'no-inner-declarations': 'off',
				'no-self-assign': 'off',
				'no-unused-expressions': 'off',
			},
		},
	],
	rules: {
		'no-empty': ['error', { allowEmptyCatch: true }],
		'no-undef': 'error',
		'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
		'unicorn/no-useless-fallback-in-spread': 'off',
	},
}
