# Changelog

## v6.0.13

- breaking: restore refresh/tab-restore scroll from session storage by history entry before the initial route boot, aligning the timing with SvelteKit
  - migration:
    - if you relied on v6.0.12 leaving refresh restoration entirely to the browser, remove any app-level workaround that re-applies scroll after `router.init()`

## v6.0.12

- breaking: stop Navgo from restoring refresh/tab-restore scroll on initial load; native browser restoration now owns that path
  - migration:
    - if you relied on Navgo's `sessionStorage`-based refresh restore, move that behavior into app code or rely on the browser's native restoration instead

## v6.0.8

- breaking: make search-schema transitions atomic by publishing `router.route` before global `router.search_params`, with sync guard across both writes
  - note: `router.route.subscribe(...)` now fires before `router.search_params` updates on search-schema transitions

## v6.0.7

- add `nav.status` as the formal HTTP-like status for completed navigations
- add route-level `ssr = {serve_shell, refresh_every}` exports
- add bidirectional `rewrite` hooks so apps can map public URLs to a canonical internal route tree and back again
- add `router.href()` for building public in-app links from canonical internal targets
- expose `internal_url`, `path`, and `context` on navigation targets, the route store, and loader/search hook contexts

## v6.0.6

- add `data.__meta.preloads` for executed LoadPlans so consumers can reuse same-origin request URLs
  for SSR preload headers

## v6.0.5

- fix hash-only back scroll restoration when a pending same-page hash click is cancelled before its `hashchange` settles

## v6.0.4

- add `router.search_params.toString()` on the store object to serialize the current managed query string without colliding with a real `toString` search param key

## v6

- add route groups for nested layouts/shared loaders; expose ordered `matches` (layouts → route) on `nav.to.matches` and `router.route`
- add optional route group `id`s plus keyed `layouts` lookups on navigation targets, `match()`, and `router.route` for direct access to shared layout/group data
  - migration:
    - before: `const app_data = nav.to?.matches?.find(m => m.type === 'layout')?.data`
    - after: `const app_data = nav.to?.layouts?.app?.data`
  - docs/typed surfaces now describe `match()` as returning `{ route, params, matches, layouts }` and `window.navgo.route` as including `layouts`
  - covered on direct `match()`, completed navigations, `popstate`, and preload-reused navigations
- run group loaders (and group `before_route_leave`) for matched child routes; preload caches the full loader chain and `goto` reuses it
- use `param_rules` for per-param validation + coercion (superseding `param_validators`, which has been removed)
  - example:
    - before: `param_validators: { id: v => typeof v === 'string' && /^\d+$/.test(v) }`
    - after: `param_rules: { id: v.pipe(v.string(), v.toNumber(), v.minValue(1)) }`
- breaking: remove `Navgo.validators`; `param_rules` now accepts Valibot schemas (or `{ schema, coercer }`)
  - migration:
    - before: `param_rules: { id: { validator: Navgo.validators.int({ min: 1 }), coercer: Number } }`
    - after: `param_rules: { id: v.pipe(v.string(), v.toNumber(), v.minValue(1)) }`
- remove `url_changed` option (deprecated migration hook)
  - migrate to `router.route.subscribe(...)` or `after_navigate(...)` for URL change notifications
- treat search params as part of preload identity (e.g. `/foo?x=1` and `/foo?x=2` preload separately)
- add typed search params via Valibot (`search_schema` + `search_options`) and a `router.search_params` store that syncs with the URL (optionally debounced)
  - expose snapshot on `router.route.search_params` for convenient reads (`$route.search_params`)
  - parse/coerce URL values based on schema defaults (strings are not JSON-parsed by default)
  - fix array round-tripping with configurable `array_style` (`repeat`/`csv`/`json`)
  - apply defaults per-field when validation fails (valid keys are preserved)
- add `router.nav` to expose the last completed navigation object
- add `load_plan_defaults` option to set default `parse`/`cache` values for LoadPlans
- breaking: `before_navigate(nav)` now runs after matching (so `nav.to` includes `route/params/matches`) and can cancel navigations; it does not run for the initial `init()` navigation
  - migration:
    - if you relied on `before_navigate` running on initial load, move that logic to `after_navigate` or run it after `await router.init()`
    - if you relied on `nav.to === null`, update to use `nav.to.url` / `nav.to.route` / `nav.to.params`
    - if you relied on `goto()`/`preload()` rejecting, handle errors via `nav.to.data.__error` (or logging) instead

### Migration: loaders (before/after)

If you were previously doing multi-fetch orchestration in the loader, you can now return a **LoadPlan** directly.

Before:

```js
// manual orchestration (old style)
const routes = [
  [
    '/dashboard',
    {
      async loader({ fetch }) {
        const [user, posts] = await Promise.all([
          fetch('/api/user').then(r => r.json()),
          fetch('/api/posts?limit=10').then(r => r.json()),
        ])
        return { user, posts }
      },
    },
  ],
]
```

After:

```js
// LoadPlan
const routes = [
  [
    '/dashboard',
    {
      loader() {
        return {
          user: '/api/user',
          posts: { request: '/api/posts?limit=10', cache: { strategy: 'swr', ttl: 5_000 } },
        }
      },
    },
  ],
]
```

Layout/group loaders now run for every matched child. Read their data from
`nav.to.matches[*].data` (leaf route data is still `nav.to.data`).

Before:

```js
const routes = [['/account/:id', { loader: ctx => ctx.fetch('/api/account').then(r => r.json()) }]]
```

After:

```js
const routes = [
  {
    layout: { default: 'AccountLayout' },
    loader: async ctx => ctx.fetch('/api/session').then(r => r.json()),
    routes: [
      ['/account/:id', { loader: async ctx => ctx.fetch('/api/account').then(r => r.json()) }],
    ],
  },
]

// in after_navigate:
// const session = nav.to?.matches?.[0]?.data
// const account = nav.to?.data
```
