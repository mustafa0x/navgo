import { test, expect } from '@playwright/test'

async function ensure_app_ready(page) {
	await page.goto('/')
	await page.waitForSelector('header nav a[href="/"]')
}

test.beforeEach(async ({ page }) => {
	await ensure_app_ready(page)
})

test('param coercion and third-item override', async ({ page }) => {
	await page.evaluate(() => window.navgo.goto('/coerce/7'))
	await expect(page).toHaveURL(/\/coerce\/7$/)
	await expect(page.getByRole('heading', { level: 1, name: 'Coerce 7' })).toBeVisible()
	await expect(page.locator('[data-testid="coerce-id"]')).toHaveText('7')
	await expect(page.locator('[data-testid="coerce-type"]')).toHaveText('number')
})

test('param validator rejects invalid values', async ({ page }) => {
	await page.evaluate(() => window.navgo.goto('/coerce/nope'))
	await expect(page.locator('main')).toContainText('Page not found')
})
