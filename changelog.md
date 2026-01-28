# Changelog

## v6

- add route groups for nested layouts/shared loaders; expose ordered `matches` (layouts → route) on `nav.to.matches` and `router.route`
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
- add `load_plan_defaults` option to set default `parse`/`cache` values for LoadPlans

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
const routes = [
	['/account/:id', { loader: ctx => ctx.fetch('/api/account').then(r => r.json()) }],
]
```

After:

```js
const routes = [
	{
		layout: { default: 'AccountLayout' },
		loader: async ctx => ctx.fetch('/api/session').then(r => r.json()),
		routes: [['/account/:id', { loader: async ctx => ctx.fetch('/api/account').then(r => r.json()) }]],
	},
]

// in after_navigate:
// const session = nav.to?.matches?.[0]?.data
// const account = nav.to?.data
```
