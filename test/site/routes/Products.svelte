<h1 class="mb-2 text-2xl font-semibold">Products</h1>
<p class="opacity-80">
	Loaded from DummyJSON with caching. Click a product to open a shallow modal (URL updates via
	<span class="font-mono">push_state</span>/<span class="font-mono">replace_state</span>).
</p>

{#if data?.__meta}
	<div class="mt-4 rounded-md border border-gray-200 bg-white p-4 text-sm">
		<div class="flex flex-wrap items-center gap-2">
			<span class="font-mono">sources</span>:
			<span class="font-mono">{JSON.stringify(data.__meta.source)}</span>
		</div>
		<div class="mt-2 flex flex-wrap gap-2">
			<button
				class="rounded bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700"
				onclick={() => router.invalidate('products')}>invalidate('products')</button
			>
		</div>
	</div>
{/if}

<ul class="mt-6 grid gap-4 sm:grid-cols-2">
	{#each items as p (p.id)}
		<li class="rounded-md border border-gray-200 bg-white p-3">
			<button
				class="flex w-full gap-3 text-left"
				onclick={() => open_product(p.id)}
				aria-label={`View ${p.title}`}>
				<img
					class="h-20 w-20 flex-none rounded object-cover"
					src={p.thumbnail}
					alt={p.title}
					loading="lazy" />
				<div class="min-w-0">
					<h2 class="truncate font-semibold">{p.title}</h2>
					<p class="mt-1 line-clamp-3 text-sm opacity-80">{p.description}</p>
					<div class="mt-2 flex flex-wrap gap-2 text-xs">
						<span class="rounded bg-gray-100 px-2 py-1">${p.price}</span>
						<span class="rounded bg-gray-100 px-2 py-1">⭐ {p.rating}</span>
					</div>
				</div>
			</button>
		</li>
	{/each}
</ul>

<dialog
	bind:this={dlg}
	class="fixed w-[92vw] max-w-lg rounded-md p-0 shadow-xl"
	onclose={close_modal}>
	{#if selected}
		<div class="grid gap-4 p-4">
			<div class="flex items-start justify-between gap-3">
				<h2 class="text-lg font-semibold">{selected.title}</h2>
				<button
					class="rounded bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200"
					onclick={close_modal}>
					Close
				</button>
			</div>
			<img
				class="aspect-video w-full rounded object-cover"
				src={selected.thumbnail}
				alt={selected.title} />
			<p class="text-sm opacity-80">{selected.description}</p>
			<div class="flex flex-wrap gap-2 text-xs">
				<span class="rounded bg-gray-100 px-2 py-1">price: ${selected.price}</span>
				<span class="rounded bg-gray-100 px-2 py-1">rating: {selected.rating}</span>
			</div>
			<div class="pt-2">
				<a class="text-blue-700 hover:underline" href={`/products/${selected.id}`}>
					Go to /products/{selected.id}
				</a>
			</div>
		</div>
	{/if}
</dialog>

<script module>
const PRODUCTS_URL =
	'https://dummyjson.com/products?limit=30&select=title,description,price,rating,thumbnail,images'

export function loader() {
	return {
		products: {
			request: PRODUCTS_URL,
			cache: {strategy: 'swr', ttl: 10_000, tags: ['products']},
		},
	}
}
</script>

<script>
let {data = null, router} = $props()
const {route} = router

let dlg = $state(null)

const items = $derived(data?.products?.products ?? [])
const product_id = $derived($route.url?.searchParams.get('product') ?? '')
const selected = $derived(items.find(p => String(p.id) === product_id) ?? null)

function open_product(id) {
	router.push_state(`?product=${id}`)
}

function close_modal() {
	router.replace_state('/products')
}

$effect(() => {
	if (!dlg) return
	if (product_id) {
		if (!dlg.open) dlg.showModal()
	} else {
		if (dlg.open) dlg.close()
	}
})
</script>
