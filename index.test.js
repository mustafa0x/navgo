import { describe, it, expect, vi } from 'vitest'
console.debug = () => {}
import Navgo, { v } from './index.js'
import { get } from 'svelte/store'

global.history = {}

// Shared test stubs for browser-ish globals
function setupStubs(base = '/', state = { __navgo: { idx: 0 } }) {
	const listeners = new Map()
	// emulate window alias in Node env for code paths that reference it
	// tests assume browser-only library; alias keeps code minimal
	// @ts-ignore
	global.window = global
	global.addEventListener = (type, fn) => {
		const arr = listeners.get(type) || []
		arr.push(fn)
		listeners.set(type, arr)
	}
	global.removeEventListener = (type, fn) => {
		const arr = listeners.get(type) || []
		const i = arr.indexOf(fn)
		if (i >= 0) arr.splice(i, 1)
		listeners.set(type, arr)
	}
	global.dispatchEvent = ev => {
		const arr = listeners.get(ev.type) || []
		for (const fn of arr) fn(ev)
		return true
	}
	global.Event = class Event {
		constructor(type) {
			this.type = type
		}
	}
	// stub RAF for jsdom-less environment
	global.requestAnimationFrame = fn => setTimeout(fn, 0)
	// mock scroll state/APIs for Node env (used by router)
	global.scrollX = 0
	global.scrollY = 0
	global.scrollTo = (x = 0, y = 0) => {
		global.scrollX = x
		global.scrollY = y
	}
	// simple sessionStorage stub
	const sess = new Map()
	global.sessionStorage = {
		getItem: k => (sess.has(k) ? sess.get(k) : null),
		setItem: (k, v) => sess.set(k, String(v)),
		removeItem: k => sess.delete(k),
		clear: () => sess.clear(),
		get length() {
			return sess.size
		},
		key: i => Array.from(sess.keys())[i] || null,
	}

	// minimal CacheStorage mock (used by load plans)
	const cacheStores = new Map()
	global.caches = {
		open: async name => {
			if (!cacheStores.has(name)) cacheStores.set(name, new Map())
			const store = cacheStores.get(name)
			return {
				match: async req => {
					const r = store.get(req.url)
					return r ? r.clone() : undefined
				},
				put: async (req, res) => store.set(req.url, res.clone()),
				delete: async req => store.delete(req.url),
			}
		},
	}

	// minimal document stub for anchor scrolling in router
	if (!global.document) {
		global.document = {
			getElementById: () => null,
			querySelector: () => null,
		}
	}
	if (!global.CSS) {
		global.CSS = { escape: s => s }
	}
	let href = `http://example.com${base}`
	global.location = new URL(href)
	const hist = {
		state,
		scrollRestoration: 'auto',
		pushState(state, _title, url) {
			this.state = state
			href = url
		},
		replaceState(state, _title, url) {
			this.state = state
			href = url
		},
		go(n) {
			hist._went = n
		},
		_went: 0,
	}
	global.history = hist
	return hist
}

// micro helper: wait enough ticks for rAF+setTimeout chain
async function tick(n = 2) {
	while (n--) await new Promise(r => setTimeout(r, 0))
}

describe('exports', () => {
	it('exports', () => {
		expect(typeof Navgo).toBe('function')
	})

	it('new Navgo()', () => {
		setupStubs('/')
		let foo = new Navgo()
		expect(typeof foo.format).toBe('function')
		expect(typeof foo.init).toBe('function')
	})
})

describe('nav exposure', () => {
	it('updates nav on completion', async () => {
		setupStubs('/')
		const router = new Navgo([
			['/', {}],
			['/a', {}],
		])
		await router.init()
		await router.goto('/a')
		expect(router.nav?.to?.url?.pathname).toBe('/a')
	})
})

describe('search params', () => {
	it('coerces array elements for repeat/csv', async () => {
		setupStubs('/')
		const schema = v.object({
			ids: v.optional(v.fallback(v.array(v.number()), []), []),
		})
		const routes = [
			['/', { search_schema: schema }],
			['/csv', { search_schema: schema, search_options: { array_style: { ids: 'csv' } } }],
		]
		const router = new Navgo(routes)
		await router.init()
		let cur
		const unsub = router.search_params.subscribe(v => (cur = v))
		await router.goto('/?ids=1&ids=2')
		expect(cur.ids).toEqual([1, 2])
		await router.goto('/csv?ids=3,4')
		expect(cur.ids).toEqual([3, 4])
		unsub()
	})

	it('stringifies canonical managed search params', async () => {
		setupStubs('/search?z=1')
		const router = new Navgo([
			[
				'/search',
				{
					search_schema: v.object({
						q: v.optional(v.fallback(v.string(), ''), ''),
						page: v.optional(v.fallback(v.number(), 1), 1),
						tag: v.optional(v.fallback(v.array(v.string()), []), []),
						cat: v.optional(v.fallback(v.array(v.string()), []), []),
					}),
					search_options: {
						sort: true,
						array_style: { default: 'repeat', cat: 'csv' },
					},
				},
			],
		])
		await router.init()
		let cur
		const unsub = router.search_params.subscribe(v => (cur = v))
		router.search_params.set({ q: '', page: 1, tag: ['a', 'b'], cat: ['x', 'y'] })
		expect(router.search_params.toString()).toBe('cat=x%2Cy&tag=a&tag=b&z=1')
		expect(cur.tag).toEqual(['a', 'b'])
		unsub()
	})

	it('supports goto with query-only strings built from search_params', async () => {
		setupStubs('/search')
		let calls = 0
		let seen
		const router = new Navgo([
			[
				'/search',
				{
					search_schema: v.object({
						tag: v.optional(v.fallback(v.array(v.string()), []), []),
						cat: v.optional(v.fallback(v.array(v.string()), []), []),
					}),
					search_options: {
						sort: true,
						array_style: { default: 'repeat', cat: 'csv' },
					},
					loader({ search_params }) {
						calls += 1
						seen = search_params
						return Promise.resolve(search_params)
					},
				},
			],
		])
		await router.init()
		let cur
		const unsub = router.search_params.subscribe(v => (cur = v))
		router.search_params.set({ tag: ['a', 'b'], cat: ['x', 'y'] })
		await router.goto('?' + router.search_params.toString(), { replace: true })
		expect(calls).toBe(2)
		expect(seen).toEqual({ tag: ['a', 'b'], cat: ['x', 'y'] })
		expect(router.nav?.to?.url?.search).toBe('?cat=x%2Cy&tag=a&tag=b')
		expect(cur.cat).toEqual(['x', 'y'])
		unsub()
	})

	it('keeps managed search params in the URL on init', async () => {
		setupStubs('/search?tag=a')
		const router = new Navgo([
			[
				'/search',
				{
					search_schema: v.object({
						tag: v.optional(v.fallback(v.array(v.string()), []), []),
					}),
				},
			],
		])
		let cur
		router.route.subscribe(v => (cur = v))
		await router.init()
		expect(cur.url.href).toBe('http://example.com/search?tag=a')
		expect(cur.url.search).toBe('?tag=a')
		expect(cur.search_params.tag).toEqual(['a'])
		expect(router.search_params.toString()).toBe('tag=a')
		expect(router.nav?.to?.url?.href).toBe('http://example.com/search?tag=a')
		expect(global.history.state.__navgo.shallow).toBeUndefined()
	})

	it('does not collide with a toString search param key', async () => {
		setupStubs('/search?toString=abc')
		const router = new Navgo([
			[
				'/search',
				{
					search_schema: v.object({
						toString: v.optional(v.fallback(v.string(), ''), ''),
					}),
				},
			],
		])
		let cur
		router.search_params.subscribe(v => (cur = v))
		await router.init()
		expect(cur.toString).toBe('abc')
		expect(router.search_params.toString()).toBe('toString=abc')
	})

	it('ignores route-triggered search writes during schema transitions', async () => {
		setupStubs('/a?sort=top&rating=5')
		const router = new Navgo([
			[
				'/a',
				{
					search_schema: v.object({
						q: v.optional(v.fallback(v.string(), ''), ''),
						sort: v.optional(v.fallback(v.string(), 'new'), 'new'),
						rating: v.optional(v.fallback(v.number(), 0), 0),
					}),
				},
			],
			[
				'/b',
				{
					search_schema: v.object({
						q: v.optional(v.fallback(v.string(), ''), ''),
						category: v.optional(v.fallback(v.string(), 'all'), 'all'),
						status: v.optional(v.fallback(v.string(), 'open'), 'open'),
					}),
				},
			],
		])
		let wrote = false
		router.route.subscribe(v => {
			if (!v?.url || v.url.pathname !== '/b' || wrote) return
			wrote = true
			router.search_params.set({ category: 'books', status: 'open' })
		})

		await router.init()
		const original_push_state = global.history.pushState
		const original_replace_state = global.history.replaceState
		let push_calls = 0
		let replace_calls = 0
		global.history.pushState = (...args) => {
			push_calls += 1
			return original_push_state.apply(global.history, args)
		}
		global.history.replaceState = (...args) => {
			replace_calls += 1
			return original_replace_state.apply(global.history, args)
		}
		await router.goto('/b?category=books&status=closed')
		global.history.pushState = original_push_state
		global.history.replaceState = original_replace_state

		expect(push_calls + replace_calls).toBe(1)
		expect(get(router.search_params)).toEqual({ q: '', category: 'books', status: 'closed' })
	})
})

// ---

