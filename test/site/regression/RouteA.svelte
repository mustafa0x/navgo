<h1 data-testid="route-a">Route A</h1>
<BoundValue bind:selected />
<button data-testid="goto-b" onclick={go_b}>Go B</button>

<script module>
	import * as v from 'valibot'

	export const search_schema = v.object({
		q: v.optional(v.fallback(v.string(), ''), ''),
		sort: v.optional(v.fallback(v.string(), 'new'), 'new'),
		rating: v.optional(v.fallback(v.number(), 0), 0),
		project_slug: v.optional(v.fallback(v.string(), ''), ''),
	})
</script>

<script>
	import { onDestroy } from 'svelte'
	import { get } from 'svelte/store'
	import BoundValue from './BoundValue.svelte'
	let selected = $state('')

	function go_b() {
		window.navgo.goto('/b?category=books&status=closed')
	}

	const off = window.navgo.search_params.subscribe(next => {
		if (get(window.navgo.route).url?.pathname === '/a' && next.project_slug === undefined) {
			throw new Error('route_a_observed_transient_project_slug_undefined')
		}
		selected = next.project_slug?.trim()
	})
	onDestroy(() => off())

</script>
