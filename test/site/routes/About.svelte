<h1 class="text-2xl font-semibold mb-4" id="top">About</h1>
<p class="opacity-80 mb-4">This page includes anchors and extra content to test scroll restoration and hash navigation.</p>

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
  <a href="/projects" class="text-blue-700 hover:underline">/projects</a>
</nav>

{#each [2,3,4] as n}
  <section class="py-12 border-t border-gray-200" id={`section-${n}`}>
    <h2 class="text-xl font-semibold mb-2">Section {n}</h2>
    <p class="opacity-80">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus elementum neque id est lobortis, sed varius nisi commodo. Sed non ipsum at ante consectetur aliquam. Donec luctus, sem a facilisis finibus, justo turpis efficitur arcu, sed pulvinar arcu ligula ut leo.</p>
  </section>
{/each}

<div class="py-12 border-t border-gray-200" id="bottom">
  <h2 class="text-xl font-semibold mb-2">Bottom</h2>
  <p class="opacity-80">This is the bottom anchor.</p>
</div>
