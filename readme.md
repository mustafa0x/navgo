## Navgo × Svelte (SPA)

Browser-only, Svelte-first client router. Intercepts in-app links, preloads on hover/tap, restores scroll (window and areas), supports shallow URL updates, and exposes simple hooks and stores.

## Install

```
pnpm add navgo
```

## Quick start (Svelte 5)

Define route tuples with `import * as` so each tuple holds the Svelte module namespace (component as `default` plus optional route hooks).

```js
// main.js (ESM)
import { mount } from 'svelte'
import Navgo from 'navgo'

import AppCmp from './App.svelte'
import * as HomeRoute from './Home.svelte'
import * as IbnAashoorRoute from './IbnAashoor.svelte'
import * as ReaderRoute from './Reader.svelte'

/** @type {Array<[string|RegExp, any]>} */
const routes = [
  ['/', HomeRoute],
  ['/ibn-aashoor', IbnAashoorRoute],
  ['/:tafsir', ReaderRoute],
]

// keep UI state in whatever you like; here we use Svelte 5 runes
const props = $state({ Component: null, route_data: null, is_404: false })

function after_navigate(nav) {
  props.is_404 = nav.to?.data?.__error?.status === 404
  props.route_data = nav.to?.data ?? null
  props.Component = nav.to?.route?.[1]?.default || null
}

const router = new Navgo(routes, { after_navigate })
await router.init()
mount(AppCmp, { target: document.body, props })
```

Minimal `App.svelte` to render the active route:

```svelte
<script>
  export let Component
  export let route_data
  export let is_404 = false
</script>

{#if is_404}
  <p>Not found.</p>
{:else if Component}
  <svelte:component this={Component} {route_data} />
{/if}
```

## Route modules (per‑route hooks)

Because routes are `import * as Module`, you can export hooks next to the component. All are optional.

```svelte
<!-- Home.svelte -->
<script module>
  export const param_validators = { id: v => /^\d+$/.test(v) }
  export async function loader(params) {
    return fetch('/api/home').then(r => r.json())
  }
  export function validate(_params) { return true }
  export function before_route_leave(nav) {
    if (nav.type !== 'popstate' && !confirm('Leave home?')) nav.cancel()
  }
  // You can also import helpers like: import Navgo from 'navgo'; Navgo.validators.int(...)
  // and return data that will be available as nav.to.data
  // Component receives it via the {route_data} prop
</script>

<script>
  export let route_data
</script>

<h1>Home</h1>
<pre>{JSON.stringify(route_data, null, 2)}</pre>
```

## App‑level hooks and stores

- `before_navigate(nav)` — runs before loaders/URL; call `nav.cancel()` to stop.
- `after_navigate(nav)` — runs after route commit; `nav.to?.data` holds loader result or `{ __error }`.
- `router.route` — Svelte store of `{ url, route, params }`.
- `router.is_navigating` — `true` while a navigation is in flight.

Svelte’s `tick` is used internally so anchors/top scroll correctly; you don’t need to pass it.

## Links, preloading, scrolling

- Intercepts in‑app `<a href>` for same‑origin links under `base`.
- Hover/tap preloading is on by default; disable via `preload_on_hover: false`.
- Restores window and scroll‑area positions on `popstate`; anchors scroll when URL has a hash; otherwise scrolls to top.

## Shallow routing

Update URL/state without running routing:

```js
router.push_state('/app?tab=1')
router.replace_state('/app?tab=2', { foo: 'bar' })
```

## API (brief)

- `new Navgo(routes?, opts?)` — create router. `routes` is `Array<[string|RegExp, any]>`.
- `router.init()` — attach listeners and process current location.
- `router.goto(url, { replace? })` — run loader, update URL/history.
- `router.preload(url)` — run loader without navigating (deduped per path).
- `router.push_state(url?, state?)` / `router.replace_state(url?, state?)` — shallow updates.
- `router.destroy()` — remove listeners.

Supported patterns: static, params (`/users/:id`), optional params (`:id?`), wildcards (`*`), RegExp (with optional named groups).

## Notes

- SPA only; SSR not supported.
- Prefer defining routes with `import * as` modules so hooks live next to components.
- Keep things simple — Navgo avoids framework abstractions and overcautious checks.

