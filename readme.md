## Install

```
$ pnpm install --dev navaid
```

## Usage

```js
import Navaid from 'navaid'

// Define routes up front (strings or RegExp)
const routes = [
	['/' /* optional data */],
	['/users/:username'],
	['/books/*'],
	[/articles\/(?<year>[0-9]{4})/],
	[/privacy|privacy-policy/],
]

// Create router with options + callbacks
const router = new Navaid(routes, {
	base: '/',
	on404(uri) {
		console.log('404 for', uri)
	},
	onRoute(uri, matched, params, data) {
		// `matched` is the tuple from your `routes` list
		// e.g. ['/users/:username'] or a RegExp
		console.log('matched:', matched[0], 'uri:', uri, 'params:', params, 'data:', data)
	},
})

// Process current location
router.run()

// Long‑lived router: history + <a> bindings
// Also immediately processes the current location
router.listen()
```

### Quickstart With Hooks

```js
import Navaid from 'navaid'

const routes = [
  [
    '/admin',
    {
      // constrain params with built‑ins or your own
      matchers: { /* id: Navaid.int({ min: 1 }) */ },
      // load data before URL changes; result goes to onRoute(..., data)
      loaders: (params) => fetch('/api/admin').then(r => r.json()),
      // per‑route guard; cancel synchronously to block nav
      beforeNavigate(nav) {
        if ((nav.type === 'link' || nav.type === 'goto') && !confirm('Enter admin?')) {
          nav.cancel()
        }
      }
    }
  ],
  ['/', {}]
]

const router = new Navaid(routes, {
  base: '/app',
  onRoute(uri, matched, params, data) {
    console.log('route:', matched[0], 'params:', params, 'data:', data)
  },
  on404(uri) { console.warn('no match for', uri) }
})

router.listen()
```

## API

### new Navaid(routes?, options?)

Returns: `Router`

Create a router instance by defining your routes up front and passing initialization `options`.

#### routes

Type: `Array<[pattern: string | RegExp, data?: any]>`

Each route is a tuple whose first item is the pattern and whose optional second item is per‑route metadata and hooks (see “Route Hooks & Metadata”). Navaid returns this tuple back to you unchanged via `onRoute`.

Supported pattern types:

- static (`/users`)
- named parameters (`/users/:id`)
- nested parameters (`/users/:id/books/:title`)
- optional parameters (`/users/:id?/books/:title?`)
- wildcards (`/users/*`)
- RegExp patterns (with optional named groups)

Notes:

