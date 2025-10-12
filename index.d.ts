/**
 * Route parameter bag. Keys come from named parameters or `'*'` for wildcards.
 * For string patterns, missing optional params are `null`.
 * For RegExp named groups, missing groups may be `undefined`.
 */
export type Params = Record<string, string | null | undefined>

/** Built-in validator helpers shape. */
export interface ValidatorHelpers {
	int(opts?: {
		min?: number | null
		max?: number | null
	}): (value: string | null | undefined) => boolean
	oneOf(values: Iterable<string>): (value: string | null | undefined) => boolean
}

/** Optional per-route hooks recognized by Navgo. */
export interface Hooks {
	/** Validate params with custom per-param validators. Return `false` to skip a match. */
	param_validators?: Record<string, (value: string | null | undefined) => boolean>
	/** Load data for a route before navigation. May return a Promise or an array of values/promises. */
	loaders?(params: Params): unknown | Promise<unknown> | Array<unknown | Promise<unknown>>
	/** Predicate used during match(); may be async. If it returns `false`, the route is skipped. */
	validate?(params: Params): boolean | Promise<boolean>
	/** Route-level navigation guard, called on the current route when leaving it. Synchronous only; call `nav.cancel()` to prevent navigation. */
	beforeRouteLeave?(nav: Navigation): void
}

export interface NavigationTarget {
	url: URL
	params: Params
	/** The matched route tuple from your original `routes` list; `null` when unmatched (e.g. external). */
	route: RouteTuple | null
	/** Optional data from route loaders when available. */
	data?: unknown
}

export interface Navigation {
	type: 'link' | 'goto' | 'popstate' | 'leave'
	from: NavigationTarget | null
	to: NavigationTarget | null
	willUnload: boolean
	cancelled: boolean
	/** The original browser event that initiated navigation, when available. */
	event?: Event
	cancel(): void
}

/** A route tuple: [pattern, data?]. The `data` may include {@link Hooks}. */
export type RouteTuple<T = unknown> = [pattern: string | RegExp, data: T]

/** Result of calling `router.match(url)` */
export interface MatchResult<T = unknown> {
	route: RouteTuple<T>
	params: Params
}

// For convenience in docs/types, alias the class instance type
export type Router<T = unknown> = Navgo<T>

/** Router metadata stored under `history.state.__navgo`. */
export interface NavgoHistoryMeta {
	/** Monotonic index of the current history entry for scroll restoration. */
	idx: number
	/** Present when the entry was created via shallow `pushState`/`replaceState`. */
	shallow?: boolean
	/** Origin of the navigation that created this entry. */
	type?: 'link' | 'goto' | 'popstate'
}

export interface Options {
	/** App base path. Default '/' */
	base?: string
	/** Delay before hover preloading in milliseconds. Default 20. */
	preload_delay?: number
	/** Disable hover/touch preloading when `false`. Default true. */
	preload_on_hover?: boolean
	/** Global hook fired after per-route `beforeRouteLeave`, before loaders/history change. Can cancel. */
	before_navigate?(nav: Navigation): void
	/** Global hook fired after routing completes (data loaded, URL updated, handlers run). */
	after_navigate?(nav: Navigation): void
	/** Global hook fired whenever the URL changes.
	 *  Triggers for shallow pushes/replaces, hash changes, popstate-shallow, 404s, and full navigations.
	 *  Receives the router's current snapshot (eg `{ url: URL, route: RouteTuple|null, params: Params }`).
	 */
	url_changed?(payload: any): void
}

/** Navgo default export: class-based router. */
export default class Navgo<T = unknown> {
	constructor(routes?: Array<RouteTuple<T>>, opts?: Options)
	/** Format `url` relative to the configured base. */
	format(url: string): string | false
	/** SvelteKit-like navigation that runs loaders before updating the URL. */
	goto(url: string, opts?: { replace?: boolean }): Promise<void>
	/** Shallow push — updates URL/state without triggering handlers. */
	pushState(url?: string | URL, state?: any): void
	/** Shallow replace — updates URL/state without triggering handlers. */
	replaceState(url?: string | URL, state?: any): void
	/** Manually preload loaders for a URL (deduped). */
	preload(url: string): Promise<unknown | void>
	/** Try to match `url`; returns route tuple and params or `null`. Supports async `validate`. */
	match(url: string): Promise<MatchResult<T> | null>
	/** Attach history + click listeners and immediately process current location. */
	init(): Promise<void>
	/** Remove listeners installed by `init()`. */
	destroy(): void
	/** Built-in validator helpers (namespaced). */
	static validators: ValidatorHelpers
}
