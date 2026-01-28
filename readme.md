## Install

```
$ pnpm install --dev navgo
```

## Usage

```js
import Navgo, { v } from 'navgo'
import {mount} from 'svelte'

import App from './App.svelte'
import * as AppLayout from './layouts/App.svelte'
import * as HomeRoute from './routes/Home.svelte'
import * as ReaderRoute from './routes/Reader.svelte'
import * as AccountRoute from './routes/Account.svelte'
import * as AdminRoute from './routes/Admin.svelte'
import * as DebugRoute from './routes/Debug.svelte'

const routes = [
  {
    // optional layout wrapper (router just forwards it via nav.to.matches)
    layout: AppLayout,
    // optional shared loader for all children
    loader: async (ctx) => ctx.fetch('/api/session').then(r => r.json()),
    routes: [
      ['/', HomeRoute],
      ['/:book_id', ReaderRoute],
      ['/account', AccountRoute],
      [
        '/admin/:id',
        AdminRoute,
        {
          // constrain/coerce params
          param_rules: {
            id: v.pipe(v.string(), v.toNumber(), v.minValue(1)),
          },
          // load data before URL changes; result goes to after_navigate(...)
          loader: ({ params }) => ({ admin: `/api/admin/${params.id}` }),
          // per-route guard; cancel synchronously to block nav
          before_route_leave(nav) {
            if ((nav.type === 'link' || nav.type === 'goto') && !confirm('Enter admin?')) {
              nav.cancel()
            }
          },
        },
      ],
    ],
  },
]
if (window.__DEBUG__) routes[0].routes.push(['/debug', DebugRoute])

const props = $state({
  matches: [],
  is_404: false,
})

function after_navigate(nav) {
  props.is_404 = nav.to?.data?.__error?.status === 404
  props.matches = nav.to?.matches ?? []
}

const router = new Navgo(routes, {
  before_navigate(nav) {
    // app-level hook before loader/URL update; may cancel
    console.log('before_navigate', nav.type, '→', nav.to?.url.pathname)
  },
  after_navigate,
})

// Long-lived router: history + <a> bindings
// Also immediately processes the current location
router.init()
mount(App, {target: document.body, props})
```

## API

### new Navgo(routes?, options?)

Returns: `Router`

#### `routes`

Type: `Array<RouteTuple | RouteGroup>`

Navgo accepts **flat** routes (tuples) _and/or_ nested **route groups** (objects) for layouts + shared loaders.

**RouteTuple**

Each route tuple is `[pattern, data?, extra?]` whose first item is the pattern and whose second item is hooks (see “Route Hooks”). The optional third item is extra hooks and is merged with the second item (third wins; `param_rules` are merged by key).

**RouteGroup**

Each route group is an object:

```js
{
  layout?: any,
  loader?: (ctx) => LoadPlan | Promise<unknown>,
  before_route_leave?: (nav) => void,
  routes: Array<RouteTuple|RouteGroup>
}
```

- `layout` is forwarded into `nav.to.matches` (the router does not render anything).
- `loader` runs for every matched child route in the group.
- `before_route_leave` runs when leaving a matched route within the group.

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
  - App-level hook called once per navigation attempt after the per-route guard and before loader/URL update. May call `nav.cancel()` synchronously to prevent navigation.
- `after_navigate`: `(nav: Navigation, on_revalidate?: (cb: () => void) => void) => void | Promise<void>`
  - App-level hook called after routing completes (URL updated, data loaded). `nav.to.data` holds any loader data.
  - If the active route uses SWR and a stale entry is revalidated in the background, register a callback via `on_revalidate(cb)` to refresh UI.
- `tick`: `() => void | Promise<void>`
  - Awaited after `after_navigate` and before scroll handling; useful for frameworks to flush DOM so anchor/top scrolling lands correctly.
- `scroll_to_top`: `boolean` (default `true`)
  - When `false`, skips the default top scroll for non-hash navigations.
- `aria_current`: `boolean` (default `false`)
  - When `true`, sets `aria-current="page"` on active in-app links.
