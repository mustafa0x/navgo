import { describe, it, expect } from 'vitest'
console.debug = () => {}
import Navaid from './index.js'

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
		expect(typeof Navaid).toBe('function')
	})

	it('new Navaid()', () => {
		let foo = new Navaid()
		expect(typeof foo.format).toBe('function')
		expect(typeof foo.listen).toBe('function')
	})
})

// ---

describe('$.format', () => {
	it('empty base', () => {
		let foo = new Navaid()
		expect(foo.format('')).toBe('')
		expect(foo.format('/')).toBe('/')
		expect(foo.format('foo/bar/')).toBe('/foo/bar')
		expect(foo.format('foo/bar')).toBe('/foo/bar')
		expect(foo.format('/foobar')).toBe('/foobar')
		expect(foo.format('foobar')).toBe('/foobar')
	})

	it('base with leading slash', () => {
		let bar = new Navaid([], { base: '/hello' })
		expect(bar.format('/hello/world')).toBe('/world')
		expect(bar.format('hello/world')).toBe('/world')
		expect(bar.format('/world')).toBe(false)
		expect(bar.format('/hello/')).toBe('/')
		expect(bar.format('hello/')).toBe('/')
		expect(bar.format('/hello')).toBe('/')
		expect(bar.format('hello')).toBe('/')
	})

	it('base without leading slash', () => {
		let baz = new Navaid([], { base: 'hello' })
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
		let bat = new Navaid([], { base: 'hello/' })
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
		let quz = new Navaid([], { base: '/hello/' })
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
		let qut = new Navaid([], { base: '/' })
		expect(qut.format('/hello/world')).toBe('/hello/world')
		expect(qut.format('hello/world')).toBe('/hello/world')
		expect(qut.format('/world')).toBe('/world')
		expect(qut.format('/')).toBe('/')
	})

	it('base with nested path', () => {
		let qar = new Navaid([], { base: '/hello/there' })
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
		const ctx = new Navaid([
			['/', {}],
			['users/:name', {}],
		])
		const res = await ctx.match('/nope')
		expect(res).toBe(null)
	})

	it('string patterns with named params', async () => {
		const ctx = new Navaid([
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
		const ctx = new Navaid([r1, r2])
		const res = await ctx.match('/users/3')
		if (!res) throw new Error('expected a match')
		// should skip r1 because validate returned false, and match r2
		if (res.route !== r2) throw new Error('validate(false) did not skip the route')
	})

	it('wildcard captures as "*"', async () => {
		const ctx = new Navaid([['foo/bar/*', {}]])
		let res = await ctx.match('/foo/bar/baz/bat')
		expect(!!res).toBe(true)
		expect(res.route[0]).toBe('foo/bar/*')
		expect(res.params).toEqual({ ['*']: 'baz/bat' })
	})

	it('RegExp routes with named groups', async () => {
		const ctx = new Navaid([[/^\/articles\/(?<year>[0-9]{4})$/, {}]])
		let res = await ctx.match('/articles/2024')
		expect(!!res).toBe(true)
		expect(res.route[0] instanceof RegExp).toBe(true)
		expect(res.params).toEqual({ year: '2024' })
	})

	it('RegExp alternation without named groups', async () => {
		const ctx = new Navaid([[/about\/(contact|team)/, {}]])
		let a = await ctx.match('/about/contact')
		let b = await ctx.match('/about/team')
		expect(!!(a && b)).toBe(true)
		expect(Object.keys(a.params).length).toBe(0)
	})

	it('use with base via $.format', async () => {
		const ctx = new Navaid(
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
		const ctx = new Navaid([r1, r2])
		const res = await ctx.match('/users/3')
		if (!res) throw new Error('expected a match')
		if (res.route !== r2) throw new Error('async validate(false) did not skip the route')
	})
})

describe('beforeRouteLeave', () => {
	it('nav; cancel prevents push', async () => {
		const hist = setupStubs('/app/')
		let called = 0
		const r = new Navaid(
			[
				[
					'/',
					{
						// leave-only semantics: cancel when leaving '/'
						beforeRouteLeave(nav) {
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
		await r.listen()
		await r.nav('/app/test')
		expect(called > 0).toBe(true)
		// initial nav() does not push/replace; idx remains 0
		// cancellation should not change idx further
		expect(hist.state?.__navaid?.idx ?? 0).toBe(0)
	})

	it('popstate; cancel reverts with history.go', async () => {
		const hist = setupStubs('/app/')
		let called = 0
		const r = new Navaid(
			[
				[
					'/',
					{
						beforeRouteLeave(nav) {
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
		await r.listen()
		// simulate an in-app shallow push to idx 2 (idx 1 was initial goto)
		r.pushState('/app/foo')
		// pop back to idx 0
		const ev = new Event('popstate')
		ev.state = { __navaid: { idx: 0 } }
		global.dispatchEvent(ev)
		expect(called > 0).toBe(true)
		// We shallow-pushed once after initial goto (idx 1 total); cancelling popstate to 0 requires history.go(1)
		expect(hist._went).toBe(1)
		r.unlisten()
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
		const router = new Navaid(routes, {
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
		await router.listen()

		await router.preload('/app/')
		// initial nav() ran root loader once; preloading current route should not add more
		expect(calls.root).toBe(1)

		const p1 = router.preload('/app/foo')
		const p2 = router.preload('/app/foo')
		await Promise.all([p1, p2])
		expect(calls.foo).toBe(1)

		await router.nav('/app/foo')
		expect(calls.foo).toBe(1)
		// afterNavigate received completion nav for goto (type remains 'goto')
		expect(navs.at(-1)?.type).toBe('goto')
		router.unlisten()
	})
})

describe('scroll restore persistence', () => {
	it('stores position on beforeunload and restores on next run', async () => {
		// const hist = setupStubs('/app/foo')
		const r1 = new Navaid([['/foo', {}]], { base: '/app' })
		await r1.listen()
		// move scroll
		global.scrollTo(10, 200)
		// trigger beforeunload
		const ev = { type: 'beforeunload', preventDefault() {}, returnValue: undefined }
		global.dispatchEvent(ev)
		const key = `__navaid_scroll:${global.location.href}`
		expect(global.sessionStorage.getItem(key)).toBeTruthy()
		r1.unlisten()

		// new router instance simulating a refresh
		const r2 = new Navaid([['/foo', {}]], { base: '/app' })
		await r2.listen()
		expect(global.scrollX).toBe(10)
		expect(global.scrollY).toBe(200)
		r2.unlisten()
	})
})

describe('leave (beforeunload)', () => {
	it('cancels leave by setting returnValue and preventing default', async () => {
		setupStubs('/app/leave')
		let called = 0
		const r = new Navaid(
			[
				[
					'/leave',
					{
						beforeRouteLeave(nav) {
							called++
							if (nav.type === 'leave') nav.cancel()
						},
					},
				],
			],
			{ base: '/app' },
		)
		await r.listen()

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
		r.unlisten()
	})
})

describe('link interception', () => {
	it('intercepts internal anchor clicks and calls nav', async () => {
		const hist = setupStubs('/app/')
		const r = new Navaid(
			[
				['/', {}],
				['/foo', {}],
			],
			{ base: '/app' },
		)
		await r.listen()

		let prevented = false
		const anchor = {
			host: 'example.com',
			getAttribute: name => (name === 'href' ? '/app/foo' : null),
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
		// initial nav() leaves idx at 0; clicking link pushes to 1
		expect(hist.state?.__navaid?.idx ?? 0).toBe(1)
		r.unlisten()
	})

	it('ignores clicks with modifier keys', async () => {
		const hist = setupStubs('/app/')
		const r = new Navaid(
			[
				['/', {}],
				['/foo', {}],
			],
			{ base: '/app' },
		)
		await r.listen()

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
		expect(hist.state?.__navaid?.idx ?? 0).toBe(0)
		r.unlisten()
	})
})
