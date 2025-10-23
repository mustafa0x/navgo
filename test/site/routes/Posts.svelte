<svelte:head>
  <title>Posts — Navgo</title>
  <meta name="description" content="Blog posts list and details example" />
</svelte:head>

<h1 class="mb-2 text-2xl font-semibold">Posts</h1>
<p class="opacity-80">A demo list fetched from JSONPlaceholder posts.</p>

{#if data.posts.length}
    <nav class="my-4 max-h-56 overflow-auto rounded border border-gray-200 bg-white p-3 text-sm">
        <h2 class="mb-2 font-semibold">Table of contents</h2>
        <div class="flex flex-wrap gap-2">
            {#each data.posts as p (p.id)}
                <a href="#post-{p.id}" class="max-w-[22rem] truncate text-blue-700 hover:underline"
                    >{p.id}. {p.title}</a
                >
            {/each}
        </div>
    </nav>
    <ul class="grid gap-4 sm:grid-cols-2">
        {#each data.posts as p (p.id)}
            <li id="post-{p.id}" class="rounded-md border border-gray-200 bg-white p-3">
                <h3 class="mb-1 font-medium">{p.title}</h3>
                <p class="line-clamp-2 text-sm opacity-80">{p.body}</p>
                <div class="mt-2 text-xs opacity-60">user #{p.userId} • id {p.id}</div>
            </li>
        {/each}
    </ul>
{:else}
    <p class="opacity-70">No posts loaded.</p>
{/if}

<script module>
export function loader() {
    return {
        posts: {
            request: 'https://jsonplaceholder.typicode.com/posts',
            parse: 'json',
        },
    }
}
</script>

<script>
let {data} = $props()
</script>