- Pattern strings are matched relative to the [`base`](#base) path.
- RegExp patterns are used as‑is. Named capture groups (e.g. `(?<year>\d{4})`) become `params` keys; unnamed groups are ignored.

### Options (initialization)

- base: `string` (default `'/'`)
  - App base pathname. With or without leading/trailing slashes is accepted.
- preloadDelay: `number` (default `20`)
  - Delay in ms before hover preloading triggers.
- preloadOnHover: `boolean` (default `true`)
  - When `false`, disables hover/touch preloading.
- on404: `(uri: string) => void`
  - Called when no route matches the formatted URI (only URIs under `base`).
- onRoute: `(uri: string, matched: [string|RegExp, any?], params: Record<string,string|null|undefined>, data?: unknown) => void`
  - Called after a successful match in `run()`. `data` is any value from `loaders`.

Important: Navaid only processes routes that match your `base` path. `on404` will never run for URLs that do not begin with `base`, allowing multiple instances to coexist.

### Route Hooks & Metadata (per‑route)

Attach these to a route’s `data` object:

- matchers?: `Record<string, (value: string|null|undefined) => boolean>`
  - Validate params (e.g., `id: Navaid.int({ min: 1 })`). Any `false` result skips the route.
- loaders?(params): `unknown | Promise | Array<unknown|Promise>`
  - Run before URL changes on `link`/`goto`. Results are cached per formatted path and forwarded to `onRoute`.
- beforeNavigate?(nav): `(nav: BeforeNavigate) => void`
  - Guard called once per navigation attempt on the current route (leave) and then the next route (enter). Call `nav.cancel()` synchronously to prevent navigation. For `popstate`, cancellation auto‑reverts the history jump.

The `BeforeNavigate` object includes:

```
{
  type: 'link' | 'goto' | 'popstate' | 'leave',
  from: { url, params, route } | null,
  to:   { url, params, route } | null,
  willUnload: boolean,
  event?: Event,
  cancel(): void
}
```

### Methods

### format(uri)

Returns: `String` or `false`

Formats and returns a pathname relative to the [`base`](#base) path.

If the `uri` **does not** begin with the `base`, then `false` will be returned instead.<br>
Otherwise, the return value will always lead with a slash (`/`).

> **Note:** This is called automatically within the [`listen()`](#listen) and [`run()`](#runuri) methods.

#### uri

Type: `String`

The path to format.

> **Note:** Much like [`base`](#base), paths with or without leading and trailing slashes are handled identically.

### goto(uri, options?)

Returns: `Promise<void>`

Runs any matching route `loaders` before updating the URL and emitting `onRoute`. Use `replace: true` to replace the current history entry.

#### uri

Type: `String`

The desired path to navigate. If it begins with `/` and does not match the configured [`base`](#base), it will be prefixed automatically.

#### options

Type: `Object`

- replace: `Boolean` (default `false`)
    - When `true`, uses `history.replaceState`; otherwise `history.pushState`.

### run()

Returns: `void`

Processes the current `location.pathname`. This does not modify browser history nor emit History API events.

### listen()

Returns: `void`

Attaches global listeners to synchronize your router with URL changes, which allows Navaid to respond consistently to your browser's <kbd>BACK</kbd> and <kbd>FORWARD</kbd> buttons.

These are the (global) events that Navaid creates and/or responds to:

- popstate
- replacestate
- pushstate

Navaid will also bind to any `click` event(s) on anchor tags (`<a href="" />`) so long as the link has a valid `href` that matches the [`base`](#base) path. Navaid **will not** intercept links that have _any_ `target` attribute or if the link was clicked with a special modifier (eg; <kbd>ALT</kbd>, <kbd>SHIFT</kbd>, <kbd>CMD</kbd>, or <kbd>CTRL</kbd>).

While listening, link clicks are intercepted and translated into `goto()` navigations. You can also call `goto()` programmatically.

### Route Hooks

Each route’s optional `data` object may include hooks recognized by the router:

- `matchers`: constrain params for this pattern (skip match when a validator returns `false`).
- `loaders(params)`: load data before navigation (value | Promise | Promise[]).
- `beforeNavigate(nav)`: per-route navigation guard; call `nav.cancel()` to prevent navigation.

beforeNavigate signature (abbrev):

```
({
  type: 'link' | 'goto' | 'popstate' | 'leave',
  from: { url, params, route } | null,
  to:   { url, params, route } | null,
  willUnload: boolean,
  event?: Event,
  cancel(): void
})
```

Order & cancellation:

- Router calls `beforeNavigate` on the current route (leave), then on the next route (enter).
- Call `nav.cancel()` synchronously to cancel.
  - link/goto: cancels before the URL changes.
  - popstate: cancels and auto-reverts the history jump via `history.go(...)`.
  - leave: only the current route participates; cancel triggers the browser’s native confirmation prompt.
- Note: `goto()` fires hooks only when the target path matches a route; unmatched navigations fall through to `on404`.

Example:

```js
const routes = [
  [
    '/admin',
    {
      matchers: { /* ... */ },
      loaders: (params) => fetch('/api/admin/stats').then(r => r.json()),
      beforeNavigate(nav) {
        if (nav.type === 'link' || nav.type === 'goto') {
          if (!confirm('Enter admin area?')) nav.cancel()
        }
      }
    }
  ],
  ['/', {}]
]

const router = new Navaid(routes, { base: '/app' })
router.listen()
```

### preload(uri)

Returns: `Promise<unknown>`

Preload a route’s `loaders` data for a given `uri` without navigating. Concurrent calls for the same path are deduped.

### pushState(url?, state?)

Returns: `void`

Perform a shallow history push: updates the URL/state without triggering route processing.

### replaceState(url?, state?)

Returns: `void`

Perform a shallow history replace: updates the URL/state without triggering route processing.

### unlisten()

Returns: `undefined`

Detach all listeners initialized by [`listen()`](#listen).

> **Note:** This method is only available after `listen()` has been invoked.

## Semantics

This section explains, in detail, how navigation is processed: matching, hooks, data loading, shallow routing, history behavior, and scroll restoration. The design takes cues from SvelteKit’s client router (see: kit/documentation/docs/30-advanced/10-advanced-routing.md and kit/documentation/docs/30-advanced/67-shallow-routing.md).

### Navigation Types

- `link` — user clicked an in-app `<a>` that matches `base`.
- `goto` — programmatic navigation via `router.goto(...)`.
- `popstate` — browser back/forward.
- `leave` — page is unloading (refresh, external navigation, tab close) via `beforeunload`.

The router passes the type to your route-level `beforeNavigate(nav)` hook.

### Matching and Params

- A route is a `[pattern, data?]` tuple.
- `pattern` can be a string (compiled with `regexparam`) or a `RegExp`.
- Named params from string patterns populate `params` with `string` values; optional params that do not appear are `null`.
- Wildcards use the `'*'` key.
- RegExp named groups also populate `params`; omitted groups can be `undefined`.
- If `data.matchers` is present, each `params[k]` is validated; any `false` result skips that route.

### Data Flow

For `link` and `goto` navigations that match a route:

```
[click <a>] or [router.goto()]
    → beforeNavigate({ type })
        → cancelled? yes → stop
        → no → run loaders(params)  // may be value, Promise, or Promise[]
            → cache data by formatted path
            → history.push/replaceState(new URL)
            → run()
                → consume cached data (if any)
                → onRoute(uri, matched, params, data)
```

- If a loader throws/rejects, navigation continues and `onRoute(..., { __error })` is delivered so UI can render an error state.
- For `popstate`, no loaders run; `run()` executes using the current URL and any cache entry for that path.

### Hook: beforeNavigate(nav)

Signature (abbrev):

```
beforeNavigate({
  type: 'link' | 'goto' | 'popstate' | 'leave',
  from: { url, params, route } | null,
  to:   { url, params, route } | null,
  willUnload: boolean,
  event?: Event,
  cancel(): void
})
```

Semantics:

- Fires once per navigation attempt.
- `cancel()` prevents navigation.
  - For `link`/`goto`, it stops before URL change.
  - For `popstate`, cancellation causes an automatic `history.go(...)` to revert to the previous index.
  - For `leave`, cancellation triggers the native “Leave site?” dialog (behavior is browser-controlled).

Note: currently `beforeNavigate` for `goto()` runs only when the path matches a route; unmatched `goto` falls through to `on404` without the hook.

### Shallow Routing

Use `pushState(url, state?)` or `replaceState(url, state?)` to update the URL/state without re-running routing logic.

```
pushState/replaceState (shallow)
    → dispatch 'pushstate'/'replacestate'
        → run(e)
            → e.state.__navaid.shallow === true → skip processing
```

This lets you reflect UI state in the URL while deferring route transitions until a future navigation.

### History Index & popstate Cancellation

To enable `popstate` cancellation, Navaid stores a monotonic `idx` in `history.state.__navaid.idx`. On `popstate`, a cancelled navigation computes the delta between the target and current `idx` and calls `history.go(-delta)` to return to the prior entry.

### Scroll Restoration

Navaid manages scroll manually (sets `history.scrollRestoration = 'manual'`) and applies SvelteKit-like behavior:

- Saves the current scroll position for the active history index.
- On `link`/`goto` (after route commit):
  - If the URL has a `#hash`, scroll to the matching element `id` or `[name="..."]`.
  - Otherwise, scroll to the top `(0, 0)`.
- On `popstate`: restore the saved position for the target history index; if not found but there is a `#hash`, scroll to the anchor instead.
- Shallow `pushState`/`replaceState` never adjust scroll (routing is skipped).

```
scroll flow
    ├─ on any nav: save current scroll for current idx
    ├─ link/goto: after run() → hash? anchor : scroll(0,0)
    └─ popstate: after run() → restore saved idx position (fallback: anchor)
```

### Method-by-Method Semantics

- `format(uri)` — normalizes a path relative to `base`. Returns `false` when `uri` is outside of `base`.
- `match(uri)` — returns `{ route, params } | null` using string/RegExp patterns and validators.
- `goto(uri, { replace? })` — fires `beforeNavigate('goto')`, saves scroll, runs loaders, then pushes/replaces and calls `onRoute` via `run()`.
- `listen()` — wires global listeners (`popstate`, `pushstate`, `replacestate`, click) and optional hover/tap preloading; immediately processes the current location.
- `unlisten()` — removes listeners added by `listen()`.
- `run(e?)` — processes the current `location.pathname`. Skips work when `e?.state?.__navaid?.shallow` is true; applies scroll behavior described above.
- `preload(uri)` — pre-executes a route’s `loaders` for a path and caches the result; concurrent calls are deduped.
- `pushState(url?, state?)` — shallow push that updates the URL and `history.state` without route processing.
- `replaceState(url?, state?)` — shallow replace that updates the URL and `history.state` without route processing.

## Semantics

This section explains, in detail, how navigation is processed: matching, hooks, data loading, shallow routing, and history behavior. The design takes cues from SvelteKit’s client router (see: kit/documentation/docs/30-advanced/10-advanced-routing.md and kit/documentation/docs/30-advanced/67-shallow-routing.md).

### Navigation Types

- `link` — user clicked an in-app `<a>` that matches `base`.
- `goto` — programmatic navigation via `router.goto(...)`.
- `popstate` — browser back/forward.
- `leave` — page is unloading (refresh, external navigation, tab close) via `beforeunload`.

Navaid passes the type to `beforeNavigate(nav)`.

### Matching and Params

- A route is a `[pattern, data?]` tuple.
- `pattern` can be a string (compiled with `regexparam`) or a `RegExp`.
- Named params from string patterns populate `params` with `string` values; optional params that do not appear are `null`.
- Wildcards use the `'*'` key.
- RegExp named groups also populate `params`; omitted groups can be `undefined`.
- If `data.matchers` is present, each `params[k]` is validated; any `false` result skips that route.

### Data Flow

For `link` and `goto` navigations that match a route:

```
[click <a>] or [router.goto()]
    → beforeNavigate({ type })
        → cancelled? yes → stop
        → no → run loaders(params)  // may be value, Promise, or Promise[]
            → cache data by formatted path
            → history.push/replaceState(new URL)
            → run()
                → consume cached data (if any)
                → onRoute(uri, matched, params, data)
```

- If a loader throws/rejects, navigation continues and `onRoute(..., { __error })` is delivered so UI can render an error state.
- For `popstate`, no loaders run; `run()` executes using the current URL and any cache entry for that path.

### Hook: beforeNavigate(nav)

Signature (abbrev):

```
beforeNavigate({
  type: 'link' | 'goto' | 'popstate' | 'leave',
  from: { url, params, route } | null,
  to:   { url, params, route } | null,
  willUnload: boolean,
  event?: Event,
  cancel(): void
})
```

Semantics:

- Fires once per navigation attempt.
- `cancel()` prevents navigation.
  - For `link`/`goto`, it stops before URL change.
  - For `popstate`, cancellation causes an automatic `history.go(...)` to revert to the previous index.
  - For `leave`, cancellation triggers the native “Leave site?” dialog (behavior is browser-controlled).

Note: currently `beforeNavigate` for `goto()` runs only when the path matches a route; unmatched `goto` falls through to `on404` without the hook.

### Shallow Routing

Use `pushState(url, state?)` or `replaceState(url, state?)` to update the URL/state without re-running routing logic.

```
pushState/replaceState (shallow)
    → dispatch 'pushstate'/'replacestate'
        → run(e)
            → e.state.__navaid.shallow === true → skip processing
```

This lets you reflect UI state in the URL while deferring route transitions until a future navigation.

### History Index & popstate Cancellation

To enable `popstate` cancellation, Navaid stores a monotonic `idx` in `history.state.__navaid.idx`. On `popstate`, a cancelled navigation computes the delta between the target and current `idx` and calls `history.go(-delta)` to return to the prior entry.

### Method-by-Method Semantics

- `format(uri)` — normalizes a path relative to `base`. Returns `false` when `uri` is outside of `base`.
- `match(uri)` — returns `{ route, params } | null` using string/RegExp patterns and validators.
- `goto(uri, { replace? })` — fires `beforeNavigate('goto')`, runs loaders, then pushes/replaces and calls `onRoute` via `run()`.
- `listen()` — wires global listeners (`popstate`, `pushstate`, `replacestate`, click) and optional hover/tap preloading; immediately processes the current location.
- `unlisten()` — removes listeners added by `listen()`.
- `run(e?)` — processes the current `location.pathname`. Skips work when `e?.state?.__navaid?.shallow` is true.
- `preload(uri)` — pre-executes a route’s `loaders` for a path and caches the result; concurrent calls are deduped.
- `pushState(url?, state?)` — shallow push that updates the URL and `history.state` without route processing.
- `replaceState(url?, state?)` — shallow replace that updates the URL and `history.state` without route processing.

### Built-in Matchers

- `Navaid.int({ min?, max? })` — `true` iff the value is an integer within optional bounds.
- `Navaid.oneOf(iterable)` — `true` iff the value is in the provided set.

Attach validators via a route tuple’s `data.matchers` to constrain matches.

## License

MIT © [Luke Edwards](https://lukeed.com)
