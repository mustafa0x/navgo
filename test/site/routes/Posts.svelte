<h1 class="mb-2 text-2xl font-semibold">Posts</h1>
<p class="opacity-80">
	Loaded from DummyJSON with caching. Click an anchor to test hash scrolling.
</p>

{#if data?.__meta}
	<div class="mt-4 rounded-md border border-gray-200 bg-white p-4 text-sm">
		<div class="flex flex-wrap items-center gap-2">
			<span class="font-mono">sources</span>:
			<span class="font-mono">{JSON.stringify(data.__meta.source)}</span>
		</div>
		<p class="mt-2 text-xs opacity-70">
			Navigate away/back to see caching. Open an individual post page to test nested routes.
		</p>
	</div>
{/if}

<section class="mt-6 grid gap-4">
	{#each posts as post (post.id)}
		<article
			id={`post-${post.id}`}
			class="rounded-md border border-gray-200 bg-white p-4"
		>
			<h2 class="text-lg font-semibold">
				<a class="text-blue-700 hover:underline" href={`/posts/${post.id}`}>{post.title}</a>
			</h2>
			<p class="mt-2 text-sm opacity-80">{post.body}</p>
			<div class="mt-3 flex flex-wrap gap-2 text-xs">
				<a class="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200" href={`#post-${post.id}`}
					>#{post.id}</a
				>
				<span class="rounded bg-gray-100 px-2 py-1"
					>reactions: {format_reactions(post.reactions)}</span
				>
				<span class="rounded bg-gray-100 px-2 py-1">user: {post.userId}</span>
			</div>
		</article>
	{/each}
</section>

<script module>
const POSTS_URL = 'https://dummyjson.com/posts?limit=10&skip=10&select=title,body,reactions,userId'

export function loader() {
	return {
		posts: {
			request: POSTS_URL,
			cache: {strategy: 'swr', ttl: 10_000, tags: ['posts']},
		},
	}
}
</script>

<script>
let {data} = $props()

const posts = $derived(data?.posts?.posts ?? [])

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
