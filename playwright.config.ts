import { defineConfig } from '@playwright/test'

export default defineConfig({
	testDir: 'test/e2e',
	timeout: 5000,
	retries: process.env.CI ? 2 : 0,
	use: {
		headless: true,
		baseURL: 'http://localhost:5714',
		acceptDownloads: true,
		trace: 'retain-on-failure',
		launchOptions: {
			executablePath: process.env.CHROME_HEADLESS_PATH || undefined,
		},
	},
	webServer: {
		command: 'pnpm start:testsite',
		port: 5714,
		timeout: 120_000,
		reuseExistingServer: !process.env.CI,
	},
})
