<div class="min-h-screen bg-gray-50 font-sans text-gray-900">
    <header class="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
        <nav class="mx-auto flex max-w-3xl items-center justify-center gap-1 p-3">
            <a
                href="/"
                class="rounded-md px-3 py-1.5 hover:bg-gray-100 {path === '/'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700'}">Home</a
            >
            <a
                href="/products"
                class="rounded-md px-3 py-1.5 hover:bg-gray-100 {path === '/products'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700'}">Products</a
            >
            <a
                href="/posts"
                class="rounded-md px-3 py-1.5 hover:bg-gray-100 {path === '/posts'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700'}">Posts</a
            >
            <a
                href="/contact"
                class="rounded-md px-3 py-1.5 hover:bg-gray-100 {path === '/contact'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700'}">Contact</a
            >
            <a
                href="/about"
                class="rounded-md px-3 py-1.5 hover:bg-gray-100 {path === '/about'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700'}">About</a
            >
            <a
                href="/account"
                class="rounded-md px-3 py-1.5 hover:bg-gray-100 {path === '/account'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700'}">Account</a
            >
            <a
                href="/users/42"
                class="rounded-md px-3 py-1.5 hover:bg-gray-100 {path.startsWith('/users')
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700'}">User 42</a
            >
            <a
                href="/files/foo/bar"
                class="rounded-md px-3 py-1.5 hover:bg-gray-100 {path.startsWith('/files')
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700'}">Files</a
            >
            <a
                href="/scroll"
                class="rounded-md px-3 py-1.5 hover:bg-gray-100 {path === '/scroll'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700'}">Scroll</a
            >
        </nav>
    </header>

    <main class="mx-auto max-w-3xl p-6">
        {#if Component}
            <Component params={$route.params} data={route_data} />
        {:else}
            <h1 class="mb-2 text-2xl font-semibold">Home</h1>
            <p class="opacity-80">Welcome. Use the navigation to try routes.</p>
        {/if}

        {#if is_404}
            <div class="flex flex-col items-center justify-center gap-3 py-16 text-2xl font-bold">
                <h1>Page not found</h1>
                <a class="text-blue-700 hover:underline" href="/">Go home</a>
            </div>
        {/if}
    </main>

    <aside class="mx-auto max-w-3xl p-6 pt-0">
        <div class="grid gap-4 sm:grid-cols-2">
            <section class="rounded-md border border-gray-200 bg-white p-4">
                <h2 class="mb-2 font-semibold">Programmatic</h2>
                <div class="flex flex-wrap gap-2">
                    <button
                        class="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700"
                        onclick={() => router.goto('/products')}>goto('/products')</button
                    >
                    <button
                        class="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700"
                        onclick={() => router.goto('/users/7', {replace: true})}
                        >goto('/users/7', &#123; replace: true &#125;)</button
                    >
                    <button
                        class="rounded bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700"
                        onclick={() => router.preload('/products')}>preload('/products')</button
                    >
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                    <button
                        class="rounded bg-gray-700 px-3 py-1.5 text-white hover:bg-black"
                        onclick={() => router.push_state(`/?tab=info#top`)}
                        >push_state('?tab=info')</button
                    >
                    <button
                        class="rounded bg-gray-700 px-3 py-1.5 text-white hover:bg-black"
                        onclick={() => router.replace_state(`/?tab=overview`)}
                        >replace_state('?tab=overview')</button
                    >
                </div>
            </section>

            <section class="rounded-md border border-gray-200 bg-white p-4">
                <h2 class="mb-2 font-semibold">Debug</h2>
                <div class="space-y-1 text-sm text-gray-700">
                    <div><span class="font-mono">path</span>: {path}</div>
                    <div>
                        <span class="font-mono">params</span>:
                        <span class="font-mono">{JSON.stringify($route.params)}</span>
                    </div>
                    <div><span class="font-mono">hash</span>: {location.hash}</div>
                </div>
                <p class="mt-3 text-xs opacity-70">
                    Hover the nav links to see preloading; click anchors on About to test
                    scroll/anchors.
                </p>
            </section>
        </div>
    </aside>
</div>
<div class="request-indicator" class:active={$is_navigating}></div>

<script module>
import Navgo from '../../index.js'


import * as ProductsRoute from './routes/Products.svelte'
import * as PostsRoute from './routes/Posts.svelte'
import * as ContactRoute from './routes/Contact.svelte'
import * as AboutRoute from './routes/About.svelte'
import * as AccountRoute from './routes/Account.svelte'
import * as UsersRoute from './routes/Users.svelte'
import * as FilesRoute from './routes/Files.svelte'
import * as ScrollRoute from './routes/Scroll.svelte'

// prettier-ignore
/** @type {Array<[string|RegExp, any]>} */
const routes = [
  ['/', {}],
  ['/products', ProductsRoute],
  ['/posts', PostsRoute],
  ['/contact', ContactRoute],
  ['/about', AboutRoute],
  ['/account', AccountRoute],
  ['/users/:id', UsersRoute],
  ['/files/*', FilesRoute],
  ['/scroll', ScrollRoute],
]
let Component = $state()
let is_404 = $state(false)
let route_data = $state(null)

const router = new Navgo(routes, {
    async after_navigate(nav) {
        is_404 = nav.to?.data?.__error?.status === 404
        if (is_404) {
            console.log('404 for', nav.to.url.pathname)
            return
        }
        console.log('afterNavigate', nav)
        const uri = router.format(nav.to.url.pathname)

        route_data = nav.to.data ?? null
        Component = nav.to.route?.[1]?.default || null
        // document.startViewTransition(() => {
        // })
    },
})
router.init()
const {route, is_navigating} = router
</script>

<script>
import {onDestroy} from 'svelte'

const path = $derived($route.url?.pathname)
onDestroy(() => {
    router.destroy()
})
</script>