- `preload_delay`: `number` (default `20`)
  - Delay in ms before hover preloading triggers.
- `preload_on_hover`: `boolean` (default `true`)
  - When `false`, disables hover/touch preloading.
- `attach_to_window`: `boolean` (default `true`)
  - When `true`, `init()` attaches the instance to `window.navgo` for convenience.
- `load_plan_defaults`: `{ parse?: Parser; cache?: { strategy?: CacheStrategy; ttl?: number; tags?: string[] } }`
  - Defaults applied to LoadPlan entries when `parse`/`cache` are omitted.
  - Default: `{ parse: 'json', cache: { strategy: 'swr', ttl: 86_400_000 } }`
- `search`: `SearchOptions`
  - Default behavior for keeping URL search params in sync with `router.search_params`.
  - Can be overridden per-route via `search_options`.

Important: Navgo only processes routes that match your `base` path.

### Instance stores

- `router.route` -- `Writable<{ url: URL; route: RouteTuple|null; params: Params; matches: Match[]; search_params: Record<string, unknown> }>`
  - Readonly property that holds the current snapshot.
  - Subscribe to react to changes; Navgo updates it on every URL change.
- `router.is_navigating` -- `Writable<boolean>`
  - `true` while a navigation is in flight (between start and completion/cancel).
- `router.search_params` -- `Writable<Record<string, unknown>>`
  - Writable store of validated search params for the **current** route.
  - If the current route defines a `search_schema`, this store is kept in sync with the URL.
  - Writing to it updates the URL search string (optionally debounced).

Example:

```svelte
Current path: {$route.path}
<div class="request-indicator" class:active={$is_navigating}></div>

<script>
const router = new Navgo(...)
const {route, is_navigating} = router
</script>
```

### Search Params

Navgo can keep a route-scoped search params store in sync with the URL.

- Define a Valibot `search_schema` on a route tuple **and/or** a route group.
- Navgo validates + applies defaults, and exposes the result:
  - as `router.search_params` (Svelte store)
  - as `search_params` on `router.route` (snapshot: `$route.search_params`)
  - as `ctx.search_params` inside loaders
- Update `router.search_params` to update the URL search string.

Only keys declared in the schema are managed. Other query params are preserved.

Coercion is **default-driven**: if a schema default is a number or boolean, Navgo will coerce URL values
from strings before validation. Plain strings are not JSON-parsed, so `?q=true` stays `'true'` when `q`
defaults to a string.

#### Defining a schema

Navgo re-exports Valibot as `v`, so you can import it from `navgo` (useful with pnpm, which doesn't allow importing undeclared transitive deps).

```js
// routes/Products.svelte
import { v } from 'navgo'

export const search_schema = v.object({
  q: v.optional(v.fallback(v.string(), ''), ''),
  page: v.optional(v.fallback(v.number(), 1), 1),
	// arrays are supported
	tag: v.optional(v.fallback(v.array(v.string()), []), []),
	cat: v.optional(v.fallback(v.array(v.string()), []), []),
})

export const search_options = {
  debounce: 300,
  push_history: true,
  show_defaults: false,
  sort: true,
	// arrays default to 'repeat' (?tag=a&tag=b). When using a map, `default` is the fallback for keys you don't list.
	array_style: { default: 'repeat', cat: 'csv' },
}
```

If multiple matched layout groups define a `search_schema`, the most specific (closest) one wins. If the leaf route defines a `search_schema`, it wins over any layout schema (no merging).

#### Updating in a component

```svelte
<script>
  const { search_params } = router
</script>

<input
  value={$search_params.q ?? ''}
  oninput={(e) => ($search_params = { ...$search_params, q: e.target.value, page: 1 })}
/>
```

Notes:

- Writes are **shallow** (URL changes via `replace_state` / `push_state`), so loaders are not re-run automatically.
- If you want a full navigation, call `router.goto(...)` with a new URL.

### Route Hooks

Load plans let you define one or more fetches that Navgo can cache via the CacheStorage API.

```js
// sync => treated as a LoadPlan
function loader({params}) {
  return {
    product: `https://dummyjson.com/products/${params.id}`,
    reviews: {
      request: `https://example.com/reviews/${params.id}`,
      cache: {strategy: 'cache-first', ttl: 60_000, tags: ['reviews']},
    },
  }
}

