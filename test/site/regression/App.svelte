<main>
	{#if route_path === '/a'}
		<RouteA />
	{:else if route_path === '/b'}
		<RouteB />
	{:else}
		<h1 data-testid="reg-home">Regression harness</h1>
		<button
			data-testid="goto-a"
			onclick={() => router.goto('/a?sort=top&rating=5&project_slug=alpha')}>
			Go A
		</button>
	{/if}
</main>

<script>
	import { onDestroy } from 'svelte'
	import * as v from 'valibot'
	import Navgo from '../../../index.js'
	import RouteA from './RouteA.svelte'
	import RouteB from './RouteB.svelte'

	const search_schema_a = v.object({
		q: v.optional(v.fallback(v.string(), ''), ''),
		sort: v.optional(v.fallback(v.string(), 'new'), 'new'),
		rating: v.optional(v.fallback(v.number(), 0), 0),
		project_slug: v.optional(v.fallback(v.string(), ''), ''),
	})
	const search_schema_b = v.object({
		q: v.optional(v.fallback(v.string(), ''), ''),
		category: v.optional(v.fallback(v.string(), 'all'), 'all'),
		status: v.optional(v.fallback(v.string(), 'open'), 'open'),
	})
	const router = new Navgo([
		['/a', { default: RouteA, search_schema: search_schema_a }],
		['/b', { default: RouteB, search_schema: search_schema_b }],
	])
	let route_path = $state('')
	const off_route = router.route.subscribe(v => {
		route_path = v?.url?.pathname || ''
	})
	router.init()

	onDestroy(() => {
		off_route()
		router.destroy()
	})
</script>
