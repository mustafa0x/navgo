<h1 class="mb-2 text-2xl font-semibold">Admin</h1>
<p class="mb-4 opacity-80">
    Nested layout + shared loader demo. The route guard asks before entering.
</p>

<div class="rounded-md border border-gray-200 bg-white p-4 text-sm">
    <div class="font-mono">admin_id: {params?.id}</div>
    <div class="mt-2 font-mono">route data: {JSON.stringify(data ?? null)}</div>
</div>

<script>
let {params = {}, data = null} = $props()
</script>
