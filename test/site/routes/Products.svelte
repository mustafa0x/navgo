<h1 class="mb-2 text-2xl font-semibold">Products</h1>
<p class="mb-4 opacity-80">A demo list fetched from DummyJSON products.</p>

{#if items.length}
    <ul class="grid gap-4 sm:grid-cols-2">
        {#each items as p (p.id)}
            <li class="flex gap-3 rounded-md border border-gray-200 bg-white p-3">
                <button
                    class="flex gap-3 text-left"
                    onclick={() => router.push_state(`?product=${p?.id}`)}
                    aria-label={`View ${p.title}`}
                >
                    <img
                        alt={p.title}
                        src={p.thumbnail || p.images?.[0]}
                        width="96"
                        height="96"
                        class="h-24 w-24 rounded bg-gray-100 object-cover"
                        loading="lazy"
                    />
                    <div class="min-w-0">
                        <h3 class="truncate font-medium">{p.title}</h3>
                        <p class="line-clamp-2 text-sm opacity-80">{p.description}</p>
                        <div class="mt-2 font-mono text-sm">
                            <span class="font-semibold">${p.price}</span>
                            <span class="ml-2 opacity-70">⭐ {p.rating}</span>
                        </div>
                    </div>
                </button>
            </li>
        {/each}
    </ul>
{:else}
    <p class="opacity-70">No projects loaded.</p>
{/if}

<dialog bind:this={dlg} class="w-[92vw] max-w-lg rounded-md p-0 shadow-xl">
    {#if selected}
        <header class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h3 class="truncate pr-2 font-semibold">{selected.title}</h3>
            <button
                class="rounded px-2 py-1 text-sm hover:bg-gray-100"
                onclick={() => router.replace_state('/products')}
                aria-label="Close">✕</button
            >
        </header>
        <div class="grid gap-3 p-4">
            <img
                alt={selected.title}
                src={selected.thumbnail || selected.images?.[0]}
                class="w-full rounded bg-gray-100 object-cover"
                loading="lazy"
            />
            <p class="text-sm opacity-80">{selected.description}</p>
            <div class="font-mono text-sm">
                <span class="font-semibold">${selected.price}</span>
                <span class="ml-2 opacity-70">⭐ {selected.rating}</span>
                <span class="ml-2 opacity-70">ID: {selected.id}</span>
            </div>
        </div>
        <footer class="flex justify-end border-t border-gray-200 px-4 py-3">
            <button
                class="rounded bg-gray-800 px-3 py-1.5 text-white hover:bg-black"
                onclick={() => router.replace_state('/products')}>Close</button
            >
        </footer>
    {/if}
</dialog>

<script module>
// Used by the router before navigating to /products
export async function loaders() {
    // await new Promise(r => setTimeout(r, 1000))
    return fetch('https://dummyjson.com/products').then(r => r.json())
}
</script>

<script>
import {getContext} from 'svelte'
let {params, data = null} = $props()
const router = getContext('router')
const route = getContext('route')

// Prefer preloaded list; use fetched fallback when navigating directly
let fetched = $state(null)
const items = $derived(data?.products ?? fetched?.products ?? [])

let selected = $state(null)
let dlg

function openProduct(p) {
    selected = p
    dlg?.showModal?.()
}

function closeProduct() {
    if (dlg?.open) dlg.close()
    // router.replace_state('/products')
    selected = null
}

if (!data?.products) {
    loaders()
        .then(json => {
            if (Array.isArray(json?.products)) data = json
        })
        .catch(() => {})
}

// Open modal on landing via /products?product=...
let last_pid = null
$effect(() => {
    const pid = route.url.searchParams.get('product')
    if (pid && last_pid != pid) {
        const found = items.find(p => String(p.id) === String(pid))
        if (found)
            setTimeout(() => {
                openProduct(found)
            })
    }
    last_pid = pid
    if (!pid && selected) closeProduct()
})
</script>
