<h1 data-testid="route-b">Route B</h1>

<script module>
	import * as v from 'valibot'

	export const search_schema = v.object({
		q: v.optional(v.fallback(v.string(), ''), ''),
		category: v.optional(v.fallback(v.string(), 'all'), 'all'),
		status: v.optional(v.fallback(v.string(), 'open'), 'open'),
	})
</script>
