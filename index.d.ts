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
	one_of(values: Iterable<string>): (value: string | null | undefined) => boolean
}

/** Optional per-route hooks recognized by Navgo. */
export interface Hooks {
	/** Validate params with custom per-param validators. Return `false` to skip a match. */
	param_validators?: Record<string, (value: string | null | undefined) => boolean>
	/** Declarative loader plan; see Loader types below. */
	loader?(ctx: LoaderContext): LoaderPlan | Promise<LoaderPlan>
	/** Predicate used during match(); may be async. If it returns `false`, the route is skipped. */
	validate?(params: Params): boolean | Promise<boolean>
	/** Route-level navigation guard, called on the current route when leaving it. Synchronous only; call `nav.cancel()` to prevent navigation. */
	before_route_leave?(nav: Navigation): void
}

export interface NavigationTarget {
	url: URL
	params: Params
	/** The matched route tuple from your original `routes` list; `null` when unmatched (e.g. external). */
	route: RouteTuple | null
	/** Optional data from route loader when available. */
	data?: unknown
}

export interface Navigation {
	type: 'link' | 'goto' | 'popstate' | 'leave'
	from: NavigationTarget | null
	to: NavigationTarget | null
	will_unload: boolean
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
	/** Present when the entry was created via shallow `push_state`/`replace_state`. */
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
	/** Attach instance to window as `window.navgo`. Default true. */
	attach_to_window?: boolean
	/** Global hook fired after per-route `before_route_leave`, before loader/history change. Can cancel. */
	before_navigate?(nav: Navigation): void
	/** Global hook fired after routing completes (data loaded, URL updated, handlers run). */
	after_navigate?(nav: Navigation, on_revalidate?: (cb: () => void) => void): void | Promise<void>
	/** Optional hook awaited after `after_navigate` and before scroll handling.
	 *  Useful for UI frameworks (e.g., Svelte) to flush DOM updates so anchor/top
	 *  scrolling lands on the correct elements.
	 */
	tick?: () => void | Promise<void>
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
	/** SvelteKit-like navigation that runs `loader` before updating the URL. */
	goto(url: string, opts?: { replace?: boolean }): Promise<void>
	/** Shallow push — updates URL/state without triggering handlers. */
	push_state(url?: string | URL, state?: any): void
	/** Shallow replace — updates URL/state without triggering handlers. */
	replace_state(url?: string | URL, state?: any): void
	/** Manually preload `loader` for a URL (deduped). */
	preload(url: string): Promise<unknown | void>
	/** Try to match `url`; returns route tuple and params or `null`. Supports async `validate`. */
	match(url: string): Promise<MatchResult<T> | null>
	/** Attach history + click listeners and immediately process current location. */
	init(): Promise<void>
	/** Remove listeners installed by `init()`. */
	destroy(): void
	/** Writable store with current { url, route, params }. */
	readonly route: import('svelte/store').Writable<{
		url: URL
		route: RouteTuple<T> | null
		params: Params
	}>
	/** Writable store indicating active navigation. */
	readonly is_navigating: import('svelte/store').Writable<boolean>
	/** Invalidate cache entries by canonical keys or tags. */
	invalidate(keys_or_tags: string | string[]): Promise<void>
	/** Built-in validator helpers (namespaced). */
	static validators: ValidatorHelpers
}

// Cache + loader types
export type CacheStrategy = 'swr' | 'cache-first' | 'network-first' | 'no-store'
export interface CacheHints {
	strategy?: CacheStrategy
	ttl?: number
	soft_ttl?: number
	tags?: string[]
	version?: string | number
	allow_opaque?: boolean
}
export type Parser<T = unknown> =
	| 'json'
	| 'text'
	| 'blob'
	| 'arrayBuffer'
	| ((res: Response) => Promise<T>)
export interface ResourceSpec<T = unknown> {
	request: string | URL | Request
	init?: Omit<RequestInit, 'method' | 'body' | 'signal'>
	parse?: Parser<T>
	cache?: CacheHints
	depends_on?: string[]
}
export interface LoaderContext {
	params: Params
	url: URL
	signal: AbortSignal
	fetch(input: RequestInfo, init?: RequestInit): Promise<Response>
	invalidate(keys_or_tags: string | string[]): Promise<void>
}
export type LoaderPlan = Record<string, ResourceSpec>
