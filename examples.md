# Navgo examples

This file shows a bunch of common `routes` setups and loader patterns.

## Minimal flat routes

```js
import Navgo from 'navgo'

const routes = [
  ['/', Home],
  ['/about', About],
  ['/posts', Posts],
  ['/posts/:id', Post],
]

const router = new Navgo(routes)
router.init()
```

## Base path

If your app lives at `/app`, set `base` and keep patterns relative to it.

```js
const router = new Navgo(
  [
    ['/', Home],
    ['/settings', Settings],
  ],
  { base: '/app' },
)
```

## Public URL rewrites

Keep one canonical route tree and map public URLs in and out with `rewrite`.

```js
const locale_rewrite = {
  input({ url }) {
    const locale = url.pathname === '/en' || url.pathname.startsWith('/en/') ? 'en' : 'ar'
    if (locale === 'en') url.pathname = url.pathname.replace(/^\/en(?=\/|$)/, '') || '/'
    return { url, context: { locale } }
  },
  output({ url, context }) {
    if (context?.locale === 'en') url.pathname = url.pathname === '/' ? '/en' : `/en${url.pathname}`
    return { url, context }
  },
}

const router = new Navgo(
  [
    ['/', Home],
    ['/about', About],
    ['/contact', Contact],
  ],
  {
    rewrite: locale_rewrite,
  },
)
```

Generate public links from canonical internal paths:

```js
router.href('/contact') // uses current rewrite context
router.href('/contact', { context: { locale: 'en' } }) // '/en/contact'
router.goto('/contact', { context: { locale: 'en' } })
```

### Multilingual paths

Use one canonical route tree and translate the browser pathname per locale.

```js
const DEFAULT_LOCALE = 'ar'
const RTL_LOCALES = new Set(['ar'])

function translated_path(locale, internal_path) {
  return slug_map[locale]?.[internal_path] || internal_path
}

const slug_map = {
  ar: {
    '/': '/',
    '/about': '/حول',
    '/contact': '/اتصل',
    '/products': '/المنتجات',
  },
  en: {
    '/': '/en',
    '/about': '/en/about',
    '/contact': '/en/contact',
    '/products': '/en/products',
  },
}

const reverse_slug_map = Object.fromEntries(
  Object.entries(slug_map).flatMap(([locale, entries]) =>
    Object.entries(entries).map(([internal_path, public_path]) => [
      public_path,
      { locale, internal_path },
    ]),
  ),
)

const multilingual_rewrite = {
  input({ url }) {
    // Public browser URL -> canonical internal path.
    const hit = reverse_slug_map[url.pathname]
    if (!hit) return
    // Clone before mutating so the original public URL stays intact.
    const next = new URL(url.href)
    next.pathname = hit.internal_path
    return { url: next, context: { locale: hit.locale } }
  },
  output({ url, context, current }) {
    // Canonical internal path -> localized public browser URL.
    const locale = context?.locale ?? current?.context?.locale ?? DEFAULT_LOCALE
    // Clone before mutating so internal and public URLs can differ cleanly.
    const next = new URL(url.href)
    next.pathname = translated_path(locale, next.pathname)
    return { url: next, context: { locale } }
  },
}

const router = new Navgo(
  [
    ['/', Home],
    ['/about', About],
    ['/contact', Contact],
    ['/products', Products],
  ],
  {
    rewrite: multilingual_rewrite,
  },
)

router.href('/about', { context: { locale: 'ar' } }) // '/حول'
router.href('/about', { context: { locale: 'en' } }) // '/en/about'
```

What this gives you:

- `/products/widget` and `/en/products/widget` can hit the same canonical route
- `ctx.path` stays canonical while `nav.to.url.pathname` stays public
- `nav.to.context.locale` carries the selected locale through loaders and navigation
- `router.goto('/contact')` preserves the current locale automatically

Because `href()` and `goto()` stay canonical, a language switcher can reuse the current route:

```js
function switch_locale(next_locale) {
  return router.goto(router.nav.to?.path || '/', {
    context: { locale: next_locale },
    replace: true,
  })
}
```

If you already have the exact public browser URL, keep it as-is with `literal: true`:

```js
await router.goto('/en/products', { literal: true })
```

### Same slugs, language-prefixed

If the slug stays canonical and only the locale prefix changes, the rewrite can stay very small:

