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

/** Optional per-route hooks recognized by Navaid. */
export interface Hooks {
	/** Validate params with custom per-param validators. Return `false` to skip a match. */
	param_validators?: Record<string, (value: string | null | undefined) => boolean>
	/** Load data for a route before navigation. May return a Promise or an array of values/promises. */
	loaders?(params: Params): unknown | Promise<unknown> | Array<unknown | Promise<unknown>>
	/** Predicate used during match(); may be async. If it returns `false`, the route is skipped. */
	validate?(params: Params): boolean | Promise<boolean>
	/** Route-level navigation guard, called on the current route when leaving it. Synchronous only; call `nav.cancel()` to prevent navigation. */
	beforeNavigate?(nav: BeforeNavigate): void
}

export interface NavigationTarget {
	url: URL
	params: Params
	/** The matched route tuple from your original `routes` list; `null` when unmatched (e.g. external). */
	route: RouteTuple | null
}

export interface BeforeNavigate {
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

/** Result of calling `router.match(uri)` */
export interface MatchResult<T = unknown> {
	route: RouteTuple<T>
	params: Params
}

export interface Router<T = unknown> {
	/** Format `uri` relative to the configured base. */
	format(uri: string): string | false
	/** SvelteKit-like navigation that runs loaders before updating the URL. */
	goto(uri: string, opts?: { replace?: boolean }): Promise<void>
	/** Shallow push — updates URL/state without triggering handlers. */
	pushState(url?: string | URL, state?: any): void
	/** Shallow replace — updates URL/state without triggering handlers. */
	replaceState(url?: string | URL, state?: any): void
	/** Manually preload loaders for a URL (deduped). */
	preload(uri: string): Promise<unknown | void>
	/** Try to match `uri`; returns route tuple and params or `null`. Supports async `validate`. */
	match(uri: string): Promise<MatchResult<T> | null>
	/** Process the current location (or call within listeners). */
	run(e?: any): Promise<void>
	/** Attach history + click listeners and immediately process current location. */
	listen(): void
	/** Remove listeners installed by `listen()`. */
	unlisten(): void
}

export interface Options<T = unknown> {
	/** App base path. Default '/' */
	base?: string
	/** Delay before hover preloading in milliseconds. Default 20. */
	preloadDelay?: number
	/** Disable hover/touch preloading when `false`. Default true. */
	preloadOnHover?: boolean
	/** Called when no route matches. Receives formatted URI. */
	on404?(uri: string): void
	/**
	 * Called when a route matches.
	 * @param uri The formatted, matched URI
	 * @param matched The matched route tuple from your original `routes` list
	 * @param params The extracted params (including '*' for wildcards)
	 * @param data Any data returned from `loaders` for this navigation (if any)
	 */
	onRoute?(uri: string, matched: RouteTuple<T>, params: Params, data?: unknown): void
}

/** Navaid default export: class-based router. */
export default class Navaid<T = unknown> implements Router<T> {
	constructor(routes?: Array<RouteTuple<T>>, opts?: Options<T>)
	format(uri: string): string | false
	goto(uri: string, opts?: { replace?: boolean }): Promise<void>
	pushState(url?: string | URL, state?: any): void
	replaceState(url?: string | URL, state?: any): void
	preload(uri: string): Promise<unknown | void>
	match(uri: string): Promise<MatchResult<T> | null>
	run(e?: any): Promise<void>
	listen(): void
	unlisten(): void

	/** Built-in validator helpers (namespaced). */
	static validators: ValidatorHelpers
}
