## Install

```
$ pnpm install --dev navgo
```

## Usage

```js
import Navgo from 'navgo'

// Define routes up front (strings or RegExp)
const routes = [
  ['/', {}],
  ['/users/:username', {}],
  ['/books/*', {}],
  [/articles\/(?<year>[0-9]{4})/, {}],
  [/privacy|privacy-policy/, {}],
  [
    '/admin',
    {
      // constrain params with built-ins or your own
      param_validators: {
        /* id: Navgo.validators.int({ min: 1 }) */
      },
      // load data before URL changes; result goes to after_navigate(...)
      loaders: params => fetch('/api/admin').then(r => r.json()),
      // per-route guard; cancel synchronously to block nav
      before_route_leave(nav) {
        if ((nav.type === 'link' || nav.type === 'nav') && !confirm('Enter admin?')) {
          nav.cancel()
        }
      },
    },
  ],
]

// Create router with options + callbacks
const router = new Navgo(routes, {
  base: '/',
  before_navigate(nav) {
    // app-level hook before loaders/URL update; may cancel
    console.log('before_navigate', nav.type, '→', nav.to?.url.pathname)
  },
  after_navigate(nav) {
    // called after routing completes; nav.to.data holds loader result
    if (nav.to?.data?.__error?.status === 404) {
      console.log('404 for', nav.to.url.pathname)
      return
    }

    console.log('after_navigate', nav.to?.url.pathname, nav.to?.data)
  },
  url_changed(cur) {
    // fires on shallow/hash/popstate-shallow/404 and full navigations
    // `cur` is the router snapshot: { url: URL, route, params }
    console.log('url_changed', cur.url.href)
  },
})

// Long-lived router: history + <a> bindings
// Also immediately processes the current location
router.init()
```

## API

### new Navgo(routes?, options?)

Returns: `Router`

#### `routes`

Type: `Array<[pattern: string | RegExp, data: any]>`

Each route is a tuple whose first item is the pattern and whose second item is hooks (see “Route Hooks”). Pass `{}` when no hooks are needed. Navgo returns this tuple back to you unchanged via `onRoute`.

Supported pattern types:

- static (`/users`)
- named parameters (`/users/:id`)
- nested parameters (`/users/:id/books/:title`)
- optional parameters (`/users/:id?/books/:title?`)
- wildcards (`/users/*`)
- RegExp patterns (with optional named groups)

Notes:

