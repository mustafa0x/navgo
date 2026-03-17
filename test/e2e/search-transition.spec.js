import { test, expect } from '@playwright/test'

test('search schema transition does not expose incoming schema to outgoing route', async ({
	page,
}) => {
	const page_errors = []
	const console_errors = []

	page.on('pageerror', err => page_errors.push(String(err)))
	page.on('console', msg => {
		if (msg.type() === 'error') console_errors.push(msg.text())
	})

	await page.goto('/transition-regression.html')
	await page.getByTestId('goto-a').click()
	await expect(page.getByTestId('route-a')).toBeVisible()

	await page.getByTestId('goto-b').click()
	await expect(page.getByTestId('route-b')).toBeVisible()
	await page.waitForTimeout(50)

	const err_output = page_errors.concat(console_errors).join('\n')
	expect(err_output).not.toContain('route_a_observed_transient_project_slug_undefined')
	expect(err_output).not.toContain('props_invalid_value')
	expect(err_output).not.toContain('bind:selected={undefined}')
})
