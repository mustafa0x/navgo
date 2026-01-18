/**
 * Route parameter bag. Keys come from named parameters or `'*'` for wildcards.
 * For string patterns, missing optional params are `null`.
 * For RegExp named groups, missing groups may be `undefined`.
 */
export type RawParam = string | null | undefined
export type Params = Record<string, any>

/** Built-in validator helpers shape. */
export interface ValidatorHelpers {
	int(opts?: { min?: number | null; max?: number | null }): (value: RawParam) => boolean
	one_of(values: Iterable<string>): (value: RawParam) => boolean
}

export type ParamRule =
	| ((value: RawParam) => boolean)
	| { validator?: (value: RawParam) => boolean; coercer?: (value: RawParam) => any }

export interface LoaderArgs {
	route_entry: RouteTuple
	url: URL
	params: Params
}

/** Optional per-route hooks recognized by Navgo. */
export interface Hooks {
	/** Validate and/or coerce params (validator runs before coercer). */
	param_rules?: Record<string, ParamRule>
	/** Load data for a route before navigation. May return a Promise or an array of values/promises. */
	loader?(args: LoaderArgs): unknown | Promise<unknown> | Array<unknown | Promise<unknown>>
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

/** A route tuple: [pattern, data?, extra?]. The `data`/`extra` may include {@link Hooks}. */
export type RouteTuple<T = unknown, U = unknown> = [pattern: string | RegExp, data?: T, extra?: U]

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
	after_navigate?(nav: Navigation): void
	/** Optional hook awaited after `after_navigate` and before scroll handling.
	 *  Useful for UI frameworks (e.g., Svelte) to flush DOM updates so anchor/top
	 *  scrolling lands on the correct elements.
	 */
	tick?: () => void | Promise<void>
	/** When `false`, do not scroll to top on non-hash navigations. Default true. */
	scroll_to_top?: boolean
	/** When `true`, sets `aria-current="page"` on active in-app links. Default false. */
	aria_current?: boolean
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
	/** Built-in validator helpers (namespaced). */
	static validators: ValidatorHelpers
}
