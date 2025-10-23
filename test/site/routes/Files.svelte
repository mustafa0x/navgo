<svelte:head>
  <title>Files — Navgo</title>
  <meta name="description" content="Simple files view for router demo" />
</svelte:head>

<h1 class="mb-2 text-2xl font-semibold">Files</h1>
<p class="opacity-80">
    Wildcard path is: <code class="rounded bg-gray-100 px-1 font-mono">{params['*']}</code>
</p>

<script>
export let params
</script>
