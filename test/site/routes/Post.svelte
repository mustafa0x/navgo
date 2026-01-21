<h1 class="mb-2 text-2xl font-semibold">Post #{params.id}</h1>
<p class="opacity-80">A nested route that loads multiple resources in one plan.</p>

{#if data?.__meta}
	<div class="mt-4 rounded-md border border-gray-200 bg-white p-4 text-sm">
		<div class="flex flex-wrap items-center gap-2">
			<span class="font-mono">sources</span>:
			<span class="font-mono">{JSON.stringify(data.__meta.source)}</span>
		</div>
	</div>
{/if}

{#if post}
	<section class="mt-6 rounded-md border border-gray-200 bg-white p-4">
		<h2 class="text-lg font-semibold">{post.title}</h2>
		<p class="mt-2 text-sm opacity-80">{post.body}</p>
		<div class="mt-3 flex flex-wrap gap-2 text-xs">
			<span class="rounded bg-gray-100 px-2 py-1"
				>reactions: {format_reactions(post.reactions)}</span
			>
			<a class="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200" href={`/users/${post.userId}`}
				>user: {post.userId}</a
			>
		</div>
	</section>
{/if}

{#if comments.length}
	<section class="mt-4 rounded-md border border-gray-200 bg-white p-4">
		<h2 class="mb-2 font-semibold">Comments</h2>
		<ul class="grid gap-2 text-sm">
			{#each comments as c (c.id)}
				<li class="rounded bg-gray-50 p-3">
					<div class="text-xs opacity-60">{c.user?.username ?? 'anon'}</div>
					<div>{c.body}</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<div class="mt-6">
	<a class="text-blue-700 hover:underline" href="/posts">Back to posts</a>
</div>

<script module>
export function loader({params}) {
	const id = params.id
	return {
		post: {
			request: `https://dummyjson.com/posts/${id}`,
			cache: {strategy: 'swr', ttl: 10_000, tags: ['posts', `post:${id}`]},
		},
		comments: {
			request: `https://dummyjson.com/posts/${id}/comments`,
			cache: {strategy: 'cache-first', ttl: 60_000, tags: ['comments', `post:${id}`]},
		},
	}
}
</script>

<script>
let {params, data} = $props()

const post = $derived(data?.post ?? null)
const comments = $derived(data?.comments?.comments ?? [])

function format_reactions(r) {
	if (r == null) return '—'
	if (typeof r === 'number') return String(r)
	if (typeof r === 'object') {
		const likes = Number(r.likes ?? 0)
		const dislikes = Number(r.dislikes ?? 0)
		return `👍 ${likes} · 👎 ${dislikes}`
	}
	return String(r)
}
</script>
