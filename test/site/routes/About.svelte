<svelte:head>
  <title>About — Navgo</title>
  <meta name="description" content="About page with anchors and sections" />
</svelte:head>

<h1 class="mb-4 text-2xl font-semibold" id="top">About</h1>
<p class="mb-4 opacity-80">
    This page includes anchors and extra content to test scroll restoration and hash navigation.
</p>

<nav class="mb-4 flex gap-2 text-sm">
    <a href="#top" class="text-blue-700 hover:underline">#top</a>
    <a href="#section-2" class="text-blue-700 hover:underline">#section-2</a>
    <a href="#section-3" class="text-blue-700 hover:underline">#section-3</a>
    <a href="#section-4" class="text-blue-700 hover:underline">#section-4</a>
    <a href="#bottom" class="text-blue-700 hover:underline">#bottom</a>
    <a href="/about#bottom" class="text-blue-700 hover:underline">/about#bottom</a>
    <a href="/about#section-3" class="text-blue-700 hover:underline">/about#section-3</a>
    <a href="/about#top" class="text-blue-700 hover:underline">/about#top</a>
    <a href="/about#" class="text-blue-700 hover:underline">/about#</a>
    <a href="/about" class="text-blue-700 hover:underline">/about</a>
    <a href="/products" class="text-blue-700 hover:underline">/products</a>
</nav>

{#each [2, 3, 4] as n}
    <section class="border-t border-gray-200 py-12" id={`section-${n}`}>
        <h2 class="mb-2 text-xl font-semibold">Section {n}</h2>
        <p class="opacity-80">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus elementum neque id est
            lobortis, sed varius nisi commodo. Sed non ipsum at ante consectetur aliquam. Donec
            luctus, sem a facilisis finibus, justo turpis efficitur arcu, sed pulvinar arcu ligula
            ut leo.
        </p>
    </section>
{/each}

<div class="border-t border-gray-200 py-12" id="bottom">
    <h2 class="mb-2 text-xl font-semibold">Bottom</h2>
    <p class="opacity-80">This is the bottom anchor.</p>
</div>
