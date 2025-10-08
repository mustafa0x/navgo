import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import Navaid from '../../src/index.js'

global.history = {}

const API = suite('exports')

API('exports', () => {
	assert.type(Navaid, 'function', 'exports a class (constructor)')
})

API('new Navaid()', () => {
	let foo = new Navaid()
	assert.type(foo.format, 'function')
	assert.type(foo.listen, 'function')
})

// removed old function-call API test

API.run()

// ---

const format = suite('$.format')

format('empty base', () => {
	let foo = new Navaid()
	assert.is(foo.format(''), '')
	assert.is(foo.format('/'), '/')
	assert.is(foo.format('foo/bar/'), '/foo/bar')
	assert.is(foo.format('foo/bar'), '/foo/bar')
	assert.is(foo.format('/foobar'), '/foobar')
	assert.is(foo.format('foobar'), '/foobar')
})

format('base with leading slash', () => {
	let bar = new Navaid([], { base: '/hello' })
	assert.is(bar.format('/hello/world'), '/world')
	assert.is(bar.format('hello/world'), '/world')
	assert.is(bar.format('/world'), false)
	assert.is(bar.format('/hello/'), '/')
	assert.is(bar.format('hello/'), '/')
	assert.is(bar.format('/hello'), '/')
	assert.is(bar.format('hello'), '/')
})

format('base without leading slash', () => {
	let baz = new Navaid([], { base: 'hello' })
	assert.is(baz.format('/hello/world'), '/world')
	assert.is(baz.format('hello/world'), '/world')
	assert.is(baz.format('/hello.123'), false)
	assert.is(baz.format('/world'), false)
	assert.is(baz.format('/hello/'), '/')
	assert.is(baz.format('hello/'), '/')
	assert.is(baz.format('/hello'), '/')
	assert.is(baz.format('hello'), '/')
})

format('base with trailing slash', () => {
	let bat = new Navaid([], { base: 'hello/' })
	assert.is(bat.format('/hello/world'), '/world')
	assert.is(bat.format('hello/world'), '/world')
	assert.is(bat.format('/hello.123'), false)
	assert.is(bat.format('/world'), false)
	assert.is(bat.format('/hello/'), '/')
	assert.is(bat.format('hello/'), '/')
	assert.is(bat.format('/hello'), '/')
	assert.is(bat.format('hello'), '/')
})

format('base with leading and trailing slash', () => {
	let quz = new Navaid([], { base: '/hello/' })
	assert.is(quz.format('/hello/world'), '/world')
	assert.is(quz.format('hello/world'), '/world')
	assert.is(quz.format('/hello.123'), false)
	assert.is(quz.format('/world'), false)
	assert.is(quz.format('/hello/'), '/')
	assert.is(quz.format('hello/'), '/')
	assert.is(quz.format('/hello'), '/')
	assert.is(quz.format('hello'), '/')
})

format('base = "/" only', () => {
	let qut = new Navaid([], { base: '/' })
	assert.is(qut.format('/hello/world'), '/hello/world')
	assert.is(qut.format('hello/world'), '/hello/world')
	assert.is(qut.format('/world'), '/world')
	assert.is(qut.format('/'), '/')
})

format('base with nested path', () => {
	let qar = new Navaid([], { base: '/hello/there' })
	assert.is(qar.format('hello/there/world/'), '/world')
	assert.is(qar.format('/hello/there/world/'), '/world')
	assert.is(qar.format('/hello/there/world?foo=bar'), '/world?foo=bar')
	assert.is(qar.format('/hello/there'), '/')
	assert.is(qar.format('hello/there'), '/')
	assert.is(qar.format('/world'), false)
	assert.is(qar.format('/'), false)
})

format.run()

// ---

const match = suite('$.match')

match('returns null when no route matches', async () => {
	const ctx = new Navaid([
		['/', {}],
		['users/:name', {}],
	])
	const res = await ctx.match('/nope')
	assert.is(res, null)
})

match('string patterns with named params', async () => {
	const ctx = new Navaid([
		['users/:name', {}],
		['/foo/books/:genre/:title?', {}],
	])

	let r1 = await ctx.match('/users/Bob')
	assert.ok(r1, 'matched users route')
	assert.is(r1.route[0], 'users/:name')
	assert.equal(r1.params, { name: 'Bob' })

	let r2 = await ctx.match('/foo/books/kids/narnia')
	assert.ok(r2, 'matched books route')
	assert.is(r2.route[0], '/foo/books/:genre/:title?')
	assert.equal(r2.params, { genre: 'kids', title: 'narnia' })
})

match('custom validate hook skips a route when false', async () => {
	const r1 = ['users/:id', { validate: p => Number(p.id) > 5 }]
	const r2 = ['users/:id', {}]
	const ctx = new Navaid([r1, r2])
	const res = await ctx.match('/users/3')
	if (!res) throw new Error('expected a match')
	// should skip r1 because validate returned false, and match r2
	if (res.route !== r2) throw new Error('validate(false) did not skip the route')
})

match('wildcard captures as "*"', async () => {
	const ctx = new Navaid([['foo/bar/*', {}]])
	let res = await ctx.match('/foo/bar/baz/bat')
	assert.ok(res, 'matched wildcard route')
	assert.is(res.route[0], 'foo/bar/*')
	assert.equal(res.params, { ['*']: 'baz/bat' })
})

match('RegExp routes with named groups', async () => {
	const ctx = new Navaid([[/^\/articles\/(?<year>[0-9]{4})$/, {}]])
	let res = await ctx.match('/articles/2024')
	assert.ok(res, 'matched regex route')
	assert.ok(res.route[0] instanceof RegExp, 'route source is RegExp')
	assert.equal(res.params, { year: '2024' })
})

match('RegExp alternation without named groups', async () => {
	const ctx = new Navaid([[/about\/(contact|team)/, {}]])
	let a = await ctx.match('/about/contact')
	let b = await ctx.match('/about/team')
	assert.ok(a && b, 'matched both alternation variants')
	assert.is(Object.keys(a.params).length, 0, 'no params for unnamed groups')
})

match('use with base via $.format', async () => {
	const ctx = new Navaid(
		[
			['/', {}],
			['users/:name', {}],
		],
		{ base: '/hello/world' },
	)

	let formatted = ctx.format('/hello/world/users/Ada')
	assert.is(formatted, '/users/Ada')
	let res = await ctx.match(formatted)
	assert.ok(res, 'matched after formatting')
	assert.equal(res.params, { name: 'Ada' })
})

match('async validate is awaited', async () => {
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

match.run()

const nav = suite('beforeRouteLeave')

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

nav('goto; cancel prevents push', async () => {
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
	assert.is(called > 0, true, 'beforeRouteLeave called')
	assert.is(hist.state?.__navaid?.idx, 0, 'history index unchanged when cancelled')
})

nav('popstate; cancel reverts with history.go', async () => {
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
	assert.is(called > 0, true, 'beforeRouteLeave called on popstate')
	assert.is(hist._went, 1, 'history.go called to revert popstate')
	r.unlisten()
})

nav.run()
