declare module 'navaid' {
	/**
	 * Route parameter bag. Keys come from named parameters or `'*'` for wildcards.
	 * Missing optional params are set to `null`.
	 */
	export type Params = Record<string, string | null>;

	export type UnknownHandler = (uri: string) => void;

	/** A route tuple: [pattern, data?] */
	export type RouteTuple<T = unknown> = [pattern: string | RegExp, data?: T];

	export interface Router {
		/** Format `uri` relative to the configured base. */
		format(uri: string): string | false;
		/** Navigate programmatically using History API. */
		route(uri: string, replace?: boolean): void;
		/** Run the router for `uri` (or current location). */
		run(uri?: string): Router;
		/** Attach history and click listeners; returns router. */
		listen(uri?: string): Router;
		/** Remove listeners installed by `listen()` (only present after calling `listen`). */
		unlisten?: VoidFunction;
	}

	export interface Options<T = unknown> {
		/** App base path. Default '/' */
		base?: string;
		/** Called when no route matches. Receives formatted URI. */
		on404?(uri: string): void;
		/**
		 * Called when a route matches.
		 * @param uri The formatted, matched URI
		 * @param matched The matched route tuple from your original `routes` list
		 * @param params The extracted params (including '*' for wildcards)
		 */
		onRoute?(uri: string, matched: RouteTuple<T>, params: Params): void;
	}

	/**
	 * Create a Navaid router. Define routes up front and respond via callbacks.
	 */
	export default function navaid<T = unknown>(routes?: Array<RouteTuple<T>>, opts?: Options<T>): Router;
}
