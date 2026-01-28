export * as v from 'valibot'

/**
 * Route parameter bag. Keys come from named parameters or `'*'` for wildcards.
 * For string patterns, missing optional params are `null`.
 * For RegExp named groups, missing groups may be `undefined`.
 */
export type RawParam = string | null | undefined
export type Params = Record<string, any>

export type ParamSchema = import('valibot').BaseSchema<unknown, unknown, any>
export type ParamRule = ParamSchema | { schema?: ParamSchema; coercer?: (value: RawParam) => any }

export type CacheStrategy = 'swr' | 'cache-first' | 'network-first' | 'no-store'

export interface CacheOptions {
	strategy?: CacheStrategy
	ttl?: number
	tags?: string[]
}

export type Parser<T = unknown> =
	| 'json'
	| 'text'
	| 'blob'
	| 'arrayBuffer'
	| ((res: Response) => Promise<T>)

export type FetchSpec<T = unknown> =
	| string
	| {
			request: string | URL | Request
			init?: Omit<RequestInit, 'method' | 'body' | 'signal'>
			parse?: Parser<T>
			cache?: CacheOptions
	  }

export type LoadPlan = Record<string, FetchSpec>

export interface LoadPlanDefaults {
	parse?: Parser
	cache?: CacheOptions
}

export interface SearchOptions {
	show_defaults?: boolean
	debounce?: number
	push_history?: boolean
	sort?: boolean
	/**
	 * How arrays are encoded in the URL.
	 *
	 * - 'repeat': `?tag=a&tag=b`
	 * - 'csv': `?tag=a,b`
	 * - 'json': `?tag=["a","b"]`
	 *
	 * You can set a global style (string) or a per-key map.
	 *
	 * When using a map, `default` is used as the fallback style for keys not explicitly listed.
	 * For example: `{ default: 'repeat', tags: 'csv' }` makes `tags` use 'csv', while all other
	 * array keys use 'repeat'.
	 */
	array_style?:
		| 'repeat'
		| 'csv'
		| 'json'
		| ({ default?: 'repeat' | 'csv' | 'json' } & Record<
				string,
				'repeat' | 'csv' | 'json' | undefined
		  >)
}

export interface LoaderContext {
	route_entry: RouteTuple
	url: URL
	params: Params
	search_params: Record<string, unknown>
	signal: AbortSignal
	fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
	invalidate(keys_or_tags: string | string[]): Promise<void>
}

export interface Match<T = unknown> {
	/** Matched layout/group wrapper or the final route tuple. */
	type: 'layout' | 'route'
	/** Present when `type === 'layout'`. */
	layout?: any
	/** Present when `type === 'route'`. */
	route?: RouteTuple<T>
	/** Loader result for this match when available (e.g. on navigation completion). */
	data?: unknown
}

export interface RouteGroup<T = unknown> {
	/** Optional layout component/module (router does not render; it just forwards this). */
	layout?: any
	/** Load data for this layout group. Return a LoadPlan (object) or a Promise for arbitrary data. */
	loader?(ctx: LoaderContext): LoadPlan | Promise<unknown>
	/** Optional guard, called when leaving a matched route within this group. */
	before_route_leave?(nav: Navigation): void
	search_schema?: any
	search_options?: SearchOptions
	/** Nested routes (route tuples and/or more groups). */
	routes: Array<RouteEntry<T>>
}

/** A route config entry: either a route tuple, or a group wrapper. */
export type RouteEntry<T = unknown> = RouteTuple<T> | RouteGroup<T>

export interface PreloadBundle<T = unknown> {
	matches: Match<T>[]
	data?: unknown
}

/** Optional per-route hooks recognized by Navgo. */
export interface Hooks {
	/** Validate and/or coerce params (schema runs before coercer). */
	param_rules?: Record<string, ParamRule>
	/** Load data for a route before navigation. Return a LoadPlan (object) or a Promise for arbitrary data. */
	loader?(ctx: LoaderContext): LoadPlan | Promise<unknown>
	/** Predicate used during match(); may be async. If it returns `false`, the route is skipped. */
	validate?(params: Params): boolean | Promise<boolean>
	/** Route-level navigation guard, called on the current route when leaving it. Synchronous only; call `nav.cancel()` to prevent navigation. */
	before_route_leave?(nav: Navigation): void
	search_schema?: any
	search_options?: SearchOptions
}

export interface NavigationTarget<T = unknown> {
	url: URL
	params: Params
	/** The matched route tuple from your original `routes` list; `null` when unmatched (e.g. external). */
	route: RouteTuple<T> | null
	/** Ordered matches for nested layouts and the final route (outer → inner). */
	matches?: Match<T>[]
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

/** A route tuple: [pattern, data?, extra?]. The `data`/`extra` may include {@link Hooks}. */
export type RouteTuple<T = unknown, U = unknown> = [pattern: string | RegExp, data?: T, extra?: U]

/** Result of calling `router.match(url)` */
export interface MatchResult<T = unknown> {
	route: RouteTuple<T>
	params: Params
	matches: Match<T>[]
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
	search?: SearchOptions
	/** Global hook fired after per-route `before_route_leave`, before loader/history change. Can cancel. */
	before_navigate?(nav: Navigation): void
	/** Global hook fired after routing completes (data loaded, URL updated, handlers run). */
	after_navigate?(nav: Navigation, on_revalidate?: (cb: () => void) => void): void | Promise<void>
	/** Optional hook awaited after `after_navigate` and before scroll handling.
	 *  Useful for UI frameworks (e.g., Svelte) to flush DOM updates so anchor/top
	 *  scrolling lands on the correct elements.
	 */
	tick?: () => void | Promise<void>
	/** When `false`, do not scroll to top on non-hash navigations. Default true. */
	scroll_to_top?: boolean
	/** When `true`, sets `aria-current="page"` on active in-app links. Default false. */
	aria_current?: boolean
	/** Defaults for LoadPlan entries (parse/cache). */
	load_plan_defaults?: LoadPlanDefaults
}

/** Navgo default export: class-based router. */
export default class Navgo<T = unknown> {
	constructor(routes?: Array<RouteEntry<T>>, opts?: Options)
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
	/** Writable store with current { url, route, params, matches, search_params }. */
	readonly route: import('svelte/store').Writable<{
		url: URL
		route: RouteTuple<T> | null
		params: Params
		matches: Match<T>[]
		search_params: Record<string, unknown>
	}>
	/** Writable store indicating active navigation. */
	readonly is_navigating: import('svelte/store').Writable<boolean>
	/** Writable store of validated search params for the current route. */
	readonly search_params: import('svelte/store').Writable<Record<string, unknown>>
	/** Invalidate cache entries by canonical keys (URLs) or tags. */
	invalidate(keys_or_tags: string | string[]): Promise<void>
}
