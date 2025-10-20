import { test, expect } from '@playwright/test'

test.describe('rapid shallow clicks + reload preserves scroll/back/forward', () => {
	test.setTimeout(15000)

	test('products list: spam clicks, reload, back/forward keep scroll', async ({ page }) => {
		const logs = []
		page.on('console', m => logs.push(`${m.type()}: ${m.text()}`))

		await page.goto('/products')
		await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible()

		// scroll down where list is long
		const y0 = await page.evaluate(() => (window.scrollTo(0, 1600), scrollY))
		expect(y0).toBeGreaterThanOrEqual(800)

		// click many product buttons very fast (shallow push spam)
		const res = await page.evaluate(async () => {
			// select product tiles robustly: buttons inside product <li> cards
			const btns = Array.from(
				document.querySelectorAll('ul li > button[aria-label^="View "]'),
			)
			const picked = btns.slice(0, 1)
			for (const b of picked) {
				b.click()
				await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)))
			}
			return {
				href: location.href,
				idx: history.state?.__navgo?.idx,
				y: scrollY,
				len: picked.length,
				shallow: history.state?.__navgo?.shallow ?? null,
			}
		})
		expect(res.len).toBeGreaterThan(0)
		expect(res.shallow).toBe(true)
		expect(res.y).toBe(y0)

		await test.info().attach('after-spam', {
			body: await page.screenshot(),
			contentType: 'image/png',
		})

		// reload at shallow entry, then Back repeatedly until the non-shallow list entry
		await page.reload()
		// ensure app reinitialized before Back
		await page.waitForFunction(() => window.router && document.readyState === 'complete')
		for (let i = 0; i < 20; i++) {
			const hasProduct = await page.evaluate(() => location.search.includes('product='))
			if (!hasProduct) break
			await page.goBack()
		}
		await expect(page).toHaveURL(/\/products$/)
		await page.waitForFunction(y => scrollY > 0 && Math.abs(scrollY - y) <= 400, y0, {
			timeout: 10000,
		})
		const y_after = await page.evaluate(() => scrollY)
		expect(y_after).toBeGreaterThan(0)

		// Forward back to modal; preserve scroll
		await page.goForward()
		const y_fwd = await page.evaluate(() => scrollY)
		expect(Math.abs(y_fwd - y_after)).toBeLessThanOrEqual(200)

		// Zig-zag back/forward several times quickly; scroll must not change
		for (let i = 0; i < 6; i++) {
			await page.goBack()
			await page.goForward()
		}
		expect(await page.evaluate(() => scrollY)).toBe(y0)

		await test.info().attach('end-state', {
			body: await page.screenshot(),
			contentType: 'image/png',
		})

		await test.info().attach('console.log', {
			body: Buffer.from(logs.join('\n')),
			contentType: 'text/plain',
		})
	})
})
