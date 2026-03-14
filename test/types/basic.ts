/// <reference path="../../index.d.ts" />

// Type-level smoke tests for the public API using the new class-based signature.
// These are compile-only tests; they should typecheck without emitting JS.

import Navgo, {
	v,
	type RouteTuple,
	type Options,
	type Params,
	type Match,
	type MatchResult,
	type LayoutsMap,
	type ParamRule,
	type SearchParams,
	type SearchParamsStore,
	type LoaderContext,
	type LoadPlan,
} from 'navgo'
import type { Writable } from 'svelte/store'

// Custom route metadata type for generics flow
type Meta = {
	param_rules?: Record<string, ParamRule>
	loader?: (ctx: LoaderContext) => LoadPlan | Promise<unknown>
}

// LoadPlan typing checks
const plan: LoadPlan = {
	products: 'https://dummyjson.com/products',
	user: {
		request: 'https://dummyjson.com/users/1',
		cache: { strategy: 'cache-first', ttl: 1000 },
	},
}

const routes: Array<RouteTuple<Meta>> = [
	['/', {}],
	['users/:id', { param_rules: { id: v.pipe(v.string(), v.toNumber(), v.minValue(1)) } }],
	[/^\/posts\/(?<slug>[^/]+)$/, {}],
]

const opts: Options = {
	base: '/app',
	rewrite: {
		input({ url, current }) {
			const p: string = url.pathname
			const c: unknown = current?.context
			return { url, context: c }
		},
		output({ url, context }) {
			const c: unknown = context
			return { url, context: c }
		},
	},
	preload_delay: 10,
	preload_on_hover: true,
	before_navigate(nav) {
		const t: 'link' | 'goto' | 'popstate' | 'leave' = nav.type
	},
	after_navigate(nav) {
		const to = nav.to!
		const u: string = to.url.pathname
		const i: string = to.internal_url.pathname
		const pth: string = to.path
		const m: RouteTuple<Meta> = to.route as RouteTuple<Meta>
		const p: Params = to.params
		const d: unknown = to.data
	},
}

// New class-based constructor
const router = new Navgo<Meta>(routes, opts)

// API surface checks
const f1: string | false = router.format('/app/users/1')
const f2: string | false = router.format('users/1')

const m1p: Promise<MatchResult<Meta> | null> = router.match('/users/42')

router.init()
router.destroy?.()

// Async-returning methods
declare function expectsPromise<T>(p: Promise<T>): void
expectsPromise(router.goto('/users/1'))
expectsPromise(router.goto('/users/1', { literal: true, context: { locale: 'en' } }))
expectsPromise(router.preload('/users/1'))
expectsPromise(router.preload('/users/1', { literal: true, context: { locale: 'en' } }))
const h1: string | false = router.href('/users/1')
const h2: string | false = router.href('/users/1', { absolute: true, context: { locale: 'en' } })

// Shallow history helpers
router.push_state('/app/foo', { x: 1 })
router.replace_state('/app/foo', { x: 1 })
router.invalidate(['https://dummyjson.com/products', 'products'])

// valibot re-export
const id_schema = v.pipe(v.string(), v.toNumber())
const id_ok: boolean = v.safeParse(id_schema, '123').success

// route store typing checks
type RouteState = {
	url: URL
	route: RouteTuple<Meta> | null
	params: Params
	matches: Match<Meta>[]
	layouts: LayoutsMap<Meta>
	search_params: SearchParams
	internal_url: URL
	path: string
	context?: unknown
}
const route_store: Writable<RouteState> = router.route
route_store.subscribe(() => {})
route_store.set({
	url: new URL('http://example.com/app'),
	internal_url: new URL('http://example.com/'),
	path: '/',
	context: { locale: 'en' },
	route: routes[0],
	params: {},
	matches: [],
	layouts: {},
	search_params: {},
})

const sp_store: SearchParamsStore = router.search_params
const search_string: string = sp_store.toString()
sp_store.subscribe(sp => {
	const maybe_string: unknown = sp.toString
	return maybe_string
})

// is_navigating typing checks
const nav_store: Writable<boolean> = router.is_navigating
nav_store.set(true)
