<h1 class="mb-2 text-2xl font-semibold">Scroll Areas</h1>
<p class="mb-4 opacity-80">Scroll the pane, navigate away, then use Back to verify restoration.</p>

<div class="mb-3 flex gap-2">
  <a href="/products" class="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700">Go to Products</a>
  <a href="/about#bottom" class="rounded bg-gray-800 px-3 py-1.5 text-white hover:bg-black">Go to About#bottom</a>
  <a href="#top" class="rounded bg-gray-200 px-3 py-1.5 text-gray-900 hover:bg-gray-300">#top</a>
  <a href="#bottom" class="rounded bg-gray-200 px-3 py-1.5 text-gray-900 hover:bg-gray-300">#bottom</a>
  <a href="/scroll#bottom" class="rounded bg-gray-200 px-3 py-1.5 text-gray-900 hover:bg-gray-300">/scroll#bottom</a>
  <a href="/scroll#top" class="rounded bg-gray-200 px-3 py-1.5 text-gray-900 hover:bg-gray-300">/scroll#top</a>
  <a href="/scroll" class="rounded bg-gray-200 px-3 py-1.5 text-gray-900 hover:bg-gray-300">/scroll</a>
  <a href="/" class="rounded bg-gray-200 px-3 py-1.5 text-gray-900 hover:bg-gray-300">Home</a>
  </div>

<div class="h-64 overflow-auto rounded-md border border-gray-200 bg-white" bind:this={pane} id="pane">
  {#each Array.from({ length: 80 }, (_, i) => i + 1) as n (n)}
    <div class="border-b border-gray-100 px-3 py-2 text-sm">Row {n}</div>
  {/each}
  <div id="bottom" class="p-3 text-sm opacity-60">Bottom</div>
  <div id="top"></div>
</div>

<script>
import { getContext } from 'svelte'
let pane
// No explicit registration needed; router listens globally in capture phase
</script>
