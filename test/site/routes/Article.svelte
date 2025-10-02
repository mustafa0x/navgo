<h1 class="text-2xl font-semibold mb-2">Articles: {params.year}</h1>
<p class="opacity-80">This route is matched by a RegExp with a named capture group.</p>

<script module>
  export function loaders(params) {
    return Promise.resolve({ year_ok: /^[0-9]{4}$/.test(params.year) })
  }
</script>

<script>
  export let params
</script>
