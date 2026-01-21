import { describe, it, expect } from 'vitest'
console.debug = () => {}
import Navgo from './index.js'

global.history = {}

// Shared test stubs for browser-ish globals
function setupStubs(base = '/') {
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
		state: null,
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

	it('params validators run before coercers; validate sees coerced params', async () => {
		const r1 = [
			'users/:id',
			{
				param_rules: {
					id: { validator: v => typeof v === 'string', coercer: v => Number(v) },
				},
				validate: p => typeof p.id === 'number' && p.id > 5,
			},
		]
		const r2 = ['users/:id', {}]
		const ctx = new Navgo([r1, r2])

		const a = await ctx.match('/users/6')
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
			{ param_rules: { id: v => typeof v === 'string' && /^\d+$/.test(v) } },
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
})

// ---

describe('layouts and shared loaders', () => {
	it('match returns ordered matches for nested groups', async () => {
		const ctx = new Navgo([
			{
				layout: { default: 'L1' },
				routes: [
					['/', {}],
					{
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
		expect(res.matches[0].layout?.default).toBe('L1')
		expect(res.matches[1].layout?.default).toBe('L2')
		expect(res.matches[2].type).toBe('route')
		expect(res.matches[2].route?.[0]).toBe('/foo')
	})

	it('runs layout loaders and forwards data into nav.to.matches', async () => {
		setupStubs('/app/')
		const calls = []
		const navs = []
		const r = new Navgo(
			[
				{
					layout: { default: 'Root' },
					async loader() {
						calls.push('root')
						return { root: true }
					},
					routes: [
						['/', {}],
						{
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
		// leaf convenience stays on nav.to.data
		expect(navs.at(-1)?.to?.data).toEqual({ page: true })
		r.destroy()
	})

	it('preload runs full loader chain and goto uses it', async () => {
		setupStubs('/app/')
		const calls = { root: 0, page: 0 }
		const r = new Navgo(
			[
				{
					async loader() {
						calls.root++
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
		r.destroy()
	})
})

describe('load plan caching', () => {
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

describe('scroll restore persistence', () => {
	it('stores position on beforeunload and restores on next run', async () => {
		// const hist = setupStubs('/app/foo')
		const r1 = new Navgo([['/foo', {}]], { base: '/app' })
		await r1.init()
		// move scroll
		global.scrollTo(10, 200)
		// trigger beforeunload
		const ev = { type: 'beforeunload', preventDefault() {}, returnValue: undefined }
		global.dispatchEvent(ev)
		const key = `__navgo_scroll:${global.location.href}`
		expect(global.sessionStorage.getItem(key)).toBeTruthy()
		r1.destroy()

		// new router instance simulating a refresh
		const r2 = new Navgo([['/foo', {}]], { base: '/app' })
		await r2.init()
		expect(global.scrollX).toBe(10)
		expect(global.scrollY).toBe(200)
		r2.destroy()
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
	it('awaits tick between after_navigate and scroll', async () => {
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
		await r.goto('/app/foo')
		await tick(2)
		expect(events.includes('after')).toBe(true)
		expect(events.includes('tick')).toBe(true)
		expect(events.includes('scroll')).toBe(true)
		// ordering: after -> tick -> scroll
		expect(events.indexOf('after') < events.indexOf('tick')).toBe(true)
		expect(events.indexOf('tick') < events.indexOf('scroll')).toBe(true)
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
		// popstate back to idx 1
		global.location = new URL('http://example.com/app/foo')
		const ev = new Event('popstate')
		ev.state = { __navgo: { idx: 1 } }
		global.dispatchEvent(ev)
		await tick(2)
		expect(pane.scrollTop).toBe(123)
		r.destroy()
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
