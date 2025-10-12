import { describe, it, expect } from 'vitest'
console.debug = () => {}
import Navgo from './index.js'

global.history = {}

// Shared test stubs for browser-ish globals
function setupStubs(base = '/') {
	const listeners = new Map()
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

describe('exports', () => {
	it('exports', () => {
		expect(typeof Navgo).toBe('function')
	})

	it('new Navgo()', () => {
		let foo = new Navgo()
		expect(typeof foo.format).toBe('function')
		expect(typeof foo.init).toBe('function')
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
	function makeRouterWithLoaders() {
		const calls = { root: 0, foo: 0 }
		const routes = [
			[
				'/',
				{
					loaders() {
						calls.root++
						return { route: 'root' }
					},
				},
			],
			[
				'/foo',
				{
					loaders() {
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
		const { router, calls, navs } = makeRouterWithLoaders()
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
						loaders: p => {
							calls.set(p.id, (calls.get(p.id) || 0) + 1)
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

	it('hash-only popstate updates url without loaders', async () => {
		setupStubs('/app/foo#top')
		const prev_doc = global.document
		global.document = {
			getElementById: () => null,
			querySelector: () => null,
		}
		let load_calls = 0
		let changed = 0
		const r = new Navgo(
			[
				[
					'/foo',
					{
						loaders() {
							load_calls++
							return { ok: true }
						},
					},
				],
			],
			{
				base: '/app',
				url_changed() {
					changed++
				},
			},
		)
		await r.init()
		expect(load_calls).toBe(1)
		// simulate hash-only change on same path
		global.location = new URL('http://example.com/app/foo#bar')
		const ev = new Event('popstate')
		ev.state = { __navgo: { idx: 0 } }
		global.dispatchEvent(ev)
		// loaders should not run, but url_changed should fire
		expect(load_calls).toBe(1)
		expect(changed).toBeGreaterThan(0)
		r.destroy()
		global.document = prev_doc
	})

	it('rapid shallow back/forward zig-zag triggers url_changed without loaders', async () => {
		setupStubs('/app/')
		let changed = 0
		let loads = 0
		const r = new Navgo(
			[
				[
					'/foo',
					{
						loaders() {
							loads++
						},
					},
				],
				[
					'/bar',
					{
						loaders() {
							loads++
						},
					},
				],
			],
			{
				base: '/app',
				url_changed() {
					changed++
				},
			},
		)
		await r.init()
		// add three shallow entries
		r.push_state('/app/foo') // idx 1
		r.push_state('/app/bar') // idx 2
		r.push_state('/app/foo') // idx 3
		// zig-zag between 1 and 2 repeatedly via popstate
		for (const idx of [2, 1, 2, 1, 2, 1, 2, 1]) {
			const ev = new Event('popstate')
			ev.state = { __navgo: { idx, shallow: true } }
			global.dispatchEvent(ev)
		}
		// no loaders should have executed (all shallow)
		expect(loads).toBe(0)
		// url_changed fired for each popstate
		expect(changed).toBeGreaterThanOrEqual(8)
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
		await new Promise(r => setTimeout(r, 0))
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
		await new Promise(r => setTimeout(r, 0))
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
		await new Promise(r => setTimeout(r, 0))
		expect(prevented).toBe(true)
		expect(hist.state?.__navgo?.idx ?? 0).toBe(1)
		r.destroy()
	})
})