describe('is_navigating store', () => {
	it('toggles true/false around goto', async () => {
		setupStubs('/app/')
		const events = []
		const r = new Navgo(
			[
				['/', {}],
				[
					'/foo',
					{
						loader() {
							return new Promise(res => setTimeout(res, 10))
						},
					},
				],
			],
			{ base: '/app' },
		)
		r.is_navigating.subscribe(v => events.push(v))
		await r.init()
		// flush initial goto events
		events.length = 0
		await r.goto('/app/foo')
		// should have seen [true, false]
		expect(events[0]).toBe(true)
		expect(events.at(-1)).toBe(false)
		r.destroy()
	})

	it('resets to false on cancel', async () => {
		setupStubs('/app/')
		const events = []
		const r = new Navgo(
			[
				[
					'/',
					{
						before_route_leave(nav) {
							if (nav.type === 'goto') nav.cancel()
						},
					},
				],
				['/foo', {}],
			],
			{ base: '/app' },
		)
		r.is_navigating.subscribe(v => events.push(v))
		await r.init()
		events.length = 0
		await r.goto('/app/foo')
		// should have been set true then false despite cancellation
		expect(events[0]).toBe(true)
		expect(events.at(-1)).toBe(false)
		r.destroy()
	})
})

// ---

describe('attach_to_window option', () => {
	it('default true attaches instance', async () => {
		setupStubs('/app/')
		const r = new Navgo([['/', {}]], { base: '/app' })
		await r.init()
		expect(global.window.navgo).toBe(r)
		r.destroy()
	})

	it('false disables attachment', async () => {
		setupStubs('/app/')
		const r = new Navgo([['/', {}]], { base: '/app', attach_to_window: false })
		await r.init()
		expect(global.window.navgo).not.toBe(r)
		r.destroy()
	})
})

// ---

describe('aria_current option', () => {
	it('sets aria-current on active link when enabled', async () => {
		setupStubs('/')
		const make_link = path => {
			const url = new URL(path, 'http://example.com')
			const attrs = { href: url.pathname }
			return {
				host: url.host,
				pathname: url.pathname,
				target: '',
				download: '',
				getAttribute: k => attrs[k] ?? null,
				setAttribute: (k, v) => (attrs[k] = String(v)),
				removeAttribute: k => delete attrs[k],
			}
		}
		const links = [make_link('/'), make_link('/foo'), make_link('/bar')]
		const prev_doc = global.document
		global.document = {
			...prev_doc,
			querySelectorAll: () => links,
		}
		const r = new Navgo(
			[
				['/', {}],
				['/foo', {}],
				['/bar', {}],
			],
			{ aria_current: true },
		)
		await r.init()
		expect(links[0].getAttribute('aria-current')).toBe('page')
		expect(links[1].getAttribute('aria-current')).toBe(null)
		await r.goto('/foo')
		expect(links[1].getAttribute('aria-current')).toBe('page')
		expect(links[0].getAttribute('aria-current')).toBe(null)
		r.destroy()
		global.document = prev_doc
	})
})

// ---

describe('$.format', () => {
	it('empty base', () => {
		let foo = new Navgo()
		expect(foo.format('')).toBe('')
		expect(foo.format('/')).toBe('/')
		expect(foo.format('foo/bar/')).toBe('/foo/bar')
		expect(foo.format('foo/bar')).toBe('/foo/bar')
		expect(foo.format('/foobar')).toBe('/foobar')
		expect(foo.format('foobar')).toBe('/foobar')
	})

	it('base with leading slash', () => {
		let bar = new Navgo([], { base: '/hello' })
		expect(bar.format('/hello/world')).toBe('/world')
		expect(bar.format('hello/world')).toBe('/world')
		expect(bar.format('/world')).toBe(false)
		expect(bar.format('/hello/')).toBe('/')
		expect(bar.format('hello/')).toBe('/')
		expect(bar.format('/hello')).toBe('/')
		expect(bar.format('hello')).toBe('/')
	})

	it('base without leading slash', () => {
		let baz = new Navgo([], { base: 'hello' })
		expect(baz.format('/hello/world')).toBe('/world')
		expect(baz.format('hello/world')).toBe('/world')
		expect(baz.format('/hello.123')).toBe(false)
		expect(baz.format('/world')).toBe(false)
		expect(baz.format('/hello/')).toBe('/')
		expect(baz.format('hello/')).toBe('/')
		expect(baz.format('/hello')).toBe('/')
		expect(baz.format('hello')).toBe('/')
	})

	it('base with trailing slash', () => {
		let bat = new Navgo([], { base: 'hello/' })
		expect(bat.format('/hello/world')).toBe('/world')
		expect(bat.format('hello/world')).toBe('/world')
		expect(bat.format('/hello.123')).toBe(false)
		expect(bat.format('/world')).toBe(false)
		expect(bat.format('/hello/')).toBe('/')
		expect(bat.format('hello/')).toBe('/')
		expect(bat.format('/hello')).toBe('/')
		expect(bat.format('hello')).toBe('/')
	})

	it('base with leading and trailing slash', () => {
		let quz = new Navgo([], { base: '/hello/' })
		expect(quz.format('/hello/world')).toBe('/world')
		expect(quz.format('hello/world')).toBe('/world')
		expect(quz.format('/hello.123')).toBe(false)
		expect(quz.format('/world')).toBe(false)
		expect(quz.format('/hello/')).toBe('/')
		expect(quz.format('hello/')).toBe('/')
		expect(quz.format('/hello')).toBe('/')
		expect(quz.format('hello')).toBe('/')
	})

	it('base = "/" only', () => {
		let qut = new Navgo([], { base: '/' })
		expect(qut.format('/hello/world')).toBe('/hello/world')
		expect(qut.format('hello/world')).toBe('/hello/world')
		expect(qut.format('/world')).toBe('/world')
		expect(qut.format('/')).toBe('/')
	})

	it('base with nested path', () => {
		let qar = new Navgo([], { base: '/hello/there' })
		expect(qar.format('hello/there/world/')).toBe('/world')
		expect(qar.format('/hello/there/world/')).toBe('/world')
		expect(qar.format('/hello/there/world?foo=bar')).toBe('/world?foo=bar')
		expect(qar.format('/hello/there')).toBe('/')
		expect(qar.format('hello/there')).toBe('/')
		expect(qar.format('/world')).toBe(false)
		expect(qar.format('/')).toBe(false)
	})
})

// ---

describe('rewrite + href', () => {
	const locale_rewrite = {
		input({ url }) {
			const locale = url.pathname === '/en' || url.pathname.startsWith('/en/') ? 'en' : 'ar'
			if (locale === 'en') url.pathname = url.pathname.replace(/^\/en(?=\/|$)/, '') || '/'
			return { url, context: { locale } }
		},
		output({ url, context }) {
			const locale = context?.locale || 'ar'
			if (locale === 'en') url.pathname = url.pathname === '/' ? '/en' : `/en${url.pathname}`
			return { url, context: { locale } }
		},
	}

	it('formats public locale-prefixed URLs without duplicating routes', () => {
		setupStubs('/')
		const r = new Navgo([], { rewrite: locale_rewrite })
		expect(r.format('/about')).toBe('/about')
		expect(r.format('/en/about')).toBe('/about')
		expect(r.format('/en')).toBe('/')
	})

	it('builds public hrefs from canonical internal paths using current rewrite context', () => {
		setupStubs('/en/about')
		const r = new Navgo([], { rewrite: locale_rewrite })
		expect(r.href('/contact')).toBe('/en/contact')
		expect(r.href('/contact', { context: { locale: 'ar' } })).toBe('/contact')
		expect(r.href('/en/contact', { literal: true })).toBe('/en/contact')
	})

	it('treats same-origin absolute URLs as canonical targets unless literal is true', () => {
		setupStubs('/en/about')
		const r = new Navgo([], { rewrite: locale_rewrite })
		expect(r.href(new URL('http://example.com/contact'))).toBe('/en/contact')
		expect(r.href('http://example.com/contact')).toBe('/en/contact')
		expect(r.href(new URL('http://example.com/en/contact'))).toBe('/en/contact')
		expect(r.href(new URL('http://example.com/contact'), { literal: true })).toBe('/contact')
	})

	it('treats same-origin absolute URLs outside base as canonical targets too', () => {
		setupStubs('/app/about')
		const r = new Navgo([], { base: '/app' })
		expect(r.href(new URL('http://example.com/contact'))).toBe('/app/contact')
		expect(r.href('http://example.com/contact')).toBe('/app/contact')
		expect(r.href(new URL('http://example.com/app/contact'), { literal: true })).toBe(
			'/app/contact',
		)
	})

	it('navigates with one canonical route tree and locale-prefixed public URLs', async () => {
		setupStubs('/en/about')
		const r = new Navgo(
			[
				['/about', {}],
				['/contact', {}],
			],
			{ rewrite: locale_rewrite },
		)
		await r.init()
		expect(r.route).toBeTruthy()
		expect(r.nav?.to?.path).toBe('/about')
		expect(r.nav?.to?.context).toEqual({ locale: 'en' })
		await r.goto('/contact')
		expect(r.nav?.to?.url?.pathname).toBe('/en/contact')
		expect(r.nav?.to?.internal_url?.pathname).toBe('/contact')
		expect(r.nav?.to?.path).toBe('/contact')
		expect(r.nav?.to?.context).toEqual({ locale: 'en' })
	})

	it('navigates URL targets through rewrite.output unless literal is true', async () => {
		setupStubs('/en/about')
		const r = new Navgo(
			[
				['/about', {}],
				['/contact', {}],
			],
			{ rewrite: locale_rewrite },
		)
		await r.init()
		await r.goto(new URL('http://example.com/contact'))
		expect(r.nav?.to?.url?.pathname).toBe('/en/contact')
		expect(r.nav?.to?.internal_url?.pathname).toBe('/contact')
		await r.goto(new URL('http://example.com/contact'), { literal: true })
		expect(r.nav?.to?.url?.pathname).toBe('/contact')
		expect(r.nav?.to?.internal_url?.pathname).toBe('/contact')
	})

	it('uses public URLs for aria-current so localized siblings are not both active', async () => {
		setupStubs('/en/about')
		const make_link = path => {
			const url = new URL(path, 'http://example.com')
			const attrs = { href: url.pathname }
			return {
				host: url.host,
				pathname: url.pathname,
				target: '',
				download: '',
				getAttribute: k => attrs[k] ?? null,
				setAttribute: (k, v) => (attrs[k] = String(v)),
				removeAttribute: k => delete attrs[k],
			}
		}
		const links = [make_link('/about'), make_link('/en/about')]
		const prev_doc = global.document
		global.document = {
			...prev_doc,
			querySelectorAll: () => links,
		}
		const r = new Navgo([['/about', {}]], {
			aria_current: true,
			rewrite: locale_rewrite,
		})
		await r.init()
		expect(links[0].getAttribute('aria-current')).toBe(null)
		expect(links[1].getAttribute('aria-current')).toBe('page')
		r.destroy()
		global.document = prev_doc
	})
})