- Pattern strings are matched relative to the [`base`](#base) path.
- RegExp patterns are used as-is. Named capture groups (e.g. `(?<year>\d{4})`) become `params` keys; unnamed groups are ignored.

#### `options`

- `base`: `string` (default `'/'`)
  - App base pathname. With or without leading/trailing slashes is accepted.
- `before_navigate`: `(nav: Navigation) => void`
  - App-level hook called once per navigation attempt after the per-route guard and before loaders/URL update. May call `nav.cancel()` synchronously to prevent navigation.
- `after_navigate`: `(nav: Navigation) => void`
  - App-level hook called after routing completes (URL updated, data loaded). `nav.to.data` holds any loader data.
- `url_changed`: `(snapshot: any) => void`
  - Fires on every URL change — shallow `push_state`/`replace_state`, hash changes, `popstate` shallow entries, 404s, and full navigations.
  - Receives the router's current snapshot: an object like `{ url: URL, route: RouteTuple|null, params: Params }`.
  - The snapshot type is intentionally `any` and may evolve without a breaking change.
- `preload_delay`: `number` (default `20`)
  - Delay in ms before hover preloading triggers.
- `preload_on_hover`: `boolean` (default `true`)
  - When `false`, disables hover/touch preloading.

Important: Navgo only processes routes that match your `base` path.

### Route Hooks

- param_validators?: `Record<string, (value: string|null|undefined) => boolean>`
  - Validate params (e.g., `id: Navgo.validators.int({ min: 1 })`). Any `false` result skips the route.
- loaders?(params): `unknown | Promise | Array<unknown|Promise>`
  - Run before URL changes on `link`/`nav`. Results are cached per formatted path and forwarded to `after_navigate`.
- validate?(params): `boolean | Promise<boolean>`
  - Predicate called during matching. If it returns or resolves to `false`, the route is skipped.
- before_route_leave?(nav): `(nav: Navigation) => void`
  - Guard called once per navigation attempt on the current route (leave). Call `nav.cancel()` synchronously to prevent navigation. For `popstate`, cancellation auto-reverts the history jump.

The `Navigation` object contains:

```ts
{
  type: 'link' | 'nav' | 'popstate' | 'leave',
  from: { url, params, route } | null,
  to:   { url, params, route } | null,
  will_unload: boolean,
  cancelled: boolean,
  event?: Event,
  cancel(): void
}
```

#### Order & cancellation:

- Router calls `before_navigate` on the current route (leave).
- Call `nav.cancel()` synchronously to cancel.
  - For `link`/`nav`, it stops before URL change.
  - For `popstate`, cancellation causes an automatic `history.go(...)` to revert to the previous index.
  - For `leave`, cancellation triggers the native “Leave site?” dialog (behavior is browser-controlled).

Example:

```js
const routes = [
  [
    '/admin',
    {
      param_validators: {
        /* ... */
      },
      loaders: params => fetch('/api/admin/stats').then(r => r.json()),
      before_route_leave(nav) {
        if (nav.type === 'link' || nav.type === 'nav') {
          if (!confirm('Enter admin area?')) nav.cancel()
        }
      },
    },
  ],
  ['/', {}],
]

const router = new Navgo(routes, { base: '/app' })
router.init()
```

### Methods

### format(uri)

Returns: `String` or `false`

Formats and returns a pathname relative to the [`base`](#base) path.

If the `uri` **does not** begin with the `base`, then `false` will be returned instead.<br>
Otherwise, the return value will always lead with a slash (`/`).

> **Note:** This is called automatically within the [`init()`](#init) method.

#### uri

Type: `String`

The path to format.

> **Note:** Much like [`base`](#base), paths with or without leading and trailing slashes are handled identically.

### goto(uri, options?)

Returns: `Promise<void>`

Runs any matching route `loaders` before updating the URL and then updates history. Route processing triggers `after_navigate`. Use `replace: true` to replace the current history entry.

#### uri

Type: `String`

The desired path to navigate. If it begins with `/` and does not match the configured [`base`](#base), it will be prefixed automatically.

#### options

Type: `Object`

- replace: `Boolean` (default `false`)
- When `true`, uses `history.replaceState`; otherwise `history.pushState`.

### init()

Attaches global listeners to synchronize your router with URL changes, which allows Navgo to respond consistently to your browser's <kbd>BACK</kbd> and <kbd>FORWARD</kbd> buttons.

Events:

- Responds to: `popstate` only. No synthetic events are emitted.

Navgo will also bind to any `click` event(s) on anchor tags (`<a href="" />`) so long as the link has a valid `href` that matches the [`base`](#base) path. Navgo **will not** intercept links that have _any_ `target` attribute or if the link was clicked with a special modifier (<kbd>ALT</kbd>, <kbd>SHIFT</kbd>, <kbd>CMD</kbd>, or <kbd>CTRL</kbd>).

While listening, link clicks are intercepted and translated into `goto()` navigations. You can also call `goto()` programmatically.

In addition, `init()` wires preloading listeners (enabled by default) so route data can be fetched early:

- `mousemove` (hover) — after a short delay, hovering an in-app link triggers `preload(href)`.
- `touchstart` and `mousedown` (tap) — tapping or pressing on an in-app link also triggers `preload(href)`.

Preloading applies only to in-app anchors that match the configured [`base`](#base). You can tweak this behavior with the `preload_delay` and `preload_on_hover` options.

Notes:

- `preload(uri)` is a no-op when `uri` formats to the current route's path (already loaded).

### Scroll persistence

On `beforeunload`, the current scroll position is saved to `sessionStorage` and restored on the next load of the same URL (e.g., refresh or tab restore).

### preload(uri)

Returns: `Promise<unknown | void>`

Preload a route's `loaders` data for a given `uri` without navigating. Concurrent calls for the same path are deduped.
Note: Resolves to `undefined` when the matched route has no `loaders`.

### push_state(url?, state?)

Returns: `void`

Perform a shallow history push: updates the URL/state without triggering route processing.

### replace_state(url?, state?)

Returns: `void`

Perform a shallow history replace: updates the URL/state without triggering route processing.

### destroy()

Detach all listeners initialized by [`init()`](#init).

## Semantics

This section explains, in detail, how navigation is processed: matching, hooks, data loading, shallow routing, history behavior, and scroll restoration. The design takes cues from SvelteKit's client router (see: kit/documentation/docs/30-advanced/10-advanced-routing.md and kit/documentation/docs/30-advanced/67-shallow-routing.md).

### Navigation Types

- `link` — user clicked an in-app `<a>` that matches `base`.
- `goto` — programmatic navigation via `router.goto(...)`.
- `popstate` — browser back/forward.
- `leave` — page is unloading (refresh, external navigation, tab close) via `beforeunload`.

The router passes the type to your route-level `before_route_leave(nav)` hook.

### Matching and Params

- A route is a `[pattern, data?]` tuple.
- `pattern` can be a string (compiled with `regexparam`) or a `RegExp`.
- Named params from string patterns populate `params` with `string` values; optional params that do not appear are `null`.
- Wildcards use the `'*'` key.
- RegExp named groups also populate `params`; omitted groups can be `undefined`.
- If `data.param_validators` is present, each `params[k]` is validated; any `false` result skips that route.
- If `data.validate(params)` returns or resolves to `false`, the route is also skipped.

### Data Flow

For `link` and `goto` navigations that match a route:

```
[click <a>] or [router.goto()]
        → before_route_leave({ type })  // per-route guard
        → before_navigate(nav)        // app-level start
            → cancelled? yes → stop
            → no → run loaders(params)  // may be value, Promise, or Promise[]
            → cache data by formatted path
            → history.push/replaceState(new URL)
            → after_navigate(nav)
```

- If a loader throws/rejects, navigation continues and `after_navigate(..., with nav.to.data = { __error })` is delivered so UI can render an error state.
- For `popstate`, loaders run before completion so content matches the target entry; this improves scroll restoration. Errors are delivered via `after_navigate` with `nav.to.data = { __error }`.

### Shallow Routing

Use `push_state(url, state?)` or `replace_state(url, state?)` to update the URL/state without re-running routing logic.

```
push_state/replace_state (shallow)
    → updates history.state and URL
    → router does not process routing on shallow operations
```

This lets you reflect UI state in the URL while deferring route transitions until a future navigation.

### History Index & popstate Cancellation

To enable `popstate` cancellation, Navgo stores a monotonic `idx` in `history.state.__navgo.idx`. On `popstate`, a cancelled navigation computes the delta between the target and current `idx` and calls `history.go(-delta)` to return to the prior entry.

### Scroll Restoration

Navgo manages scroll manually (sets `history.scrollRestoration = 'manual'`) and applies SvelteKit-like behavior:

- Saves the current scroll position for the active history index.
- On `link`/`nav` (after route commit):
  - If the URL has a `#hash`, scroll to the matching element `id` or `[name="..."]`.
  - Otherwise, scroll to the top `(0, 0)`.
- On `popstate`: restore the saved position for the target history index; if not found but there is a `#hash`, scroll to the anchor instead.
- Shallow `push_state`/`replace_state` never adjust scroll (routing is skipped).

```
scroll flow
    ├─ on any nav: save current scroll for current idx
    ├─ link/goto: after navigate → hash? anchor : scroll(0,0)
    └─ popstate: after navigate → restore saved idx position (fallback: anchor)
```

### Method-by-Method Semantics

- `format(uri)` — normalizes a path relative to `base`. Returns `false` when `uri` is outside of `base`.
- `match(uri)` — returns a Promise of `{ route, params } | null` using string/RegExp patterns and validators. Awaits an async `validate(params)` if provided.
- `goto(uri, { replace? })` — fires route-level `before_route_leave('goto')`, calls global `before_navigate`, saves scroll, runs loaders, pushes/replaces, and completes via `after_navigate`.
- `init()` — wires global listeners (`popstate`, `pushstate`, `replacestate`, click) and optional hover/tap preloading; immediately processes the current location.
- `destroy()` — removes listeners added by `init()`.
- `preload(uri)` — pre-executes a route's `loaders` for a path and caches the result; concurrent calls are deduped.
- `push_state(url?, state?)` — shallow push that updates the URL and `history.state` without route processing.
- `replace_state(url?, state?)` — shallow replace that updates the URL and `history.state` without route processing.

### Built-in Validators

- `Navgo.validators.int({ min?, max? })` — `true` iff the value is an integer within optional bounds.
- `Navgo.validators.one_of(iterable)` — `true` iff the value is in the provided set.

Attach validators via a route tuple's `data.param_validators` to constrain matches.
