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
const router = new Navgo([['/', Home], ['/settings', Settings]], { base: '/app' })
```

## Nested layouts

Use a `RouteGroup` for layouts + shared hooks.

```js
const routes = [
	{
		layout: AppLayout,
		routes: [
			['/', Home],
			['/products', Products],
			{
				layout: AdminLayout,
				routes: [['/admin', AdminHome], ['/admin/users', AdminUsers]],
			},
		],
	},
]
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
const routes = [
	[
		'/users/:id',
		User,
		{
			param_rules: {
				id: { validator: Navgo.validators.int({ min: 1 }), coercer: Number },
			},
			validate(params) {
				// params.id is already coerced by this point
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
	loader: async (ctx) => {
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
