<h1 class="mb-2 text-2xl font-semibold">User #{params.id}</h1>
<p class="opacity-80">This page validates the <code>:id</code> param via a validator.</p>

<script module>
import Navaid from 'navaid'
export const param_validators = {id: Navaid.validators.int({min: 1})}
export function loaders(params) {
    return Promise.resolve({id: params.id, loaded: true})
}
</script>

<script>
export let params
</script>
