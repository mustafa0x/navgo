<h1 class="mb-2 text-2xl font-semibold">Coerce {params.id}</h1>
<p class="opacity-80">Params are coerced after validation.</p>

<div class="mt-4 grid gap-2 rounded-md border border-gray-200 bg-white p-4 text-sm">
    <div><span class="font-mono">id</span>: <span data-testid="coerce-id">{params.id}</span></div>
    <div>
        <span class="font-mono">type</span>: <span data-testid="coerce-type">{id_type}</span>
    </div>
</div>

<script module>
export function validate() {
    return false
}
</script>

<script>
let {params} = $props()
const id_type = $derived(typeof params.id)
</script>
