<h1 class="mb-2 text-2xl font-semibold">Cache</h1>
<p class="opacity-80">
	This page loads multiple resources via a <span class="font-mono">LoadPlan</span> so you can see caching
	strategies and invalidation.
</p>

<div class="mt-4 grid gap-3 rounded-md border border-gray-200 bg-white p-4 text-sm">
	<div class="flex flex-wrap items-center gap-2">
		<span class="font-mono">sources</span>:
		<span class="font-mono">{JSON.stringify(sources)}</span>
	</div>
	<div class="flex flex-wrap gap-2">
		<button
			class="rounded bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700"
			onclick={() => router.invalidate('products')}>invalidate('products')</button
		>
		<button
			class="rounded bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700"
			onclick={() => router.invalidate('posts')}>invalidate('posts')</button
		>
		<button
			class="rounded bg-gray-700 px-3 py-1.5 text-white hover:bg-black"
			onclick={() => router.invalidate([PRODUCTS_URL, POSTS_URL])}>invalidate([url, url])</button
		>
	</div>
</div>

<div class="mt-6 grid gap-4">
	<section class="rounded-md border border-gray-200 bg-white p-4">
		<h2 class="mb-2 font-semibold">Products (SWR, ttl=2s)</h2>
		<ul class="grid gap-1 text-sm">
			{#each products as p (p.id)}
				<li class="flex items-center justify-between gap-3">
					<a class="text-blue-700 hover:underline" href={`/products/${p.id}`}>{p.title}</a>
					<span class="font-mono opacity-70">${p.price}</span>
				</li>
			{/each}
		</ul>
	</section>

	<section class="rounded-md border border-gray-200 bg-white p-4">
		<h2 class="mb-2 font-semibold">Posts (cache-first, ttl=60s)</h2>
		<ul class="grid gap-1 text-sm">
			{#each posts as post (post.id)}
				<li>
					<a class="text-blue-700 hover:underline" href={`/posts/${post.id}`}>{post.title}</a>
				</li>
			{/each}
		</ul>
	</section>

	<section class="rounded-md border border-gray-200 bg-white p-4">
		<h2 class="mb-2 font-semibold">User (network-first, ttl=15s)</h2>
		{#if user}
			<div class="text-sm">
				<div><span class="font-mono">name</span>: {user.firstName} {user.lastName}</div>
				<div><span class="font-mono">age</span>: {user.age}</div>
			</div>
		{/if}
	</section>

	<section class="rounded-md border border-gray-200 bg-white p-4">
		<h2 class="mb-2 font-semibold">Quote (no-store)</h2>
		{#if quote}
			<p class="text-sm italic">“{quote.quote}”</p>
			<p class="mt-1 text-xs opacity-70">— {quote.author}</p>
		{/if}
	</section>
</div>

<script module>
const PRODUCTS_URL = 'https://dummyjson.com/products?limit=10&skip=10&select=title,price'
const POSTS_URL = 'https://dummyjson.com/posts?limit=10&skip=10&select=title,reactions,userId'

export function loader() {
	return {
		products: {
			request: PRODUCTS_URL,
			cache: {strategy: 'swr', ttl: 2000, tags: ['products']},
		},
		posts: {
			request: POSTS_URL,
			cache: {strategy: 'cache-first', ttl: 60_000, tags: ['posts']},
		},
		user: {
			request: 'https://dummyjson.com/users/1',
			cache: {strategy: 'network-first', ttl: 15_000, tags: ['users']},
		},
		quote: {
			request: 'https://dummyjson.com/quotes/random',
			cache: {strategy: 'no-store'},
		},
	}
}
</script>

<script>
let {data, router} = $props()

const sources = $derived(data?.__meta?.source ?? {})
const products = $derived(data?.products?.products ?? [])
const posts = $derived(data?.posts?.posts ?? [])
const user = $derived(data?.user ?? null)
const quote = $derived(data?.quote ?? null)

const PRODUCTS_URL = 'https://dummyjson.com/products?limit=10&skip=10&select=title,price'
const POSTS_URL = 'https://dummyjson.com/posts?limit=10&skip=10&select=title,reactions,userId'
</script>
