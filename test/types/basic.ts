/// <reference path="../../index.d.ts" />

// Type-level smoke tests for the public API using the new class-based signature.
// These are compile-only tests; they should typecheck without emitting JS.

import Navaid, { type RouteTuple, type Options, type Params, type MatchResult } from 'navaid'

// Custom route metadata type for generics flow
type Meta = {
	param_validators?: Record<string, (value: string | null | undefined) => boolean>
	loaders?: (params: Params) => unknown | Promise<unknown> | Array<unknown | Promise<unknown>>
}

const routes: Array<RouteTuple<Meta>> = [
	['/', {}],
	['users/:id', { param_validators: { id: Navaid.validators.int({ min: 1 }) } }],
	[/^\/posts\/(?<slug>[^/]+)$/, {}],
]

const opts: Options = {
	base: '/app',
	preloadDelay: 10,
	preloadOnHover: true,
	on404(uri) {
		const u: string = uri
	},
	beforeNavigate(nav) {
		const t: 'link' | 'goto' | 'popstate' | 'leave' = nav.type
	},
	afterNavigate(nav) {
		const to = nav.to!
		const u: string = to.url.pathname
		const m: RouteTuple<Meta> = to.route as RouteTuple<Meta>
		const p: Params = to.params
		const d: unknown = to.data
	},
}

// New class-based constructor
const router = new Navaid<Meta>(routes, opts)

// API surface checks
const f1: string | false = router.format('/app/users/1')
const f2: string | false = router.format('users/1')

const m1p: Promise<MatchResult<Meta> | null> = router.match('/users/42')

router.listen()
router.unlisten?.()

// Async-returning methods
declare function expectsPromise<T>(p: Promise<T>): void
expectsPromise(router.goto('/users/1'))
expectsPromise(router.preload('/users/1'))

// Shallow history helpers
router.pushState('/app/foo', { x: 1 })
router.replaceState('/app/foo', { x: 1 })

// Static validator helpers
const isColor = Navaid.validators.oneOf(['red', 'green'])
const ok: boolean = isColor('red')
