<h1 class="mb-2 text-2xl font-semibold">User #{params.id}</h1>
<p class="opacity-80">Loaded from DummyJSON with caching.</p>

{#if data?.__meta}
	<div class="mt-4 rounded-md border border-gray-200 bg-white p-4 text-sm">
		<div class="flex flex-wrap items-center gap-2">
			<span class="font-mono">sources</span>:
			<span class="font-mono">{JSON.stringify(data.__meta.source)}</span>
		</div>
	</div>
{/if}

{#if user}
	<section class="mt-6 rounded-md border border-gray-200 bg-white p-4">
		<h2 class="mb-2 font-semibold">{user.firstName} {user.lastName}</h2>
		<div class="grid gap-1 text-sm">
			<div><span class="font-mono">email</span>: {user.email}</div>
			<div><span class="font-mono">age</span>: {user.age}</div>
			<div><span class="font-mono">company</span>: {user.company?.name}</div>
		</div>
	</section>
{/if}

{#if todos.length}
	<section class="mt-4 rounded-md border border-gray-200 bg-white p-4">
		<h2 class="mb-2 font-semibold">Todos</h2>
		<ul class="grid gap-1 text-sm">
			{#each todos as t (t.id)}
				<li class="flex items-center justify-between gap-3">
					<span>{t.todo}</span>
					<span class="rounded bg-gray-100 px-2 py-1 text-xs">{t.completed ? 'done' : 'open'}</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<script module>
export function loader({params}) {
	const id = params.id
	return {
		user: {
			request: `https://dummyjson.com/users/${id}`,
			cache: {strategy: 'swr', ttl: 10_000, tags: ['users', `user:${id}`]},
		},
		todos: {
			request: `https://dummyjson.com/users/${id}/todos`,
			cache: {strategy: 'cache-first', ttl: 60_000, tags: ['todos', `user:${id}`]},
		},
	}
}
</script>

<script>
let {params, data} = $props()
const user = $derived(data?.user ?? null)
const todos = $derived(data?.todos?.todos ?? [])
</script>