// async => treated as plain data
async function loader(ctx) {
  return {session: await ctx.fetch('/api/session').then(r => r.json())}
}
```

Global defaults for LoadPlans can be set in `options`:

```js
const router = new Navgo(routes, {
  load_plan_defaults: {
    parse: 'json',
    cache: { strategy: 'swr', ttl: 60_000 },
  },
})
```

See `examples.md` for more setups.


- param_rules?: `Record<string, ParamRule>`
  - Each rule is either a Valibot schema or `{ schema, coercer }`.
  - Schema runs on raw params; when it succeeds, the schema output replaces the param value.
  - Coercers run after schema and may transform params before `validate(...)`/`loader`.
- loader?(ctx: LoaderContext): `LoadPlan | Promise<unknown>`
  - If you return a **non-Promise object**, it is treated as a `LoadPlan` and executed (each entry can be cached).
  - If you return a **Promise**, it is awaited and the resolved value becomes `nav.to.data`.
  - To return a plain object as data, make the loader `async`.
- validate?(params): `boolean | Promise<boolean>`
  - Predicate called during matching. If it returns or resolves to `false`, the route is skipped.
- before_route_leave?(nav): `(nav: Navigation) => void`
  - Guard called once per navigation attempt on the current route (leave). Call `nav.cancel()` synchronously to prevent navigation. For `popstate`, cancellation auto-reverts the history jump.
- search_schema?: `any`
  - Valibot object schema whose output becomes `router.search_params` and `ctx.search_params`.
  - Can also be placed on route groups (layouts) to share search params across children.
- search_options?: `SearchOptions`
  - Overrides `options.search` for this route (e.g. debounce and history behavior).

The `Navigation` object contains:

```ts
{
  type: 'link' | 'goto' | 'popstate' | 'leave',
  from: { url, params, route, matches } | null,
  to:   { url, params, route, matches, data } | null,
  will_unload: boolean,
  cancelled: boolean,
  event?: Event,
  cancel(): void
}
```

`nav.to.matches` is ordered **outer → inner** and contains both layouts and the final route:

```js
for (const m of nav.to?.matches || []) {
  if (m.type === 'layout') console.log('layout', m.layout, m.data)
  if (m.type === 'route') console.log('route', m.route?.[0], m.data)
}
```

#### Order & cancellation:

- Router calls `before_route_leave` on the current route (leave).
- Call `nav.cancel()` synchronously to cancel.
  - For `link`/`goto`, it stops before URL change.
  - For `popstate`, cancellation causes an automatic `history.go(...)` to revert to the previous index.
  - For `leave`, cancellation triggers the native “Leave site?” dialog (behavior is browser-controlled).

Example:

```js
const routes = [
  [
    '/account/:account_id',
    {
      param_rules: {
        account_id: v.pipe(v.string(), v.toNumber(), v.minValue(1)),
      },
      loader: ({params}) => fetch(`/api/account/${params.account_id}`).then(r => r.json()),
      before_route_leave(nav) {
        if (nav.type === 'link' || nav.type === 'goto') {
          if (!confirm('Leave account settings?')) nav.cancel()
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

Runs any matching route `loader` before updating the URL and then updates history. Route processing triggers `after_navigate`. Use `replace: true` to replace the current history entry.

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

- `mousemove` (hover) -- after a short delay, hovering an in-app link triggers `preload(href)`.
- `touchstart` and `mousedown` (tap) -- tapping or pressing on an in-app link also triggers `preload(href)`.

Preloading applies only to in-app anchors that match the configured [`base`](#base). You can tweak this behavior with the `preload_delay` and `preload_on_hover` options.

Notes:

- `preload(uri)` is a no-op when `uri` formats to the current route's path (already loaded).

### Scroll persistence

On `beforeunload`, the current scroll position is saved to `sessionStorage` and restored on the next load of the same URL (e.g., refresh or tab restore).

### Scroll Restoration (areas)

Navgo caches/restores scroll positions for the window and any scrollable element that has a stable identifier:

- Give your element either an `id` or `data-scroll-id="..."`.
- Navgo listens to `scroll` globally (capture) and records positions per history entry.
- On `popstate`, it restores matching elements before paint.

Example:

```html
<div id="pane" class="overflow-auto">...</div>
```

Or with a custom id:

```html
<div data-scroll-id="pane">...</div>
```

### preload(uri)

Returns: `Promise<unknown | void>`

Preload a route's `loader` data for a given `uri` without navigating. Concurrent calls for the same path are deduped.
Note: Resolves to `undefined` when the matched route has no `loader`.

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

- `link` -- user clicked an in-app `<a>` that matches `base`.
- `goto` -- programmatic navigation via `router.goto(...)`.
- `popstate` -- browser back/forward.
- `leave` -- page is unloading (refresh, external navigation, tab close) via `beforeunload`.

The router passes the type to your `before_route_leave(nav)` hooks (route tuples and route groups).

### Matching and Params

- A matchable route is a `[pattern, data?]` tuple. Route groups are wrappers that add layouts/shared loaders.
- `pattern` can be a string (compiled with `regexparam`) or a `RegExp`.
- Named params from string patterns populate `params` with `string` values; optional params that do not appear are `null`.
- Wildcards use the `'*'` key.
- RegExp named groups also populate `params`; omitted groups can be `undefined`.
- If `data.param_rules` is present, each `params[k]` schema runs first (schema output replaces the param), then coercers run to transform params.
- If `data.validate(params)` returns or resolves to `false`, the route is also skipped.

### Data Flow

For `link` and `goto` navigations that match a route:

```
[click <a>] or [router.goto()]
        → before_route_leave({ type })  // per-route guard
        → before_navigate(nav)        // app-level start
            → cancelled? yes → stop
            → no → run loaders (layouts → route)  // each may be value, Promise, or Promise[]
            → cache data by formatted path
            → history.push/replaceState(new URL)
            → after_navigate(nav)
            → tick()?                 // optional app-provided await before scroll
            → scroll restore/hash/top
```

- If a loader throws/rejects, navigation continues and `after_navigate(..., with nav.to.data = { __error })` is delivered so UI can render an error state.
- For `popstate`, the route's `loader` runs before completion so content matches the target entry; this improves scroll restoration. Errors are delivered via `after_navigate` with `nav.to.data = { __error }`.

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
- On `link`/`goto` (after route commit):
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

- `format(uri)` -- normalizes a path relative to `base`. Returns `false` when `uri` is outside of `base`.
- `match(uri)` -- returns a Promise of `{ route, params } | null` using string/RegExp patterns and `param_rules` (Valibot schemas). Awaits an async `validate(params)` if provided.
- `goto(uri, { replace? })` -- fires route-level `before_route_leave('goto')`, calls global `before_navigate`, saves scroll, runs loader, pushes/replaces, and completes via `after_navigate`.
- `init()` -- wires global listeners (`popstate`, `pushstate`, `replacestate`, click) and optional hover/tap preloading; immediately processes the current location.
- `destroy()` -- removes listeners added by `init()`.
- `preload(uri)` -- pre-executes a route's `loader` for a path and caches the result; concurrent calls are deduped.
- `push_state(url?, state?)` -- shallow push that updates the URL and `history.state` without route processing.
- `replace_state(url?, state?)` -- shallow replace that updates the URL and `history.state` without route processing.

### Param rules (Valibot)

Use Valibot schemas in `param_rules` to validate/transform route params before `validate(...)`/`loader`.

# Credits

This router integrates ideas and small portions of code from these fantastic projects:

- SvelteKit -- https://github.com/sveltejs/kit
- navaid -- https://github.com/lukeed/navaid
- TanStack Router -- https://github.com/TanStack/router
