import { test, expect } from '@playwright/test'

async function ensure_app_ready(page) {
	await page.goto('/')
	await page.waitForSelector('header nav a[href="/"]')
}

async function navigation_count(page) {
	return page.evaluate(() => performance.getEntriesByType('navigation').length)
}

test.beforeEach(async ({ page }) => {
	await ensure_app_ready(page)
})

test('spa links: navigate and update content without reload', async ({ page }) => {
	const start_nav = await navigation_count(page)

	await page.click('a[href="/"]')
	await expect(page).toHaveURL(/\/$/)
	await expect(page.locator('main')).toContainText('Home')

	const cases = [
		{ href: '/products', expect: 'Products' },
		{ href: '/contact', expect: 'Contact' },
		{ href: '/about', expect: 'About' },
		{ href: '/account', expect: 'Account' },
		{ href: '/users/42', expect: 'User #42' },
		{ href: '/files/foo/bar', expect: 'Files' },
		{ href: '/posts', expect: 'Posts' },
	]

	for (const c of cases) {
		const before = await navigation_count(page)
		await page.click(`a[href="${c.href}"]`)
		await expect(page).toHaveURL(
			new RegExp(`${c.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
		)
		await expect(
			page.getByRole('heading', { level: 1, name: new RegExp(c.expect) }),
		).toBeVisible()
		const after = await navigation_count(page)
		expect(after).toBe(before)
	}

	const end_nav = await navigation_count(page)
	expect(end_nav).toBe(start_nav)
})

test('programmatic nav + replace preserves history idx', async ({ page }) => {
	// Already at '/' from ensure_app_ready; avoid clicking the Home link here
	await expect(page).toHaveURL(/\/$/)
	await page.evaluate(() => window.router.goto('/users/7'))
	await expect(page).toHaveURL(/\/users\/7$/)
	await expect(page.getByRole('heading', { level: 1, name: /User #7/ })).toBeVisible()

	const idx_before = await page.evaluate(() => history.state?.__navgo?.idx ?? null)
	await page.evaluate(() => window.router.goto('/products', { replace: true }))
	await expect(page).toHaveURL(/\/products$/)
	const idx_after = await page.evaluate(() => history.state?.__navgo?.idx ?? null)
	expect(idx_after).toBe(idx_before)
})

test('shallow push/replace do not trigger routing', async ({ page }) => {
	await page.click('a[href="/products"]')
	await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible()

	const content_before = await page.locator('main').textContent()
	await page.evaluate(() => window.router.push_state('/products?tab=info#top'))
	await page.waitForTimeout(30)
	expect(await page.evaluate(() => location.search + location.hash)).toBe('?tab=info#top')
	await expect(page.locator('main')).toHaveText(content_before || '')

	await page.evaluate(() => window.router.replace_state('/products?tab=overview'))
	await page.waitForTimeout(30)
	expect(await page.evaluate(() => location.search)).toBe('?tab=overview')
	await expect(page.locator('main')).toHaveText(content_before || '')
})

test('beforeNavigate: cancel on link and on popstate', async ({ page }) => {
	await page.click('a[href="/account"]')
	await page.check('input[type="checkbox"]')

	page.once('dialog', d => d.dismiss())
	await page.click('a[href="/products"]')
	await expect(page).toHaveURL(/\/account$/)
	await expect(page.locator('h1')).toHaveText('Account')

	await page.uncheck('input[type="checkbox"]')
	await page.click('a[href="/products"]')
	await expect(page).toHaveURL(/\/products$/)
	await page.click('a[href="/account"]')
	await expect(page).toHaveURL(/\/account$/)
	await page.check('input[type="checkbox"]')

	page.once('dialog', d => d.dismiss())
	await page.goBack()
	await expect(page).toHaveURL(/\/account$/)
})

test('404 view when no route matches', async ({ page }) => {
	await page.evaluate(() => window.router.goto('/totally-missing'))
	await expect(page.locator('main')).toContainText('Page not found')
})

test('hash navigation and scroll restoration', async ({ page }) => {
	await page.click('a[href="/about"]')
	await expect(page).toHaveURL(/\/about$/)

	const before = await navigation_count(page)
	await page.click('a[href="#bottom"]')
	await expect(page).toHaveURL(/#bottom$/)
	const after = await navigation_count(page)
	expect(after).toBe(before)
	await page.waitForFunction(() => {
		const el = document.getElementById('bottom')
		if (!el) return false
		const r = el.getBoundingClientRect()
		return r.top < innerHeight && r.bottom > 0
	})

	// navigate away via shallow push, then back
	await page.evaluate(() => window.router.push_state('/products'))
	await expect(page).toHaveURL(/\/products$/)
	await page.goBack()
	await expect(page).toHaveURL(/\/about(?:#.*)?$/)
	await page.waitForFunction(() => {
		const el = document.getElementById('bottom')
		if (!el) return false
		const r = el.getBoundingClientRect()
		return r.top < innerHeight && r.bottom > 0
	})
})

test('absolute same-path hash link scrolls via browser default', async ({ page }) => {
	await page.click('a[href="/about"]')
	await expect(page).toHaveURL(/\/about$/)
	const before = await navigation_count(page)

	await page.click('a[href="/about#bottom"]')
	await expect(page).toHaveURL(/\/about#bottom$/)
	const after = await navigation_count(page)
	expect(after).toBe(before)

	const in_view = await page.evaluate(() => {
		const el = document.getElementById('bottom')
		const r = el.getBoundingClientRect()
		return r.top < innerHeight && r.bottom > 0
	})
	expect(in_view).toBeTruthy()
})

test('relative same-path hash (#...) should bump idx', async ({ page }) => {
	await page.click('a[href="/about"]')
	await expect(page).toHaveURL(/\/about$/)
	const beforeIdx = await page.evaluate(() => history.state?.__navgo?.idx ?? 0)
	await page.click('a[href="#bottom"]')
	await expect(page).toHaveURL(/#bottom$/)
	await page.waitForFunction(
		before => (history.state?.__navgo?.idx ?? 0) === before + 1,
		beforeIdx,
	)
	const afterIdx = await page.evaluate(() => history.state?.__navgo?.idx ?? 0)
	// also verify that the browser scrolled to the element
	const scrolled = await page.evaluate(() => scrollY > 0)
	expect(scrolled).toBeTruthy()
	const in_view = await page.evaluate(() => {
		const el = document.getElementById('bottom')
		const r = el.getBoundingClientRect()
		return r.top < innerHeight && r.bottom > 0
	})
	expect(in_view).toBeTruthy()
	expect(afterIdx).toBe(beforeIdx + 1)
})

test('posts: back from hash-only returns to top', async ({ page }) => {
	await page.click('a[href="/posts"]')
	await expect(page).toHaveURL(/\/posts$/)
	await page.click('a[href^="#post-"]')
	await expect(page).toHaveURL(/#post-\d+$/)
	const scrolled = await page.evaluate(() => scrollY > 0)
	expect(scrolled).toBeTruthy()
	await page.goBack()
	await expect(page).toHaveURL(/\/posts$/)
	const at_top = await page.evaluate(() => scrollY === 0)
	expect(at_top).toBeTruthy()
})

test('popstate restores scroll position', async ({ page }) => {
	await page.click('a[href="/about"]')
	await expect(page).toHaveURL(/\/about$/)
	await page.click('a[href="#bottom"]')
	await expect(page).toHaveURL(/#bottom$/)

	// navigate away via shallow push, then back
	await page.evaluate(() => window.router.push_state('/products'))
	await expect(page).toHaveURL(/\/products$/)
	await page.goBack()
	await expect(page).toHaveURL(/\/about(?:#.*)?$/)
	await page.waitForFunction(() => {
		const el = document.getElementById('bottom')
		if (!el) return false
		const r = el.getBoundingClientRect()
		return r.top < innerHeight && r.bottom > 0
	})
})

test('target=_blank and download links are not intercepted', async ({ page }) => {
	await page.click('a[href="/"]')
	await page.evaluate(() => {
		const a1 = document.createElement('a')
		a1.href = 'about:blank'
		a1.target = '_blank'
		a1.textContent = 'ext'
		document.body.appendChild(a1)

		const a2 = document.createElement('a')
		a2.href = URL.createObjectURL(new Blob(['hello'], { type: 'text/plain' }))
		a2.download = 'hello.txt'
		a2.id = 'dl'
		a2.textContent = 'download me'
		document.body.appendChild(a2)
	})

	const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('text=ext')])
	await popup.close()
	await expect(page).toHaveURL(/\/$/)

	const before_url = page.url()
	const [download] = await Promise.all([page.waitForEvent('download'), page.click('#dl')])
	await page.waitForTimeout(100)
	expect(download.suggestedFilename()).toContain('hello')
	expect(page.url()).toBe(before_url)
})

test('preload API resolves and hover kicks in', async ({ page }) => {
	const ok = await page.evaluate(() => window.router.preload('/users/42').then(() => true))
	expect(ok).toBe(true)
	await page.hover('a[href="/users/42"]')
	await page.waitForTimeout(50)
})

test('hover spam across links does not navigate', async ({ page }) => {
	await page.click('a[href="/"]')
	const start_url = page.url()
	const start_nav = await navigation_count(page)
	const links = ['/products', '/contact', '/about', '/account', '/users/42', '/files/foo/bar']
	for (const href of links) {
		await page.hover(`a[href="${href}"]`)
		await page.waitForTimeout(25)
	}
	const end_nav = await navigation_count(page)
	expect(await page.url()).toBe(start_url)
	expect(end_nav).toBe(start_nav)
})

test('shallow back/forward retains content', async ({ page }) => {
	await page.click('a[href="/products"]')
	await expect(page).toHaveURL(/\/products$/)
	const content_before = await page.locator('main').textContent()
	// add multiple shallow entries
	await page.evaluate(() => {
		window.router.push_state('/products?tab=one')
		window.router.push_state('/products?tab=two')
		window.router.push_state('/products?tab=three')
	})
	await page.goBack()
	await page.goBack()
	await expect(page).toHaveURL(/\/products\?tab=one$/)
	await expect(page.locator('main')).toHaveText(content_before || '')
	await page.goForward()
	await page.goForward()
	await expect(page).toHaveURL(/\/products\?tab=three$/)
	await expect(page.locator('main')).toHaveText(content_before || '')
})