```js
const prefixed_locale_rewrite = {
  input({ url }) {
    const locale = url.pathname === '/en' || url.pathname.startsWith('/en/') ? 'en' : 'ar'
    if (locale === 'en') url.pathname = url.pathname.replace(/^\/en(?=\/|$)/, '') || '/'
    return { url, context: { locale } }
  },
  output({ url, context }) {
    const locale = context?.locale || 'ar'
    if (locale === 'en') url.pathname = url.pathname === '/' ? '/en' : `/en${url.pathname}`
    return { url, context: { locale } }
  },
}

const router = new Navgo(
  [
    ['/', Home],
    ['/about', About],
    ['/contact', Contact],
  ],
  {
    rewrite: prefixed_locale_rewrite,
  },
)

router.href('/about', { context: { locale: 'ar' } }) // '/about'
router.href('/about', { context: { locale: 'en' } }) // '/en/about'
router.goto('/contact', { context: { locale: 'en' } }) // browser URL: /en/contact
```

## Nested layouts

Use a `RouteGroup` for layouts + shared hooks.

```js
const routes = [
  {
    id: 'app',
    layout: AppLayout,
    routes: [
      ['/', Home],
      ['/products', Products],
      {
        id: 'admin',
        layout: AdminLayout,
        routes: [
          ['/admin', AdminHome],
          ['/admin/users', AdminUsers],
        ],
      },
    ],
  },
]
```

```js
function after_navigate(nav) {
  const app_data = nav.to?.layouts?.app?.data
  const admin_data = nav.to?.layouts?.admin?.data
}
```

## Guarding routes

```js
const routes = [
  [
    '/danger-zone',
    DangerZone,
    {
      before_route_leave(nav) {
        if (nav.type === 'link' || nav.type === 'goto') {
          if (!confirm('Enter the danger zone?')) nav.cancel()
        }
      },
    },
  ],
  ['/', Home],
]
```

## Param rules

```js
import { v } from 'navgo'

const routes = [
  [
    '/users/:id',
    User,
    {
      param_rules: {
        id: v.pipe(v.string(), v.toNumber(), v.minValue(1)),
      },
      validate(params) {
        // params.id is already transformed by this point
        return params.id < 10_000
      },
    },
  ],
]
```

## Loader basics

Loaders receive a `LoaderContext`.

```js
/** @type {import('navgo').Hooks} */
const hooks = {
  // NOTE: returning a Promise means "await the Promise and use the value"
  loader: async ctx => {
    console.log(ctx.url.pathname) // public browser URL
    console.log(ctx.internal_url.pathname) // canonical internal URL
    console.log(ctx.path) // canonical pathname used for matching
    console.log(ctx.context) // rewrite-provided metadata
    const res = await ctx.fetch(`/api/account/${ctx.params.id}`)
    return res.json()
  },
}
```

### Returning a plain object as data

Because **non-Promise objects** are treated as `LoadPlan`s, return plain object data via an async loader:

```js
loader: async () => ({ session: { user: 'Zara' } })
```

## LoadPlan caching

If a loader returns a **non-Promise object**, Navgo treats it as a `LoadPlan`:

```js
loader() {
	return {
		products: 'https://dummyjson.com/products',
		quote: {
			request: 'https://dummyjson.com/quotes/random',
			cache: { strategy: 'no-store' },
		},
	}
}
```

### FetchSpec options

```js
loader() {
	return {
		posts: {
			request: 'https://dummyjson.com/posts?limit=10&skip=0',
			parse: 'json',
			cache: {
				strategy: 'swr',
				ttl: 5_000,
				tags: ['posts'],
			},
		},
		ip: 'https://dummyjson.com/ip',
	}
}
```

### Dynamic URLs

```js
loader({ params }) {
	return {
		user: {
			request: `https://dummyjson.com/users/${params.id}`,
			cache: { strategy: 'swr', ttl: 10_000, tags: ['users', `user:${params.id}`] },
		},
	}
}
```

## Invalidation

Invalidate by URL/key:

```js
await router.invalidate('https://dummyjson.com/products')
```

Invalidate by tag:

```js
await router.invalidate('posts')
```

Invalidate multiple:

```js
await router.invalidate(['posts', 'users'])
```

## Responding to SWR revalidation

If a `LoadPlan` revalidates and updates `nav.to.data`, Navgo can notify you through `after_navigate`.

```js
const router = new Navgo(routes, {
  after_navigate(nav, on_revalidate) {
    // initial render
    render(nav.to?.data)

    // update when SWR revalidates (only when data actually changed)
    on_revalidate?.(() => {
      render(nav.to?.data)
    })
  },
})
```

## Mixing plan + non-plan loaders

A group loader can return plain data (Promise) while a leaf route returns a LoadPlan:

```js
const routes = [
  {
    layout: AppLayout,
    loader: async () => ({ session: { user: 'Zara' } }),
    routes: [
      [
        '/dashboard',
        Dashboard,
        {
          loader() {
            return {
              stats: 'https://dummyjson.com/carts',
              todos: 'https://dummyjson.com/todos?limit=5',
            }
          },
        },
      ],
    ],
  },
]
```
