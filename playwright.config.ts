import { defineConfig } from '@playwright/test'

export default defineConfig({
	testDir: 'test/e2e',
	timeout: 5000,
	workers: 1,
	retries: process.env.CI ? 2 : 0,
	reporter: 'list',
	use: {
		headless: true,
		baseURL: 'http://localhost:5714',
		acceptDownloads: true,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		actionTimeout: 5000,
		navigationTimeout: 5000,
		launchOptions: {
			executablePath: process.env.CHROME_HEADLESS_PATH || undefined,
		},
	},
	projects: [
		{ name: 'chromium', use: { browserName: 'chromium' } },
		{ name: 'firefox', use: { browserName: 'firefox' } },
		{ name: 'webkit', use: { browserName: 'webkit' } },
	],
	webServer: {
		command: 'pnpm start:testsite',
		port: 5714,
		timeout: 120_000,
		reuseExistingServer: !process.env.CI,
	},
})