// ---

describe('$.match', () => {
	it('returns null when no route matches', async () => {
		const ctx = new Navgo([
			['/', {}],
			['users/:name', {}],
		])
		const res = await ctx.match('/nope')
		expect(res).toBe(null)
	})

	it('string patterns with named params', async () => {
		const ctx = new Navgo([
			['users/:name', {}],
			['/foo/books/:genre/:title?', {}],
		])

		let r1 = await ctx.match('/users/Bob')
		expect(!!r1).toBe(true)
		expect(r1.route[0]).toBe('users/:name')
		expect(r1.params).toEqual({ name: 'Bob' })

		let r2 = await ctx.match('/foo/books/kids/narnia')
		expect(!!r2).toBe(true)
		expect(r2.route[0]).toBe('/foo/books/:genre/:title?')
		expect(r2.params).toEqual({ genre: 'kids', title: 'narnia' })
	})

	it('custom validate hook skips a route when false', async () => {
		const r1 = ['users/:id', { validate: p => Number(p.id) > 5 }]
		const r2 = ['users/:id', {}]
		const ctx = new Navgo([r1, r2])
		const res = await ctx.match('/users/3')
		if (!res) throw new Error('expected a match')
		// should skip r1 because validate returned false, and match r2
		if (res.route !== r2) throw new Error('validate(false) did not skip the route')
	})

	it('wildcard captures as "*"', async () => {
		const ctx = new Navgo([['foo/bar/*', {}]])
		let res = await ctx.match('/foo/bar/baz/bat')
		expect(!!res).toBe(true)
		expect(res.route[0]).toBe('foo/bar/*')
		expect(res.params).toEqual({ ['*']: 'baz/bat' })
	})

	it('RegExp routes with named groups', async () => {
		const ctx = new Navgo([[/^\/articles\/(?<year>[0-9]{4})$/, {}]])
		let res = await ctx.match('/articles/2024')
		expect(!!res).toBe(true)
		expect(res.route[0] instanceof RegExp).toBe(true)
		expect(res.params).toEqual({ year: '2024' })
	})

	it('RegExp routes with /g are reusable across matches', async () => {
		const ctx = new Navgo([[/^\/foo$/g, {}]])
		const a = await ctx.match('/foo')
		const b = await ctx.match('/foo')
		expect(!!a).toBe(true)
		expect(!!b).toBe(true)
	})

	it('RegExp routes with /y are reusable across matches', async () => {
		const ctx = new Navgo([[/^\/foo$/y, {}]])
		const a = await ctx.match('/foo')
		const b = await ctx.match('/foo')
		expect(!!a).toBe(true)
		expect(!!b).toBe(true)
	})

	it('RegExp alternation without named groups', async () => {
		const ctx = new Navgo([[/about\/(contact|team)/, {}]])
		let a = await ctx.match('/about/contact')
		let b = await ctx.match('/about/team')
		expect(!!(a && b)).toBe(true)
		expect(Object.keys(a.params).length).toBe(0)
	})

	it('use with base via $.format', async () => {
		const ctx = new Navgo(
			[
				['/', {}],
				['users/:name', {}],
			],
			{ base: '/hello/world' },
		)

		let formatted = ctx.format('/hello/world/users/Ada')
		expect(formatted).toBe('/users/Ada')
		let res = await ctx.match(formatted)
		expect(!!res).toBe(true)
		expect(res.params).toEqual({ name: 'Ada' })
	})

	it('async validate is awaited', async () => {
		const r1 = [
			'users/:id',
			{
				validate: async p => {
					await new Promise(r => setTimeout(r, 5))
					return Number(p.id) > 5
				},
			},
		]
		const r2 = ['users/:id', {}]
		const ctx = new Navgo([r1, r2])
		const res = await ctx.match('/users/3')
		if (!res) throw new Error('expected a match')
		if (res.route !== r2) throw new Error('async validate(false) did not skip the route')
	})

	it('param schemas run before coercers; validate sees coerced params', async () => {
		const r1 = [
			'users/:id',
			{
				param_rules: {
					id: {
						schema: v.pipe(v.string(), v.toNumber()),
						coercer: value => (typeof value === 'number' ? value + 1 : -1),
					},
				},
				validate: p => typeof p.id === 'number' && p.id > 5,
			},
		]
		const r2 = ['users/:id', {}]
		const ctx = new Navgo([r1, r2])

		const a = await ctx.match('/users/5')
		if (!a) throw new Error('expected a match')
		expect(a.route).toBe(r1)
		expect(a.params.id).toBe(6)

		const b = await ctx.match('/users/3')
		if (!b) throw new Error('expected a match')
		expect(b.route).toBe(r2)
	})

	it('param coercers apply to RegExp named groups', async () => {
		const r = [
			/^\/articles\/(?<year>[0-9]{4})$/,
			{ param_rules: { year: { coercer: v => Number(v) } } },
		]
		const ctx = new Navgo([r])
		const res = await ctx.match('/articles/2024')
		if (!res) throw new Error('expected a match')
		expect(res.params.year).toBe(2024)
	})

	it('merges param_rules fields for same key', async () => {
		const r = [
			'users/:id',
			{ param_rules: { id: v.pipe(v.string(), v.regex(/^\d+$/)) } },
			{ param_rules: { id: { coercer: Number } } },
		]
		const ctx = new Navgo([r])
		const a = await ctx.match('/users/7')
		if (!a) throw new Error('expected a match')
		expect(a.params.id).toBe(7)

		const b = await ctx.match('/users/nope')
		expect(b).toBe(null)
	})

	it('merges route hooks and prefers third item', async () => {
		const r = ['users/:id', { validate: () => false }, { validate: () => true }]
		const ctx = new Navgo([r])
		const res = await ctx.match('/users/3')
		if (!res) throw new Error('expected a match')
		expect(res.route).toBe(r)
	})

	it('coercer exceptions do not throw; route is skipped', async () => {
		const r1 = [
			'users/:id',
			{
				param_rules: {
					id: {
						coercer() {
							throw new Error('boom')
						},
					},
				},
			},
		]
		const r2 = ['users/:id', {}]
		const ctx = new Navgo([r1, r2])
		const res = await ctx.match('/users/7')
		if (!res) throw new Error('expected a match')
		expect(res.route).toBe(r2)
	})

	it('validate exceptions do not throw; route is skipped', async () => {
		const r1 = [
			'users/:id',
			{
				validate() {
					throw new Error('boom')
				},
			},
		]
		const r2 = ['users/:id', {}]
		const ctx = new Navgo([r1, r2])
		const res = await ctx.match('/users/7')
		if (!res) throw new Error('expected a match')
		expect(res.route).toBe(r2)
	})
})

describe('before_navigate', () => {
	it('receives destination url and can cancel navigation', async () => {
		const hist = setupStubs('/app/')
		let seen
		let loads = 0
		const r = new Navgo(
			[
				['/', {}],
				[
					'/foo',
					{
						loader() {
							loads++
						},
					},
				],
			],
			{
				base: '/app',
				before_navigate(nav) {
					seen = nav?.to?.url?.pathname
					nav.cancel()
				},
			},
		)
		await r.init()
		await r.goto('/app/foo')
		expect(seen).toBe('/app/foo')
		expect(loads).toBe(0)
		// cancellation should prevent idx increment
		expect(hist.state?.__navgo?.idx ?? 0).toBe(0)
		// and route should remain on the initial location
		expect(r.nav?.to?.url?.pathname).toBe('/app/')
		r.destroy()
	})

	it('popstate cancel rolls history back via history.go', async () => {
		const hist = setupStubs('/app/')
		const r = new Navgo(
			[
				['/', {}],
				['/foo', {}],
			],
			{
				base: '/app',
				before_navigate(nav) {
					if (nav.type === 'popstate') nav.cancel()
				},
			},
		)
		await r.init()
		await r.goto('/app/foo') // idx 1
		// simulate back to idx 0
		global.location = new URL('http://example.com/app/')
		const ev = new Event('popstate')
		ev.state = { __navgo: { idx: 0 } }
		global.dispatchEvent(ev)
		await tick(3)
		// cancelling popstate to 0 should go forward(1)
		expect(hist._went).toBe(1)
		r.destroy()
	})

	it('hook exceptions do not reject goto()', async () => {
		setupStubs('/app/')
		const r = new Navgo(
			[
				['/', {}],
				['/foo', {}],
			],
			{
				base: '/app',
				before_navigate() {
					throw new Error('boom')
				},
			},
		)
		await r.init()
		await expect(r.goto('/app/foo')).resolves.toBeUndefined()
		expect(r.nav?.to?.url?.pathname).toBe('/app/foo')
		r.destroy()
	})
})

