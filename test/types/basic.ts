/// <reference path="../../index.d.ts" />

// Type-level smoke tests for the public API using the new class-based signature.
// These are compile-only tests; they should typecheck without emitting JS.

import Navgo, { type RouteTuple, type Options, type Params, type MatchResult } from 'navgo'
import type { Writable } from 'svelte/store'

// Custom route metadata type for generics flow
type Meta = {
	param_validators?: Record<string, (value: string | null | undefined) => boolean>
	loader?: (
		ctx: import('navgo').LoaderContext,
	) => import('navgo').LoaderPlan | Promise<import('navgo').LoaderPlan>
}

const routes: Array<RouteTuple<Meta>> = [
	['/', {}],
	['users/:id', { param_validators: { id: Navgo.validators.int({ min: 1 }) } }],
	[/^\/posts\/(?<slug>[^/]+)$/, {}],
]

const opts: Options = {
	base: '/app',
	preload_delay: 10,
	preload_on_hover: true,
	before_navigate(nav) {
		const t: 'link' | 'goto' | 'popstate' | 'leave' = nav.type
	},
	after_navigate(nav) {
		const to = nav.to!
		const u: string = to.url.pathname
		const m: RouteTuple<Meta> = to.route as RouteTuple<Meta>
		const p: Params = to.params
		const d: unknown = to.data
	},
	url_changed(cur) {
		const u: URL = cur.url
		const m: RouteTuple<Meta> | null = cur.route
		const p: Params = cur.params
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
expectsPromise(router.preload('/users/1'))

// Shallow history helpers
router.push_state('/app/foo', { x: 1 })
router.replace_state('/app/foo', { x: 1 })

// Static validator helpers
const is_color = Navgo.validators.one_of(['red', 'green'])
const ok: boolean = is_color('red')

// route store typing checks
type RouteState = { url: URL; route: RouteTuple<Meta> | null; params: Params }
const route_store: Writable<RouteState> = router.route
route_store.subscribe(() => {})
route_store.set({ url: new URL('http://example.com/app'), route: routes[0], params: {} })

// is_navigating typing checks
const nav_store: Writable<boolean> = router.is_navigating
nav_store.set(true)
