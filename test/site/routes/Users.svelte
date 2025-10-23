<svelte:head>
  <title>Users — Navgo</title>
  <meta name="description" content="User detail page with :id param validation" />
</svelte:head>

<h1 class="mb-2 text-2xl font-semibold">User #{params.id}</h1>
<p class="opacity-80">This page validates the <code>:id</code> param via a validator.</p>

<script module>
import Navgo from '../../../index.js'

export const param_validators = {id: Navgo.validators.int({min: 1})}
export function loader(params) {
    return Promise.resolve({id: params.id, loaded: true})
}
</script>

<script>
let {params} = $props()
</script>
