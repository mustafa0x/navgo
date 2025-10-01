import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
	await page.goto('/test/site/index.html')
	await expect(page.locator('#ready')).toHaveText('ready')
})

test('click intercept: routes + params', async ({ page }) => {
	await page.click('a[href="/users/luke"]')
	const outlet = page.locator('#outlet')
	await expect(outlet).toContainText('"uri":"/users/luke"')
	await expect(outlet).toContainText('"matched":"/users/:id"')
	await expect(outlet).toContainText('"params":{"id":"luke"}')
})

test('programmatic goto preloads then navigates', async ({ page }) => {
	await page.evaluate(() => window.router.goto('/users/ada'))
	const outlet = page.locator('#outlet')
	await expect(outlet).toContainText('"uri":"/users/ada"')
	await expect(outlet).toContainText('"params":{"id":"ada"}')
})

test('shallow push/replace do not trigger handlers', async ({ page }) => {
	const count0 = await page.evaluate(() => window.__events.length)
	await page.evaluate(() => window.router.pushState('/shallow'))
	await page.waitForTimeout(50)
	const count1 = await page.evaluate(() => window.__events.length)
	expect(count1).toBe(count0) // no onRoute fired

	await page.evaluate(() => window.router.replaceState('/shallow-2'))
	await page.waitForTimeout(50)
	const count2 = await page.evaluate(() => window.__events.length)
	expect(count2).toBe(count0)
})

test('beforeNavigate can cancel navigation', async ({ page }) => {
	// establish a route first
	await page.click('a[href="/users/luke"]')
	const prior = await page.locator('#outlet').textContent()
	await page.click('a[href="/protected/stop"]')
	// cancelled: URL unchanged and outlet unchanged
	await expect(page).toHaveURL(/\/users\/luke$/)
	await expect(page.locator('#outlet')).toHaveText(prior || '')
})

test('preload on hover triggers loaders', async ({ page }) => {
	const before = await page.evaluate(() => window.__loaders)
	await page.hover('a[href="/users/grace"]')
	await page.waitForTimeout(60)
	const after = await page.evaluate(() => window.__loaders)
	expect(after).toBeGreaterThan(before)
})

test('popstate back/forward updates view', async ({ page }) => {
	await page.click('a[href="/users/luke"]')
	await page.click('a[href="/books/kids/narnia"]')
	await expect(page.locator('#outlet')).toContainText('"matched":"/books/*"')
	await page.goBack()
	await expect(page.locator('#outlet')).toContainText('"matched":"/users/:id"')
	await page.goForward()
	await expect(page.locator('#outlet')).toContainText('"matched":"/books/*"')
})
