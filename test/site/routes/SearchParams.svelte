<h1 class="mb-2 text-2xl font-semibold">Search params</h1>
<p class="opacity-80">
	This page demonstrates <span class="font-mono">search_schema</span> +
	<span class="font-mono">search_options</span> and the
	<span class="font-mono">router.search_params</span> store.
</p>

<div class="mt-6 grid gap-6 lg:grid-cols-2">
	<div class="rounded-md border border-gray-200 bg-white p-4">
		<h2 class="text-lg font-semibold">Controls</h2>

		<div class="mt-4 grid gap-4">
			<label class="grid gap-1">
				<span class="text-sm font-medium">q (string)</span>
				<input
					class="rounded border border-gray-300 px-3 py-2"
					value={$search_params.q ?? ''}
					oninput={e => {
						$search_params = { ...$search_params, q: e.currentTarget.value }
					}}
					placeholder="Try q=true (stays a string)" />
			</label>

			<div class="grid gap-1">
				<span class="text-sm font-medium">page (number)</span>
				<div class="flex flex-wrap items-center gap-2">
					<button
						class="rounded bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
						onclick={() => {
							const page = Number($search_params.page ?? 1)
							$search_params = { ...$search_params, page: Math.max(1, page - 1) }
						}}>
						-
					</button>
					<span class="font-mono text-sm">{$search_params.page ?? 1}</span>
					<button
						class="rounded bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
						onclick={() => {
							const page = Number($search_params.page ?? 1)
							$search_params = { ...$search_params, page: page + 1 }
						}}>
						+
					</button>
				</div>
				<p class="text-xs opacity-70">
					Typing in the URL as <span class="font-mono">?page=2</span> becomes a number
					because the schema default is a number.
				</p>
			</div>

			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					checked={$search_params.exact ?? false}
					onchange={e => {
						$search_params = { ...$search_params, exact: e.currentTarget.checked }
					}} />
				<span class="text-sm font-medium">exact (boolean)</span>
			</label>

			<div class="grid gap-2">
				<span class="text-sm font-medium">tags (array, repeat)</span>
				<div class="flex gap-2">
					<input
						class="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2"
						bind:value={tag_input}
						placeholder="Add a tag" />
					<button
						class="rounded bg-blue-700 px-3 py-2 text-sm text-white hover:bg-blue-800"
						onclick={add_tag}
						disabled={!tag_input.trim()}>
						Add
					</button>
				</div>
				<div class="flex flex-wrap gap-2">
					{#each tags as t (t)}
						<span class="flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs">
							<span class="font-mono">{t}</span>
							<button
								class="rounded bg-gray-200 px-1 py-0.5 hover:bg-gray-300"
								onclick={() => remove_tag(t)}
								aria-label={`Remove ${t}`}>
								×
							</button>
						</span>
					{/each}
				</div>
				<p class="text-xs opacity-70">
					Encoded as <span class="font-mono">?tag=a&amp;tag=b</span>.
				</p>
			</div>

			<div class="grid gap-2">
				<span class="text-sm font-medium">cats (array, csv)</span>
				<div class="flex gap-2">
					<input
						class="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2"
						bind:value={cat_input}
						placeholder="Add a cat" />
					<button
						class="rounded bg-blue-700 px-3 py-2 text-sm text-white hover:bg-blue-800"
						onclick={add_cat}
						disabled={!cat_input.trim()}>
						Add
					</button>
				</div>
				<div class="flex flex-wrap gap-2">
					{#each cats as c (c)}
						<span class="flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs">
							<span class="font-mono">{c}</span>
							<button
								class="rounded bg-gray-200 px-1 py-0.5 hover:bg-gray-300"
								onclick={() => remove_cat(c)}
								aria-label={`Remove ${c}`}>
								×
							</button>
						</span>
					{/each}
				</div>
				<p class="text-xs opacity-70">
					Encoded as <span class="font-mono">?cat=a,b</span>.
				</p>
			</div>

			<div class="grid gap-2">
				<span class="text-sm font-medium">json_tags (array, json)</span>
				<div class="flex gap-2">
					<input
						class="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2"
						bind:value={json_tag_input}
						placeholder="Add a json_tag" />
					<button
						class="rounded bg-blue-700 px-3 py-2 text-sm text-white hover:bg-blue-800"
						onclick={add_json_tag}
						disabled={!json_tag_input.trim()}>
						Add
					</button>
				</div>
				<div class="flex flex-wrap gap-2">
					{#each json_tags as jt (jt)}
						<span class="flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs">
							<span class="font-mono">{jt}</span>
							<button
								class="rounded bg-gray-200 px-1 py-0.5 hover:bg-gray-300"
								onclick={() => remove_json_tag(jt)}
								aria-label={`Remove ${jt}`}>
								×
							</button>
						</span>
					{/each}
				</div>
				<p class="text-xs opacity-70">
					Encoded as JSON (e.g. <span class="font-mono">?json_tags=["a","b"]</span>).
				</p>
			</div>

			<div class="grid gap-2">
				<span class="text-sm font-medium">filters (object)</span>
				<div class="grid gap-2 sm:grid-cols-2">
					<label class="grid gap-1">
						<span class="text-xs opacity-70">sort</span>
						<input
							class="rounded border border-gray-300 px-3 py-2"
							value={filters.sort}
							oninput={e => update_filters({ sort: e.currentTarget.value })} />
					</label>
					<label class="flex items-center gap-2">
						<input
							type="checkbox"
							checked={filters.inStock}
							onchange={e => update_filters({ inStock: e.currentTarget.checked })} />
						<span class="text-sm">inStock</span>
					</label>
				</div>
				<p class="text-xs opacity-70">
					Encoded as JSON.
				</p>
			</div>
		</div>
	</div>

	<div class="rounded-md border border-gray-200 bg-white p-4">
		<h2 class="text-lg font-semibold">State</h2>
		<p class="mt-1 text-sm opacity-80">
			This shows both the store (<span class="font-mono">$search_params</span>) and the router
			snapshot (<span class="font-mono">$route.search_params</span>).
		</p>

		<div class="mt-4 grid gap-3 text-sm">
			<div class="grid gap-1">
				<div class="font-mono text-xs opacity-70">$route.url.search</div>
				<div class="rounded bg-gray-50 p-2 font-mono text-xs">{$route.url.search}</div>
			</div>
			<div class="grid gap-1">
				<div class="font-mono text-xs opacity-70">$search_params</div>
				<div class="rounded bg-gray-50 p-2 font-mono text-xs">
					{JSON.stringify($search_params, null, 2)}
				</div>
			</div>
			<div class="grid gap-1">
				<div class="font-mono text-xs opacity-70">$route.search_params</div>
				<div class="rounded bg-gray-50 p-2 font-mono text-xs">
					{JSON.stringify($route.search_params, null, 2)}
				</div>
			</div>

			{#if data?.search_params}
				<div class="grid gap-1">
					<div class="font-mono text-xs opacity-70">loader ctx.search_params</div>
					<div class="rounded bg-gray-50 p-2 font-mono text-xs">
						{JSON.stringify(data.search_params, null, 2)}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<script module>
	import * as v from 'valibot'

	export const search_schema = v.object({
		q: v.optional(v.fallback(v.string(), ''), ''),
		page: v.optional(v.fallback(v.number(), 1), 1),
		exact: v.optional(v.fallback(v.boolean(), false), false),
		tag: v.optional(v.fallback(v.array(v.string()), []), []),
		cat: v.optional(v.fallback(v.array(v.string()), []), []),
		json_tags: v.optional(v.fallback(v.array(v.string()), []), []),
		filters: v.optional(
			v.fallback(
				v.object({
					sort: v.optional(v.fallback(v.string(), 'price'), 'price'),
					inStock: v.optional(v.fallback(v.boolean(), false), false),
				}),
				{ sort: 'price', inStock: false },
			),
			{ sort: 'price', inStock: false },
		),
	})

	export const search_options = {
		arrayStyle: {
			// default for arrays is repeat
			cat: 'csv',
			json_tags: 'json',
		},
	}

	export async function loader({ search_params }) {
		// returning a promise avoids being treated as a LoadPlan
		return { search_params }
	}
</script>

<script>
	let { router, data = null } = $props()
	const { route, search_params } = router

	let tag_input = $state('')
	let cat_input = $state('')
	let json_tag_input = $state('')

	const tags = $derived(Array.isArray($search_params.tag) ? $search_params.tag : [])
	const cats = $derived(Array.isArray($search_params.cat) ? $search_params.cat : [])
	const json_tags = $derived(
		Array.isArray($search_params.json_tags) ? $search_params.json_tags : [],
	)
	const filters = $derived(
		($search_params.filters && typeof $search_params.filters === 'object'
			? $search_params.filters
			: { sort: 'price', inStock: false }),
	)

	function add_tag() {
		const t = tag_input.trim()
		if (!t) return
		$search_params = { ...$search_params, tag: [...new Set([...tags, t])] }
		tag_input = ''
	}
	function remove_tag(t) {
		$search_params = { ...$search_params, tag: tags.filter(x => x !== t) }
	}

	function add_cat() {
		const t = cat_input.trim()
		if (!t) return
		$search_params = { ...$search_params, cat: [...new Set([...cats, t])] }
		cat_input = ''
	}
	function remove_cat(t) {
		$search_params = { ...$search_params, cat: cats.filter(x => x !== t) }
	}

	function add_json_tag() {
		const t = json_tag_input.trim()
		if (!t) return
		$search_params = { ...$search_params, json_tags: [...new Set([...json_tags, t])] }
		json_tag_input = ''
	}
	function remove_json_tag(t) {
		$search_params = { ...$search_params, json_tags: json_tags.filter(x => x !== t) }
	}

	function update_filters(patch) {
		$search_params = { ...$search_params, filters: { ...filters, ...patch } }
	}
</script>
