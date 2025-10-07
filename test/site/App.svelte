<div class="min-h-screen bg-gray-50 text-gray-900 font-sans">
  <header class="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
    <nav class="mx-auto max-w-3xl flex items-center justify-center gap-1 p-3">
      <a href="/" class="px-3 py-1.5 rounded-md hover:bg-gray-100 {route.path === '/' ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}">Home</a>
      <a href="/projects" class="px-3 py-1.5 rounded-md hover:bg-gray-100 {route.path === '/projects' ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}">Projects</a>
      <a href="/contact" class="px-3 py-1.5 rounded-md hover:bg-gray-100 {route.path === '/contact' ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}">Contact</a>
      <a href="/about" class="px-3 py-1.5 rounded-md hover:bg-gray-100 {route.path === '/about' ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}">About</a>
      <a href="/account" class="px-3 py-1.5 rounded-md hover:bg-gray-100 {route.path === '/account' ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}">Account</a>
      <a href="/users/42" class="px-3 py-1.5 rounded-md hover:bg-gray-100 {route.path.startsWith('/users') ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}">User 42</a>
      <a href="/files/foo/bar" class="px-3 py-1.5 rounded-md hover:bg-gray-100 {route.path.startsWith('/files') ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}">Files</a>
      <a href="/articles/2024" class="px-3 py-1.5 rounded-md hover:bg-gray-100 {route.path.startsWith('/articles') ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}">Articles</a>
    </nav>
  </header>

  <main class="mx-auto max-w-3xl p-6">
    {#if Component}
      <Component params={route.params} />
    {:else}
      <h1 class="text-2xl font-semibold mb-2">Home</h1>
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
          <button class="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700" onclick={() => router.goto('/projects')}>goto('/projects')</button>
          <button class="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700" onclick={() => router.goto('/users/7', { replace: true })}>goto('/users/7', &#123; replace: true &#125;)</button>
          <button class="rounded bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700" onclick={() => router.preload('/projects')}>preload('/projects')</button>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <button class="rounded bg-gray-700 px-3 py-1.5 text-white hover:bg-black" onclick={() => router.pushState(`/?tab=info#top`)}>pushState('?tab=info')</button>
          <button class="rounded bg-gray-700 px-3 py-1.5 text-white hover:bg-black" onclick={() => router.replaceState(`/?tab=overview`)}>replaceState('?tab=overview')</button>
        </div>
      </section>

      <section class="rounded-md border border-gray-200 bg-white p-4">
        <h2 class="mb-2 font-semibold">Debug</h2>
        <div class="text-sm text-gray-700 space-y-1">
          <div><span class="font-mono">path</span>: {route.path}</div>
          <div><span class="font-mono">params</span>: <span class="font-mono">{JSON.stringify(route.params)}</span></div>
          <div><span class="font-mono">hash</span>: {location.hash}</div>
        </div>
        <p class="mt-3 text-xs opacity-70">Hover the nav links to see preloading; click anchors on About to test scroll/anchors.</p>
      </section>
    </div>
  </aside>
</div>

<script module>
import Navaid from 'navaid'

import * as ProjectsRoute from './routes/Projects.svelte'
import * as ContactRoute from './routes/Contact.svelte'
import * as AboutRoute from './routes/About.svelte'
import * as AccountRoute from './routes/Account.svelte'
import * as UsersRoute from './routes/Users.svelte'
import * as FilesRoute from './routes/Files.svelte'
import * as ArticleRoute from './routes/Article.svelte'


// prettier-ignore
/** @type {Array<[string|RegExp, any]>} */
const routes = [
  ['/', {}],
  ['/projects', ProjectsRoute],
  ['/contact', ContactRoute],
  ['/about', AboutRoute],
  ['/account', AccountRoute],
  ['/users/:id', UsersRoute],
  ['/files/*', FilesRoute],
  [/^\/articles\/(?<year>[0-9]{4})$/, ArticleRoute],
]
let Component = $state()
let is_404 = $state(false)
const route = $state({path: location.pathname, params: null})

const router = new Navaid(routes, {
    base: '/',
    async on404(url) {
        console.log('404', url)
        is_404 = true
        Component = null
        Object.assign(route, {path: url, params: null})
    },
    // preloadDelay: 20,
    // preloadOnHover: true,
    async onRoute(uri, matched, params, data) {
        console.log('onRoute', {uri, matched, params, data})
        is_404 = false
        Component = matched[1]?.default || null
        Object.assign(route, {path: uri, params})
    },
})
router.listen()

// for (const [path, cmp_] of routes) {
//     router.on(path, params => {
//         is404 = false
//         document.startViewTransition(async () => {
//             const {default: cmp, ...exports} = await cmp_

//             if (exports?.validate_params && !(await exports.validate_params(params))) {
//                 router.route('/')
//                 return
//             }

//             Component = cmp
//             Object.assign(route, {path: location.pathname, params})
//         })
//     })
// }

// window.router_initialized = !!window.router_initialized
// session.subscribe($session => {
//     if (!window.router_initialized && $session.loaded) {
//         setTimeout(() => router.listen(), 10)
//         window.router_initialized = true
//     }
// })
</script>

<script>
import {setContext} from 'svelte'
setContext('router', router)
</script>