describe('before_route_leave', () => {
	it('goto; cancel prevents push', async () => {
		const hist = setupStubs('/app/')
		let called = 0
		const r = new Navgo(
			[
				[
					'/',
					{
						// leave-only semantics: cancel when leaving '/'
						before_route_leave(nav) {
							called++
							if (nav.type === 'goto') nav.cancel()
						},
					},
				],
				['/test', {}],
			],
			{
				base: '/app',
			},
		)
		await r.init()
		await r.goto('/app/test')
		expect(called > 0).toBe(true)
		// initial goto() does not push/replace; idx remains 0
		// cancellation should not change idx further
		expect(hist.state?.__navgo?.idx ?? 0).toBe(0)
	})

	it('popstate; cancel reverts with history.go', async () => {
		const hist = setupStubs('/app/')
		let called = 0
		const r = new Navgo(
			[
				[
					'/',
					{
						before_route_leave(nav) {
							called++
							if (nav.type === 'popstate') nav.cancel()
						},
					},
				],
				['/foo', {}],
			],
			{
				base: '/app',
			},
		)
		await r.init()
		// simulate an in-app shallow push to idx 2 (idx 1 was initial goto)
		r.push_state('/app/foo')
		// pop back to idx 0
		const ev = new Event('popstate')
		ev.state = { __navgo: { idx: 0 } }
		global.dispatchEvent(ev)
		expect(called > 0).toBe(true)
		// We shallow-pushed once after initial goto (idx 1 total); cancelling popstate to 0 requires history.go(1)
		expect(hist._went).toBe(1)
		r.destroy()
	})
})

describe('shallow popstate semantics', () => {
	it('popstate to shallow entry skips routing', async () => {
		setupStubs('/app/')
		let called = 0
		const r = new Navgo(
			[
				[
					'/',
					{
						before_route_leave(_nav) {
							called++
						},
					},
				],
				['/foo', {}],
			],
			{ base: '/app' },
		)
		await r.init()
		// create a shallow entry
		r.push_state('/app/foo')
		// go back into the shallow entry via popstate
		const ev = new Event('popstate')
		ev.state = { __navgo: { idx: 0, shallow: true } }
		global.dispatchEvent(ev)
		// since target is shallow, router should skip leave hook
		expect(called).toBe(0)
		r.destroy()
	})
})

describe('preload behavior', () => {
	function makeRouterWithLoader() {
		const calls = { root: 0, foo: 0 }
		const routes = [
			[
				'/',
				{
					async loader() {
						calls.root++
						return { route: 'root' }
					},
				},
			],
			[
				'/foo',
				{
					async loader() {
						calls.foo++
						return { route: 'foo' }
					},
				},
			],
		]
		const navs = []
		const router = new Navgo(routes, {
			base: '/app',
			after_navigate(nav) {
				navs.push(nav)
			},
		})
		return { router, calls, navs }
	}

	it('skips preloading current route and dedupes others', async () => {
		setupStubs('/app/')
		const { router, calls, navs } = makeRouterWithLoader()
		await router.init()

		await router.preload('/app/')
		// initial goto() ran root loader once; preloading current route should not add more
		expect(calls.root).toBe(1)

		const p1 = router.preload('/app/foo')
		const p2 = router.preload('/app/foo')
		await Promise.all([p1, p2])
		expect(calls.foo).toBe(1)

		await router.goto('/app/foo')
		expect(calls.foo).toBe(1)
		// afterNavigate received completion nav for goto
		expect(navs.at(-1)?.type).toBe('goto')
		router.destroy()
	})

	it('preload treats search params as distinct', async () => {
		setupStubs('/app/')
		const { router, calls } = makeRouterWithLoader()
		await router.init()

		await router.preload('/app/foo?x=1')
		await router.preload('/app/foo?x=2')
		expect(calls.foo).toBe(2)
		router.destroy()
	})

	it('preload loader errors do not cause unhandled rejections', async () => {
		setupStubs('/app/')
		let unhandled = 0
		const onUnhandled = () => (unhandled += 1)
		process.on('unhandledRejection', onUnhandled)
		try {
			const r = new Navgo(
				[
					['/', {}],
					[
						'/bad',
						{
							loader() {
								return Promise.reject(new Error('bad loader'))
							},
						},
					],
				],
				{ base: '/app' },
			)
			await r.init()
			// fire-and-forget like a hover preload
			r.preload('/app/bad')
			await tick(5)
			expect(unhandled).toBe(0)
			await expect(r.preload('/app/bad')).resolves.toBeTruthy()
			await expect(r.goto('/app/bad')).resolves.toBeUndefined()
			expect(r.nav?.to?.data?.__error).toBeTruthy()
			r.destroy()
		} finally {
			process.removeListener('unhandledRejection', onUnhandled)
		}
	})
})

describe('bootstrap behavior', () => {
	it('hydrates the initial branch without running loaders', async () => {
		setupStubs('/app/foo?q=kit')
		const calls = []
		let last
		const r = new Navgo(
			[
				{
					id: 'app',
					search_schema: v.object({
						q: v.optional(v.fallback(v.string(), ''), ''),
					}),
					async loader() {
						calls.push('app')
						return { from: 'app-loader' }
					},
					routes: [
						[
							'/foo',
							{
								async loader() {
									calls.push('page')
									return { from: 'page-loader' }
								},
							},
						],
					],
				},
			],
			{
				base: '/app',
				bootstrap: [{ session: true }, { page: 'boot' }],
				after_navigate(nav) {
					last = nav
				},
			},
		)
		await r.init()

		expect(calls).toEqual([])
		expect(last?.status).toBe(200)
		expect(last?.to?.layouts?.app?.data).toEqual({ session: true })
		expect(last?.to?.matches?.map(m => m.data)).toEqual([{ session: true }, { page: 'boot' }])
		expect(last?.to?.data).toEqual({ page: 'boot' })
		expect(get(r.search_params)).toEqual({ q: 'kit' })
		r.destroy()
	})

	it('falls back to loaders when bootstrap branch does not match', async () => {
		setupStubs('/app/foo')
		const calls = { app: 0, page: 0 }
		let last
		const r = new Navgo(
			[
				{
					id: 'app',
					async loader() {
						calls.app++
						return { from: 'app-loader' }
					},
					routes: [
						[
							'/foo',
							{
								async loader() {
									calls.page++
									return { from: 'page-loader' }
								},
							},
						],
					],
				},
			],
			{
				base: '/app',
				bootstrap: [{ session: true }],
				after_navigate(nav) {
					last = nav
				},
			},
		)
		await r.init()

		expect(calls).toEqual({ app: 1, page: 1 })
		expect(last?.to?.layouts?.app?.data).toEqual({ from: 'app-loader' })
		expect(last?.to?.data).toEqual({ from: 'page-loader' })
		r.destroy()
	})

	it('uses bootstrap only for the initial same-document navigation', async () => {
		setupStubs('/app/foo?x=1')
		let calls = 0
		const r = new Navgo(
			[
				[
					'/foo',
					{
						search_schema: v.object({
							x: v.optional(v.fallback(v.string(), ''), ''),
						}),
						async loader() {
							calls++
							return { call: calls }
						},
					},
				],
			],
			{ base: '/app', bootstrap: [{ call: 'boot' }] },
		)
		await r.init()

		expect(calls).toBe(0)
		expect(r.nav?.to?.data).toEqual({ call: 'boot' })

		await r.goto('/app/foo?x=2')

		expect(calls).toBe(1)
		expect(r.nav?.to?.data).toEqual({ call: 1 })
		expect(get(r.search_params)).toEqual({ x: '2' })
		r.destroy()
	})
})

// ---

