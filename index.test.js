import { describe, it, expect } from 'vitest'
import Navaid from './src/index.js'

global.history = {}

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

	it('goto; cancel prevents push', async () => {
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
		r.listen()
		await r.run()
		await r.goto('/app/test')
		expect(called > 0).toBe(true)
		expect(hist.state?.__navaid?.idx).toBe(0)
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
		r.listen()
		// ensure initial run completes so current route is set
		await r.run()
		// simulate an in-app shallow push to idx 1
		r.pushState('/app/foo')
		// pop back to idx 0
		const ev = new Event('popstate')
		ev.state = { __navaid: { idx: 0 } }
		global.dispatchEvent(ev)
		expect(called > 0).toBe(true)
		expect(hist._went).toBe(1)
		r.unlisten()
	})
})
