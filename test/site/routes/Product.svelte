<h1 class="mb-2 text-2xl font-semibold">Product #{params.id}</h1>
<p class="opacity-80">A nested route that fetches a single product.</p>

{#if data?.__meta}
	<div class="mt-4 rounded-md border border-gray-200 bg-white p-4 text-sm">
		<div class="flex flex-wrap items-center gap-2">
			<span class="font-mono">sources</span>:
			<span class="font-mono">{JSON.stringify(data.__meta.source)}</span>
		</div>
		<div class="mt-2 flex flex-wrap gap-2">
			<button
				class="rounded bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700"
				onclick={() => router.invalidate(['products', `product:${params.id}`])}
				>invalidate(['products', `product:${params.id}`])</button
			>
		</div>
	</div>
{/if}

{#if product}
	<section class="mt-6 rounded-md border border-gray-200 bg-white p-4">
		<h2 class="text-lg font-semibold">{product.title}</h2>
		<p class="mt-2 text-sm opacity-80">{product.description}</p>
		<div class="mt-3 flex flex-wrap gap-2 text-xs">
			<span class="rounded bg-gray-100 px-2 py-1">price: ${product.price}</span>
			<span class="rounded bg-gray-100 px-2 py-1">rating: {product.rating}</span>
			<span class="rounded bg-gray-100 px-2 py-1">brand: {product.brand}</span>
			<span class="rounded bg-gray-100 px-2 py-1">category: {product.category}</span>
		</div>
	</section>
{/if}

<div class="mt-6">
	<a class="text-blue-700 hover:underline" href="/products">Back to products</a>
</div>

<script module>
export function loader({params}) {
	const id = params.id
	return {
		product: {
			request: `https://dummyjson.com/products/${id}`,
			cache: {strategy: 'swr', ttl: 10_000, tags: ['products', `product:${id}`]},
		},
	}
}
</script>

<script>
let {params, data, router} = $props()
const product = $derived(data?.product ?? null)
</script>