describe('layouts and shared loaders', () => {
	it('match returns ordered matches and keyed layouts for nested groups', async () => {
		const ctx = new Navgo([
			{
				id: 'app',
				layout: { default: 'L1' },
				routes: [
					['/', {}],
					{
						id: 'admin',
						layout: { default: 'L2' },
						routes: [['/foo', {}]],
					},
				],
			},
		])
		const res = await ctx.match('/foo')
		if (!res) throw new Error('expected a match')
		expect(res.matches.length).toBe(3)
		expect(res.matches[0].type).toBe('layout')
		expect(res.matches[0].id).toBe('app')
		expect(res.matches[0].layout?.default).toBe('L1')
		expect(res.matches[1].id).toBe('admin')
		expect(res.matches[1].layout?.default).toBe('L2')
		expect(res.matches[2].type).toBe('route')
		expect(res.matches[2].route?.[0]).toBe('/foo')
		expect(res.layouts.app).toBe(res.matches[0])
		expect(res.layouts.admin).toBe(res.matches[1])
	})

	it('omits groups without ids from layouts lookup', async () => {
		const ctx = new Navgo([
			{
				id: 'app',
				layout: { default: 'L1' },
				routes: [
					{
						layout: { default: 'Anonymous' },
						routes: [['/foo', {}]],
					},
				],
			},
		])
		const res = await ctx.match('/foo')
		if (!res) throw new Error('expected a match')
		expect(Object.keys(res.layouts)).toEqual(['app'])
		expect(res.layouts.app).toBe(res.matches[0])
		expect(res.layouts.anonymous).toBeUndefined()
	})

	it('runs layout loaders and forwards data into nav.to.matches', async () => {
		setupStubs('/app/')
		const calls = []
		const navs = []
		const r = new Navgo(
			[
				{
					id: 'root',
					layout: { default: 'Root' },
					async loader() {
						calls.push('root')
						return { root: true }
					},
					routes: [
						['/', {}],
						{
							id: 'inner',
							layout: { default: 'Inner' },
							async loader() {
								calls.push('inner')
								return { inner: true }
							},
							routes: [
								[
									'/foo',
									{
										async loader() {
											calls.push('page')
											return { page: true }
										},
									},
								],
							],
						},
					],
				},
			],
			{
				base: '/app',
				after_navigate(nav) {
					navs.push(nav)
				},
			},
		)
		await r.init()
		calls.length = 0
		navs.length = 0

		await r.goto('/app/foo')
		expect(calls).toEqual(['root', 'inner', 'page'])
		const m = navs.at(-1)?.to?.matches || []
		expect(m.length).toBe(3)
		expect(m[0].type).toBe('layout')
		expect(m[0].data).toEqual({ root: true })
		expect(m[1].data).toEqual({ inner: true })
		expect(m[2].type).toBe('route')
		expect(m[2].route?.[0]).toBe('/foo')
		expect(m[2].data).toEqual({ page: true })
		expect(navs.at(-1)?.to?.layouts?.root).toBe(m[0])
		expect(navs.at(-1)?.to?.layouts?.root?.data).toEqual({ root: true })
		expect(navs.at(-1)?.to?.layouts?.inner).toBe(m[1])
		expect(navs.at(-1)?.to?.layouts?.inner?.data).toEqual({ inner: true })
		// leaf convenience stays on nav.to.data
		expect(navs.at(-1)?.to?.data).toEqual({ page: true })
		r.destroy()
	})

	it('route store exposes layouts and resets them on 404', async () => {
		setupStubs('/app/')
		let cur
		const r = new Navgo(
			[
				{
					id: 'app',
					layout: { default: 'App' },
					async loader() {
						return { session: true }
					},
					routes: [
						['/', {}],
						['/foo', {}],
					],
				},
			],
			{ base: '/app' },
		)
		const unsub = r.route.subscribe(v => (cur = v))
		await r.init()
		expect(cur.layouts.app?.data).toEqual({ session: true })
		await r.goto('/app/foo')
		expect(cur.layouts.app?.data).toEqual({ session: true })
		await r.goto('/app/missing')
		expect(cur.route).toBe(null)
		expect(Object.keys(cur.layouts)).toEqual([])
		unsub()
		r.destroy()
	})

	it('throws on duplicate route group ids', () => {
		expect(
			() =>
				new Navgo([
					{ id: 'app', routes: [['/', {}]] },
					{ id: 'app', routes: [['/foo', {}]] },
				]),
		).toThrow(/Duplicate route group id "app"/)
	})

	it('popstate keeps layouts in sync with matches and route store', async () => {
		setupStubs('/app/')
		let cur
		const r = new Navgo(
			[
				{
					id: 'app',
					layout: { default: 'App' },
					async loader() {
						return { app: true }
					},
					routes: [
						['/', {}],
						['/foo', {}],
					],
				},
			],
			{ base: '/app' },
		)
		const unsub = r.route.subscribe(v => (cur = v))
		await r.init()
		await r.goto('/app/foo')

		global.location = new URL('http://example.com/app/')
		const ev = new Event('popstate')
		ev.state = { __navgo: { idx: 0 } }
		global.dispatchEvent(ev)
		await tick()

		expect(cur.route?.[0]).toBe('/')
		expect(cur.layouts.app).toBe(cur.matches[0])
		expect(cur.layouts.app?.data).toEqual({ app: true })
		expect(r.nav?.to?.layouts?.app).toBe(r.nav?.to?.matches?.[0])
		expect(r.nav?.to?.layouts?.app?.data).toEqual({ app: true })
		unsub()
		r.destroy()
	})

	it('preload runs full loader chain and goto uses it', async () => {
		setupStubs('/app/')
		const calls = { root: 0, page: 0 }
		const r = new Navgo(
			[
				{
					id: 'app',
					async loader() {
						calls.root++
						return { app: true }
					},
					routes: [
						['/', {}],
						[
							'/foo',
							{
								loader() {
									calls.page++
								},
							},
						],
					],
				},
			],
			{ base: '/app' },
		)
		await r.init()
		calls.root = 0
		calls.page = 0

		const p1 = r.preload('/app/foo')
		const p2 = r.preload('/app/foo')
		await Promise.all([p1, p2])
		expect(calls.root).toBe(1)
		expect(calls.page).toBe(1)

		await r.goto('/app/foo')
		// goto should use preloaded results (no extra loader calls)
		expect(calls.root).toBe(1)
		expect(calls.page).toBe(1)
		expect(r.nav?.to?.layouts?.app).toBe(r.nav?.to?.matches?.[0])
		expect(r.nav?.to?.layouts?.app?.data).toEqual({ app: true })
		expect(r.nav?.to?.route?.[0]).toBe('/foo')
		r.destroy()
	})
})

describe('load plan caching', () => {
	it('ignores CacheStorage when unavailable', async () => {
		setupStubs('/app/foo')
		const prev_caches = global.caches
		// @ts-ignore
		global.caches = undefined
		let fetch_calls = 0
		global.fetch = async () => {
			fetch_calls++
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			})
		}
		let last
		const r = new Navgo(
			[
				[
					'/foo',
					{
						loader() {
							return { data: 'https://example.com/data' }
						},
					},
				],
			],
			{
				base: '/app',
				after_navigate(nav) {
					last = nav
				},
			},
		)
		await r.init()
		expect(fetch_calls).toBe(1)
		expect(last.to.data.data).toEqual({ ok: true })
		r.destroy()
		global.caches = prev_caches
	})

	it('load plan defaults apply to parse', async () => {
		setupStubs('/app/foo')
		global.fetch = async () => new Response('ok', { status: 200 })
		let last
		const r = new Navgo(
			[
				[
					'/foo',
					{
						loader() {
							return { data: 'https://example.com/data' }
						},
					},
				],
			],
			{
				base: '/app',
				load_plan_defaults: { parse: 'text' },
				after_navigate(nav) {
					last = nav
				},
			},
		)
		await r.init()
		expect(last.to.data.data).toBe('ok')
		r.destroy()
	})

	it('load plan defaults apply to cache strategy and ttl', async () => {
		setupStubs('/app/foo')
		let fetch_calls = 0
		global.fetch = async () => {
			fetch_calls++
			return new Response(JSON.stringify({ n: fetch_calls }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			})
		}
		const r = new Navgo(
			[
				[
					'/foo',
					{
						loader() {
							return { data: 'https://example.com/data' }
						},
					},
				],
			],
			{
				base: '/app',
				load_plan_defaults: { cache: { strategy: 'cache-first', ttl: 1 } },
			},
		)
		await r.init()
		expect(fetch_calls).toBe(1)
		await new Promise(r => setTimeout(r, 5))
		await r.goto('/app/foo')
		expect(fetch_calls).toBe(2)
		r.destroy()
	})

	it('caches and serves from cache when fresh', async () => {
		setupStubs('/app/foo')
		let fetch_calls = 0
		global.fetch = async () => {
			fetch_calls++
			return new Response(JSON.stringify({ n: fetch_calls }), {
				status: 200,
				headers: { 'Content-Type': 'application/json', ETag: 'v' + fetch_calls },
			})
		}
		let last
		const r = new Navgo(
			[
				[
					'/foo',
					{
						loader() {
							return { data: 'https://example.com/data' }
						},
					},
				],
			],
			{
				base: '/app',
				after_navigate(nav) {
					last = nav
				},
			},
		)
		await r.init()
		expect(fetch_calls).toBe(1)
		expect(last.to.data.data).toEqual({ n: 1 })
		expect(last.to.data.__meta.source.data).toBe('network')

		await r.goto('/app/foo')
		expect(fetch_calls).toBe(1)
		expect(last.to.data.data).toEqual({ n: 1 })
		expect(last.to.data.__meta.source.data).toBe('cache')
		r.destroy()
	})

	it('does not expose __meta.preloads for load plans', async () => {
		setupStubs('/app/foo')
		global.fetch = async req =>
			new Response(JSON.stringify({ url: req.url }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			})
		let last
		const r = new Navgo(
			[
				[
					'/foo',
					{
						loader() {
							return {
								a: 'http://example.com/api/a?x=1',
								b: { request: 'http://example.com/api/b' },
								c: { request: 'https://other.com/api/c' },
							}
						},
					},
				],
			],
			{
				base: '/app',
				after_navigate(nav) {
					last = nav
				},
			},
		)
		await r.init()
		expect(last.to.data.__meta.preloads).toBeUndefined()
		r.destroy()
	})

	it('does not expose __meta.preloads for async plain-data loaders', async () => {
		setupStubs('/app/foo')
		let last
		const r = new Navgo(
			[
				[
					'/foo',
					{
						async loader() {
							return { data: { ok: true } }
						},
					},
				],
			],
			{
				base: '/app',
				after_navigate(nav) {
					last = nav
				},
			},
		)
		await r.init()
		expect(last.to.data.__meta?.preloads).toBeUndefined()
		r.destroy()
	})

	it('stale-while-revalidate only updates when value changes', async () => {
		setupStubs('/app/foo')
		let fetch_calls = 0
		const payloads = [{ v: 1 }, { v: 1 }, { v: 2 }]
		global.fetch = async () => {
			const idx = Math.min(fetch_calls, payloads.length - 1)
			fetch_calls++
			return new Response(JSON.stringify(payloads[idx]), {
				status: 200,
				headers: { 'Content-Type': 'application/json', ETag: 'v' + fetch_calls },
			})
		}
		let revals = 0
		let last
		const r = new Navgo(
			[
				[
					'/foo',
					{
						loader() {
							return {
								data: {
									request: 'https://example.com/data',
									cache: { strategy: 'swr', ttl: 0 },
								},
							}
						},
					},
				],
			],
			{
				base: '/app',
				after_navigate(nav, on_revalidate) {
					last = nav
					on_revalidate?.(() => {
						revals++
					})
				},
			},
		)
		await r.init()
		expect(last.to.data.data).toEqual({ v: 1 })
		expect(fetch_calls).toBe(1)

		// stale (ttl=0), but value unchanged => no revalidate callback
		await new Promise(r => setTimeout(r, 2))
		await r.goto('/app/foo')
		await tick(3)
		expect(fetch_calls).toBe(2)
		expect(revals).toBe(0)
		expect(last.to.data.data).toEqual({ v: 1 })

		// next revalidate returns different value => callback fires + data updates
		await new Promise(r => setTimeout(r, 2))
		await r.goto('/app/foo')
		await tick(3)
		expect(fetch_calls).toBe(3)
		expect(revals).toBe(1)
		expect(last.to.data.data).toEqual({ v: 2 })
		r.destroy()
	})

	it('invalidate removes entries so next nav refetches', async () => {
		setupStubs('/app/foo')
		let fetch_calls = 0
		global.fetch = async () => {
			fetch_calls++
			return new Response(JSON.stringify({ n: fetch_calls }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			})
		}
		const r = new Navgo(
			[
				[
					'/foo',
					{
						loader() {
							return { data: 'https://example.com/data' }
						},
					},
				],
			],
			{ base: '/app' },
		)
		await r.init()
		await r.goto('/app/foo')
		expect(fetch_calls).toBe(1)
		await r.invalidate('https://example.com/data')
		await r.goto('/app/foo')
		expect(fetch_calls).toBe(2)
		r.destroy()
	})
})

