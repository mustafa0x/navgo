<h1 class="text-2xl font-semibold mb-2">Projects</h1>
<p class="opacity-80">A placeholder list of projects.</p>

<script module>
export function loaders() {
  return fetch(`https://dummyjson.com/products`).then(r => r.json())
}
</script>
