import { defineConfig } from '@playwright/test'

export default defineConfig({
	testDir: 'test/e2e',
	timeout: 30_000,
	retries: process.env.CI ? 2 : 0,
	use: {
		headless: true,
		baseURL: 'http://localhost:5173',
		trace: 'retain-on-failure',
		launchOptions: {
			executablePath: process.env.CHROME_HEADLESS_PATH || undefined,
		},
	},
	webServer: {
		command: 'pnpm run build && node test/server.js',
		port: 5173,
		timeout: 120_000,
		reuseExistingServer: !process.env.CI,
	},
})