describe('navigation status', () => {
	it('exposes 200, 404, and 500 on completed navigations', async () => {
		setupStubs('/app/')
		const statuses = []
		const r = new Navgo(
			[
				['/', {}],
				[
					'/soft-404',
					{
						async loader() {
							return { __error: { status: 404 } }
						},
					},
				],
				[
					'/boom',
					{
						async loader() {
							return { __error: new Error('boom') }
						},
					},
				],
			],
			{
				base: '/app',
				after_navigate(nav) {
					statuses.push([nav.to?.path, nav.status])
				},
			},
		)
		await r.init()
		await r.goto('/app/missing')
		await r.goto('/app/soft-404')
		await r.goto('/app/boom')
		expect(statuses).toEqual([
			['/', 200],
			['/missing', 404],
			['/soft-404', 404],
			['/boom', 500],
		])
		r.destroy()
	})

	it('exposes route ssr metadata on nav after goto resolves', async () => {
		setupStubs('/app/')
		const r = new Navgo(
			[
				['/', {}],
				['/foo', { ssr: { serve_shell: true, refresh_every: 300 } }],
			],
			{ base: '/app' },
		)
		await r.init()
		await r.goto('/app/foo')
		expect(r.nav?.status).toBe(200)
		expect(r.nav?.ssr?.serve_shell).toBe(true)
		expect(r.nav?.ssr?.refresh_every).toBe(300)
		r.destroy()
	})

	it('preserves route ssr metadata across swr revalidation', async () => {
		setupStubs('/app/foo')
		let fetch_calls = 0
		const payloads = [{ v: 1 }, { v: 2 }]
		global.fetch = async () =>
			new Response(JSON.stringify(payloads[fetch_calls++]), {
				status: 200,
				headers: { 'Content-Type': 'application/json', ETag: 'v' + fetch_calls },
			})
		const revals = []
		const r = new Navgo(
			[
				[
					'/foo',
					{
						ssr: { serve_shell: true, refresh_every: 300 },
						loader() {
							return {
								data: {
									request: 'https://example.com/data',
									cache: { strategy: 'swr', ttl: 0 },
								},
							}
						},
					},
				],
			],
			{
				base: '/app',
				after_navigate(nav, on_revalidate) {
					on_revalidate?.(() => {
						revals.push([
							nav.status,
							nav.ssr?.serve_shell,
							nav.ssr?.refresh_every,
							nav.to?.data?.data?.v,
						])
					})
				},
			},
		)
		await r.init()
		await new Promise(r => setTimeout(r, 2))
		await r.goto('/app/foo')
		await tick(3)
		expect(revals).toEqual([[200, true, 300, 2]])
		r.destroy()
	})
})

describe('initial scroll ownership', () => {
	it('preserves SSR scroll on init and switches to manual after boot', async () => {
		setupStubs('/app/foo')
		const r = new Navgo([['/foo', {}]], { base: '/app' })
		global.scrollTo(0, 321)
		const prev_scroll = global.scrollTo
		let scroll_calls = 0
		global.scrollTo = (x = 0, y = 0) => {
			scroll_calls++
			prev_scroll(x, y)
		}
		await r.init()
		expect(global.history.scrollRestoration).toBe('auto')
		await tick(2)
		expect(scroll_calls).toBe(0)
		expect(global.scrollY).toBe(321)
		expect(global.history.scrollRestoration).toBe('manual')
		global.scrollTo = prev_scroll
		r.destroy()
	})

	it('resets scrollRestoration to auto on beforeunload', async () => {
		setupStubs('/app/foo')
		const r = new Navgo([['/foo', {}]], { base: '/app' })
		await r.init()
		await tick(2)
		expect(global.history.scrollRestoration).toBe('manual')
		const ev = { type: 'beforeunload', preventDefault() {}, returnValue: undefined }
		global.dispatchEvent(ev)
		expect(global.history.scrollRestoration).toBe('auto')
		r.destroy()
	})
})

describe('scroll restore persistence', () => {
	it('initializes a fresh document entry with a timestamp history idx', () => {
		const hist = setupStubs('/app/foo', null)
		const now = vi.spyOn(Date, 'now').mockReturnValue(123456)
		const r = new Navgo([['/foo', {}]], { base: '/app' })
		expect(hist.state?.__navgo?.idx).toBe(123456)
		now.mockRestore()
		r.destroy()
	})

	it('leaves initial refresh scroll to the browser even with saved session scroll', async () => {
		setupStubs('/app/foo')
		global.history.state = { __navgo: { idx: 7 } }
		global.sessionStorage.setItem(`__navgo_scroll:7`, JSON.stringify({ x: 10, y: 200 }))
		global.scrollTo(5, 123)
		let seen = null
		const r = new Navgo([['/foo', {}]], {
			base: '/app',
			after_navigate() {
				seen = { x: global.scrollX, y: global.scrollY }
			},
		})
		expect(global.scrollX).toBe(5)
		expect(global.scrollY).toBe(123)
		expect(global.history.scrollRestoration).toBe('auto')
		expect(seen).toBe(null)
		await r.init()
		expect(seen).toEqual({ x: 5, y: 123 })
		expect(global.history.scrollRestoration).toBe('auto')
		await tick(2)
		expect(global.history.scrollRestoration).toBe('manual')
		r.destroy()
	})

	it('stores beforeunload scroll by history idx', async () => {
		setupStubs('/app/foo')
		const r = new Navgo([['/foo', {}]], { base: '/app' })
		await r.init()
		global.scrollTo(10, 200)
		const ev = { type: 'beforeunload', preventDefault() {}, returnValue: undefined }
		global.dispatchEvent(ev)
		expect(
			global.sessionStorage.getItem(`__navgo_scroll:${global.history.state.__navgo.idx}`),
		).toBe(JSON.stringify({ x: 10, y: 200 }))
		r.destroy()
	})

	it('shallow push saves previous entry scroll into state.pos', async () => {
		const hist = setupStubs('/app/products')
		const r = new Navgo([['/products', {}]], { base: '/app' })
		await r.init()
		// move window scroll and then perform a shallow push
		global.scrollTo(5, 123)
		const calls = []
		const orig = hist.replaceState
		hist.replaceState = (s, t, u) => {
			calls.push(s)
			orig.call(hist, s, t, u)
		}
		r.push_state('/app/products?product=1')
		expect(calls.length).toBeGreaterThan(0)
		expect(calls.at(-1)?.__navgo?.pos).toEqual({ x: 5, y: 123 })
		r.destroy()
	})

	it('popstate prefers ev.state.__navgo.pos', async () => {
		setupStubs('/app/products')
		const r = new Navgo([['/products', {}]], { base: '/app' })
		await r.init()
		global.scrollTo(0, 0)
		const ev = new Event('popstate')
		ev.state = { __navgo: { shallow: true, idx: 0, pos: { x: 11, y: 222 } } }
		global.dispatchEvent(ev)
		await tick()
		expect(global.scrollX).toBe(11)
		expect(global.scrollY).toBe(222)
		r.destroy()
	})
})

describe('stress and edge cases', () => {
	it('popstate deep: cancel computes correct delta', async () => {
		const hist = setupStubs('/app/')
		const r = new Navgo(
			[
				[
					'/',
					{
						before_route_leave(nav) {
							if (nav.type === 'popstate') nav.cancel()
						},
					},
				],
			],
			{ base: '/app' },
		)
		await r.init()
		// create multiple shallow entries
		r.push_state('/app/a')
		r.push_state('/app/b')
		r.push_state('/app/c')
		// jump back to idx 0 in one popstate
		const ev = new Event('popstate')
		ev.state = { __navgo: { idx: 0 } }
		global.dispatchEvent(ev)
		expect(hist._went).toBe(3)
		r.destroy()
	})

	it('long preload chain: dedupe per path and resolve all', async () => {
		setupStubs('/app/')
		const calls = new Map()
		const r = new Navgo(
			[
				[
					'/p/:id',
					{
						loader: loader_ctx => {
							const id = loader_ctx.params.id
							calls.set(id, (calls.get(id) || 0) + 1)
							return new Promise(res => setTimeout(res, 5))
						},
					},
				],
			],
			{ base: '/app' },
		)
		await r.init()
		const ids = Array.from({ length: 10 }, (_, i) => String(i + 1))
		const urls = ids
			.concat(ids)
			.sort()
			.map(id => `/app/p/${id}`)
		await Promise.all(urls.map(u => r.preload(u)))
		for (const id of ids) expect(calls.get(id)).toBe(1)
		r.destroy()
	})

	it('hash-only popstate updates url without loader', async () => {
		setupStubs('/app/foo#top')
		const prev_doc = global.document
		global.document = {
			getElementById: () => null,
			querySelector: () => null,
		}
		let load_calls = 0
		let changes = 0
		const r = new Navgo(
			[
				[
					'/foo',
					{
						async loader() {
							load_calls++
							return { ok: true }
						},
					},
				],
			],
			{ base: '/app' },
		)
		const unsub = r.route.subscribe(() => {
			changes++
		})
		await r.init()
		changes = 0
		expect(load_calls).toBe(1)
		// simulate hash-only change on same path
		global.location = new URL('http://example.com/app/foo#bar')
		const ev = new Event('popstate')
		ev.state = { __navgo: { idx: 0 } }
		global.dispatchEvent(ev)
		// loader should not run, but route store should update
		expect(load_calls).toBe(1)
		expect(changes).toBeGreaterThan(0)
		unsub()
		r.destroy()
		global.document = prev_doc
	})

	it('rapid shallow back/forward zig-zag updates route store without loader', async () => {
		setupStubs('/app/')
		let changes = 0
		let loads = 0
		const r = new Navgo(
			[
				[
					'/foo',
					{
						loader() {
							loads++
						},
					},
				],
				[
					'/bar',
					{
						loader() {
							loads++
						},
					},
				],
			],
			{ base: '/app' },
		)
		const unsub = r.route.subscribe(() => {
			changes++
		})
		await r.init()
		// add three shallow entries
		r.push_state('/app/foo') // idx 1
		r.push_state('/app/bar') // idx 2
		r.push_state('/app/foo') // idx 3
		changes = 0
		// zig-zag between 1 and 2 repeatedly via popstate
		for (const idx of [2, 1, 2, 1, 2, 1, 2, 1]) {
			const ev = new Event('popstate')
			ev.state = { __navgo: { idx, shallow: true } }
			global.dispatchEvent(ev)
		}
		// no loader should have executed (all shallow)
		expect(loads).toBe(0)
		// route store should update for each popstate
		expect(changes).toBeGreaterThanOrEqual(8)
		unsub()
		r.destroy()
	})
})

