<h1 class="text-2xl font-semibold mb-2">Products</h1>
<p class="opacity-80 mb-4">A demo list fetched from DummyJSON products.</p>

{#if items.length}
  <ul class="grid gap-4 sm:grid-cols-2">
    {#each items as p (p.id)}
      <li class="rounded-md border border-gray-200 bg-white p-3 flex gap-3">
        <button class="flex gap-3 text-left"
          onclick={() => openProduct(p)}
          aria-label={`View ${p.title}`}
        >
          <img alt={p.title} src={p.thumbnail || p.images?.[0]} width="96" height="96" class="h-24 w-24 rounded object-cover bg-gray-100" loading="lazy" />
          <div class="min-w-0">
            <h3 class="font-medium truncate">{p.title}</h3>
            <p class="text-sm opacity-80 line-clamp-2">{p.description}</p>
            <div class="mt-2 text-sm font-mono">
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

<dialog bind:this={dlg} class="rounded-md p-0 w-[92vw] max-w-lg shadow-xl">
  {#if selected}
    <header class="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
      <h3 class="font-semibold truncate pr-2">{selected.title}</h3>
      <button class="rounded px-2 py-1 text-sm hover:bg-gray-100" onclick={closeProduct} aria-label="Close">✕</button>
    </header>
    <div class="p-4 grid gap-3">
      <img alt={selected.title} src={selected.thumbnail || selected.images?.[0]} class="w-full rounded object-cover bg-gray-100" loading="lazy" />
      <p class="text-sm opacity-80">{selected.description}</p>
      <div class="text-sm font-mono">
        <span class="font-semibold">${selected.price}</span>
        <span class="ml-2 opacity-70">⭐ {selected.rating}</span>
        <span class="ml-2 opacity-70">ID: {selected.id}</span>
      </div>
    </div>
    <footer class="px-4 py-3 border-t border-gray-200 flex justify-end">
      <button class="rounded bg-gray-800 text-white px-3 py-1.5 hover:bg-black" onclick={closeProduct}>Close</button>
    </footer>
  {/if}
</dialog>

<script module>
// Used by the router before navigating to /products
export function loaders() {
  return fetch('https://dummyjson.com/products').then(r => r.json())
}
</script>

<script>
  import { getContext } from 'svelte'
  const { params, data = null } = $props()
  const router = getContext('router')

  // Prefer preloaded list; use fetched fallback when navigating directly
  let fetched = $state(null)
  const items = $derived(data?.products ?? fetched?.products ?? [])

  let selected = $state(null)
  let dlg

  function openProduct(p) {
    selected = p
    const url = new URL(location.href)
    url.searchParams.set('product', String(p.id))
    router.pushState(url)
    dlg?.showModal?.()
  }

  function closeProduct() {
    if (dlg?.open) dlg.close()
    const url = new URL(location.href)
    url.searchParams.delete('product')
    router.replaceState(url)
    selected = null
  }

  function syncFromLocation() {
    const url = new URL(location.href)
    const pid = url.searchParams.get('product')
    if (pid) {
      const id = String(pid)
      const inList = items.find(p => String(p.id) === id)
      if (inList) {
        selected = inList
        if (!dlg?.open) dlg?.showModal?.()
      } else {
        fetch(`https://dummyjson.com/products/${id}`)
          .then(r => r.json())
          .then(prod => {
            selected = prod
            if (!dlg?.open) dlg?.showModal?.()
          })
          .catch(() => {})
      }
    } else {
      if (dlg?.open) dlg.close()
      selected = null
    }
  }

  // Load list if needed
  $effect(() => {
    if (!data?.products && !fetched) {
      fetch('https://dummyjson.com/products')
        .then(r => r.json())
        .then(json => { if (Array.isArray(json?.products)) fetched = json })
        .catch(() => {})
    }
  })

  // React to shallow history events and back/forward
  $effect(() => {
    const onnav = () => syncFromLocation()
    addEventListener('popstate', onnav)
    addEventListener('pushstate', onnav)
    addEventListener('replacestate', onnav)
    // initialize from current URL
    syncFromLocation()
    return () => {
      removeEventListener('popstate', onnav)
      removeEventListener('pushstate', onnav)
      removeEventListener('replacestate', onnav)
    }
  })
</script>