describe('tick option', () => {
	it('awaits two ticks between after_navigate and scroll', async () => {
		setupStubs('/app/')
		const events = []
		// record scroll calls
		const prevScroll = global.scrollTo
		global.scrollTo = (x = 0, y = 0) => {
			events.push('scroll')
			prevScroll(x, y)
		}
		const r = new Navgo(
			[
				['/', {}],
				['/foo', {}],
			],
			{
				base: '/app',
				after_navigate() {
					events.push('after')
				},
				tick() {
					events.push('tick')
				},
			},
		)
		await r.init()
		const tick_calls_before_goto = events.filter(v => v === 'tick').length
		await r.goto('/app/foo')
		await tick(2)
		expect(events.includes('after')).toBe(true)
		expect(events.filter(v => v === 'tick').length - tick_calls_before_goto).toBe(2)
		expect(events.includes('scroll')).toBe(true)
		// ordering: after -> tick -> tick -> scroll
		expect(events.indexOf('after') < events.indexOf('tick')).toBe(true)
		expect(events.lastIndexOf('tick') < events.indexOf('scroll')).toBe(true)
		r.destroy()
		global.scrollTo = prevScroll
	})
})

describe('scroll_to_top option', () => {
	it('skips default top scroll when disabled', async () => {
		setupStubs('/app/')
		const r = new Navgo(
			[
				['/', {}],
				['/foo', {}],
			],
			{ base: '/app', scroll_to_top: false },
		)
		await r.init()
		const prev_scroll = global.scrollTo
		prev_scroll(0, 321)
		let scroll_calls = 0
		global.scrollTo = (x = 0, y = 0) => {
			scroll_calls++
			prev_scroll(x, y)
		}
		await r.goto('/app/foo')
		await tick(2)
		expect(scroll_calls).toBe(0)
		expect(global.scrollY).toBe(321)
		global.scrollTo = prev_scroll
		r.destroy()
	})
})

function make_pane() {
	const listeners = new Map()
	return {
		scrollLeft: 0,
		scrollTop: 0,
		addEventListener(type, fn) {
			const a = listeners.get(type) || []
			a.push(fn)
			listeners.set(type, a)
		},
		removeEventListener(type, fn) {
			const a = listeners.get(type) || []
			const i = a.indexOf(fn)
			if (i >= 0) a.splice(i, 1)
			listeners.set(type, a)
		},
		scrollTo(x = 0, y = 0) {
			this.scrollLeft = x
			this.scrollTop = y
		},
		_emit(type) {
			for (const fn of listeners.get(type) || []) fn({ type, target: this })
		},
	}
}

describe('scroll restoration (areas)', () => {
	it('restores element position on popstate (by id)', async () => {
		setupStubs('/app/')
		const pane = make_pane()
		pane.id = 'pane'
		const prev_doc = global.document
		// allow apply_scroll to find the pane by selector
		global.document = {
			...prev_doc,
			querySelector: sel => (String(sel).includes('pane') ? pane : null),
		}
		const r = new Navgo(
			[
				['/', {}],
				['/foo', {}],
				['/bar', {}],
			],
			{ base: '/app' },
		)
		await r.init()

		await r.goto('/app/foo') // idx 1
		// simulate a user scroll inside the pane
		pane.scrollTop = 123
		// router listens on window with capture (throttled 100ms)
		global.dispatchEvent({ type: 'scroll', target: pane })
		await new Promise(r => setTimeout(r, 120))

		await r.goto('/app/bar') // idx 2
		// simulate leaving the page and resetting scroll
		pane.scrollTop = 0
		// popstate back to idx 1
		global.location = new URL('http://example.com/app/foo')
		const ev = new Event('popstate')
		ev.state = { __navgo: { idx: 1 } }
		global.dispatchEvent(ev)
		await tick(2)
		expect(pane.scrollTop).toBe(123)
		r.destroy()
		global.document = prev_doc
	})

	it('popstate without saved window pos falls through to top', async () => {
		setupStubs('/app/foo')
		const pane = make_pane()
		pane.id = 'pane'
		const prev_doc = global.document
		global.document = {
			...prev_doc,
			querySelector: sel => (String(sel).includes('pane') ? pane : null),
		}

		const r = new Navgo(
			[
				['/foo', {}],
				['/bar', {}],
			],
			{ base: '/app' },
		)
		await r.init() // idx 0 (/foo)

		pane.scrollTop = 55
		global.dispatchEvent({ type: 'scroll', target: pane })
		await new Promise(r => setTimeout(r, 120))

		await r.goto('/app/bar') // idx 1
		global.scrollTo(0, 999)
		expect(global.scrollY).toBe(999)
		pane.scrollTop = 0

		// popstate back to idx 0 (no pos stored for window)
		global.location = new URL('http://example.com/app/foo')
		const ev = new Event('popstate')
		ev.state = { __navgo: { idx: 0 } }
		global.dispatchEvent(ev)
		await tick(3)
		// pane restored; window falls through to top
		expect(pane.scrollTop).toBe(55)
		expect(global.scrollY).toBe(0)
		r.destroy()
		global.document = prev_doc
	})

	it('shallow push clones scroll-area snapshot into the new entry', async () => {
		setupStubs('/app/foo')
		const pane = make_pane()
		pane.id = 'pane'
		const prev_doc = global.document
		global.document = {
			...prev_doc,
			querySelector: sel => (String(sel).includes('pane') ? pane : null),
		}

		const r = new Navgo([['/foo', {}]], { base: '/app' })
		await r.init() // idx 0

		pane.scrollTop = 77
		global.dispatchEvent({ type: 'scroll', target: pane })
		await new Promise(r => setTimeout(r, 120))

		r.push_state('/app/foo?x=1') // idx 1 (shallow)
		pane.scrollTop = 0

		// back to idx 0 then forward to idx 1
		global.location = new URL('http://example.com/app/foo')
		let ev = new Event('popstate')
		ev.state = { __navgo: { idx: 0, shallow: true } }
		global.dispatchEvent(ev)
		await tick(2)

		global.location = new URL('http://example.com/app/foo?x=1')
		ev = new Event('popstate')
		ev.state = { __navgo: { idx: 1, shallow: true, from: '/app/foo' } }
		global.dispatchEvent(ev)
		await tick(3)

		expect(pane.scrollTop).toBe(77)
		r.destroy()
		global.document = prev_doc
	})

	it('divergent history clears forward scroll snapshots (no stale reuse)', async () => {
		setupStubs('/app/a')
		const pane = make_pane()
		pane.id = 'pane'
		const prev_doc = global.document
		global.document = {
			...prev_doc,
			querySelector: sel => (String(sel).includes('pane') ? pane : null),
		}

		const r = new Navgo(
			[
				['/a', {}],
				['/b', {}],
				['/c', {}],
			],
			{ base: '/app' },
		)
		await r.init() // idx 0 (/a)

		await r.goto('/app/b') // idx 1
		pane.scrollTop = 123
		global.dispatchEvent({ type: 'scroll', target: pane })
		await new Promise(r => setTimeout(r, 120))

		// go back to idx 0
		global.location = new URL('http://example.com/app/a')
		let ev = new Event('popstate')
		ev.state = { __navgo: { idx: 0 } }
		global.dispatchEvent(ev)
		await tick(3)

		// new navigation diverges and creates a new idx 1 (should NOT reuse old scroll snapshot)
		await r.goto('/app/c')

		// back then forward to idx 1
		global.location = new URL('http://example.com/app/a')
		ev = new Event('popstate')
		ev.state = { __navgo: { idx: 0 } }
		global.dispatchEvent(ev)
		await tick(3)

		pane.scrollTop = 0
		global.location = new URL('http://example.com/app/c')
		ev = new Event('popstate')
		ev.state = { __navgo: { idx: 1 } }
		global.dispatchEvent(ev)
		await tick(3)

		// without clearing forward snapshots, this would restore 123 from the old /b entry
		expect(pane.scrollTop).toBe(0)
		r.destroy()
		global.document = prev_doc
	})

	it('hash-only back restores previous window scroll position', async () => {
		const hist = setupStubs('/app/posts')
		const r = new Navgo([['/posts', {}]], { base: '/app' })
		await r.init()

		// simulate user scroll on no-hash entry
		global.scrollTo(0, 333)
		// router listens to window scroll (capture)
		global.dispatchEvent({ type: 'scroll', target: global.window })

		// click a relative same-path hash link
		let prevented = false
		const anchor = {
			host: 'example.com',
			getAttribute: name => (name === 'href' ? '#post-1' : null),
			pathname: '/app/posts',
			closest: () => anchor,
		}
		const click = {
			type: 'click',
			button: 0,
			defaultPrevented: false,
			preventDefault() {
				prevented = true
			},
			target: anchor,
			composedPath: () => [anchor],
		}
		global.dispatchEvent(click)
		// browser default: update URL then fire hashchange
		global.location = new URL('http://example.com/app/posts#post-1')
		global.dispatchEvent(new Event('hashchange'))
		await tick()
		expect(prevented).toBe(false)

		// user presses Back: browser sets state for previous entry and fires hashchange
		hist.state = { __navgo: { idx: 0 } }
		global.location = new URL('http://example.com/app/posts')
		global.dispatchEvent(new Event('hashchange'))
		await tick()
		expect(global.scrollY).toBe(333)
		r.destroy()
	})

	it('hash-only back re-applies top when browser scrolls late', async () => {
		const hist = setupStubs('/app/posts')
		const r = new Navgo([['/posts', {}]], { base: '/app' })
		await r.init()

		let prevented = false
		const anchor = {
			host: 'example.com',
			getAttribute: name => (name === 'href' ? '#post-1' : null),
			pathname: '/app/posts',
			closest: () => anchor,
		}
		const click = {
			type: 'click',
			button: 0,
			defaultPrevented: false,
			preventDefault() {
				prevented = true
			},
			target: anchor,
			composedPath: () => [anchor],
		}
		global.dispatchEvent(click)
		global.location = new URL('http://example.com/app/posts#post-1')
		global.dispatchEvent(new Event('hashchange'))
		await tick()
		expect(prevented).toBe(false)

		hist.state = { __navgo: { idx: 0 } }
		global.location = new URL('http://example.com/app/posts')
		let ev = new Event('popstate')
		ev.state = hist.state
		global.dispatchEvent(ev)
		global.dispatchEvent(new Event('hashchange'))
		global.scrollTo(0, 222)
		await tick(2)
		expect(global.scrollY).toBe(0)
		r.destroy()
	})

	it('hash-only back ignores a pending hash click that never settled', async () => {
		const hist = setupStubs('/app/posts')
		const r = new Navgo([['/posts', {}]], { base: '/app' })
		await r.init()

		const anchor = {
			host: 'example.com',
			getAttribute: name => (name === 'href' ? '#post-1' : null),
			pathname: '/app/posts',
			closest: () => anchor,
		}
		const click = {
			type: 'click',
			button: 0,
			defaultPrevented: false,
			preventDefault() {},
			target: anchor,
			composedPath: () => [anchor],
		}
		global.dispatchEvent(click)

		hist.state = { __navgo: { idx: 1 } }
		global.location = new URL('http://example.com/app/posts')
		global.dispatchEvent(new Event('hashchange'))
		await tick(2)
		expect(global.scrollY).toBe(0)
		r.destroy()
	})
})

describe('leave (beforeunload)', () => {
	it('cancels leave by setting returnValue and preventing default', async () => {
		setupStubs('/app/leave')
		let called = 0
		const r = new Navgo(
			[
				[
					'/leave',
					{
						before_route_leave(nav) {
							called++
							if (nav.type === 'leave') nav.cancel()
						},
					},
				],
			],
			{ base: '/app' },
		)
		await r.init()

		const ev = {
			type: 'beforeunload',
			prevented: false,
			preventDefault() {
				this.prevented = true
			},
		}
		global.dispatchEvent(ev)
		expect(called > 0).toBe(true)
		expect(ev.prevented).toBe(true)
		expect(ev.returnValue).toBe('')
		r.destroy()
	})
})

describe('link interception', () => {
	it('intercepts internal anchor clicks and calls nav', async () => {
		const hist = setupStubs('/app/')
		const r = new Navgo(
			[
				['/', {}],
				['/foo', {}],
			],
			{ base: '/app' },
		)
		await r.init()

		let prevented = false
		const anchor = {
			host: 'example.com',
			getAttribute: name => (name === 'href' ? '/app/foo' : null),
			pathname: '/app/foo',
			closest: () => anchor,
		}
		const click = {
			type: 'click',
			button: 0,
			defaultPrevented: false,
			preventDefault() {
				prevented = true
			},
			target: anchor,
			composedPath: () => [anchor],
		}
		global.dispatchEvent(click)
		await tick()
		expect(prevented).toBe(true)
		// initial goto() leaves idx at 0; clicking link pushes to 1
		expect(hist.state?.__navgo?.idx ?? 0).toBe(1)
		r.destroy()
	})

	it('ignores clicks with modifier keys', async () => {
		const hist = setupStubs('/app/')
		const r = new Navgo(
			[
				['/', {}],
				['/foo', {}],
			],
			{ base: '/app' },
		)
		await r.init()

		const anchor = {
			host: 'example.com',
			getAttribute: name => (name === 'href' ? '/app/foo' : null),
			closest: () => anchor,
		}
		const click = {
			type: 'click',
			button: 0,
			metaKey: true,
			defaultPrevented: false,
			preventDefault() {},
			target: anchor,
			composedPath: () => [anchor],
		}
		global.dispatchEvent(click)
		// modifier click is ignored; idx remains at 0
		expect(hist.state?.__navgo?.idx ?? 0).toBe(0)
		r.destroy()
	})

	it('skips absolute same-host links outside base', async () => {
		const hist = setupStubs('/app/')
		const r = new Navgo(
			[
				['/', {}],
				['/foo', {}],
			],
			{ base: '/app' },
		)
		await r.init()

		let prevented = false
		const anchor = {
			host: 'example.com',
			getAttribute: name => (name === 'href' ? 'http://example.com/outside' : null),
			pathname: '/outside',
			closest: () => anchor,
		}
		const click = {
			type: 'click',
			button: 0,
			defaultPrevented: false,
			preventDefault() {
				prevented = true
			},
			target: anchor,
			composedPath: () => [anchor],
		}
		global.dispatchEvent(click)
		await tick()
		// outside base: not intercepted
		expect(prevented).toBe(false)
		expect(hist.state?.__navgo?.idx ?? 0).toBe(0)
		r.destroy()
	})

	it('intercepts absolute same-host links within base', async () => {
		const hist = setupStubs('/app/')
		const r = new Navgo(
			[
				['/', {}],
				['/foo', {}],
			],
			{ base: '/app' },
		)
		await r.init()

		let prevented = false
		const anchor = {
			host: 'example.com',
			getAttribute: name => (name === 'href' ? 'http://example.com/app/foo' : null),
			pathname: '/app/foo',
			closest: () => anchor,
		}
		const click = {
			type: 'click',
			button: 0,
			defaultPrevented: false,
			preventDefault() {
				prevented = true
			},
			target: anchor,
			composedPath: () => [anchor],
		}
		global.dispatchEvent(click)
		await tick()
		expect(prevented).toBe(true)
		expect(hist.state?.__navgo?.idx ?? 0).toBe(1)
		r.destroy()
	})

	it('absolute same-path hash link within base lets browser handle + bumps idx', async () => {
		const hist = setupStubs('/app/about')
		const r = new Navgo([['/about', {}]], { base: '/app' })
		await r.init()

		let prevented = false
		const anchor = {
			host: 'example.com',
			getAttribute: name => (name === 'href' ? 'http://example.com/app/about#bottom' : null),
			pathname: '/app/about',
			closest: () => anchor,
		}
		const click = {
			type: 'click',
			button: 0,
			defaultPrevented: false,
			preventDefault() {
				prevented = true
			},
			target: anchor,
			composedPath: () => [anchor],
		}
		global.dispatchEvent(click)
		// simulate browser default hashchange
		global.location = new URL('http://example.com/app/about#bottom')
		global.dispatchEvent(new Event('hashchange'))
		await tick()
		// absolute same-path + hash: browser handles (no preventDefault), router bumps idx on hashchange
		expect(prevented).toBe(false)
		expect(hist.state?.__navgo?.idx ?? 0).toBe(1)
		r.destroy()
	})

	it('absolute same-path same-hash prevents default and does not bump idx', async () => {
		const hist = setupStubs('/app/about#bottom')
		const r = new Navgo([['/about', {}]], { base: '/app' })
		await r.init()

		let prevented = false
		const anchor = {
			host: 'example.com',
			getAttribute: name => (name === 'href' ? 'http://example.com/app/about#bottom' : null),
			pathname: '/app/about',
			closest: () => anchor,
		}
		const click = {
			type: 'click',
			button: 0,
			defaultPrevented: false,
			preventDefault() {
				prevented = true
			},
			target: anchor,
			composedPath: () => [anchor],
		}
		global.dispatchEvent(click)
		await tick()
		// same-hash: router handles via preventDefault and does not change history
		expect(prevented).toBe(true)
		expect(hist.state?.__navgo?.idx ?? 0).toBe(0)
		r.destroy()
	})

	it('relative same-path hash (#...) should bump idx', async () => {
		const hist = setupStubs('/app/about')
		const r = new Navgo([['/about', {}]], { base: '/app' })
		await r.init()

		let prevented = false
		const anchor = {
			host: 'example.com',
			getAttribute: name => (name === 'href' ? '#bottom' : null),
			pathname: '/app/about',
			closest: () => anchor,
		}
		const click = {
			type: 'click',
			button: 0,
			defaultPrevented: false,
			preventDefault() {
				prevented = true
			},
			target: anchor,
			composedPath: () => [anchor],
		}
		global.dispatchEvent(click)
		// simulate browser behavior
		global.location = new URL('http://example.com/app/about#bottom')
		global.dispatchEvent(new Event('hashchange'))
		await tick()
		expect(prevented).toBe(false)
		expect(hist.state?.__navgo?.idx ?? 0).toBe(1)
		r.destroy()
	})
})
