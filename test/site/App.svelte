<div class="min-h-screen bg-gray-50 font-sans text-gray-900">
    <header class="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
        <nav class="mx-auto flex max-w-3xl items-center justify-center gap-1 p-3">
            <a href={href_for('/')} class="rounded-md px-3 py-1.5 hover:bg-gray-100">Home</a>
            <a href={href_for('/products')} class="rounded-md px-3 py-1.5 hover:bg-gray-100"
                >Products</a
            >
            <a href={href_for('/posts')} class="rounded-md px-3 py-1.5 hover:bg-gray-100">Posts</a>
            <a href={href_for('/search-params')} class="rounded-md px-3 py-1.5 hover:bg-gray-100"
                >Search params</a
            >
            <a href={href_for('/cache')} class="rounded-md px-3 py-1.5 hover:bg-gray-100">Cache</a>
            <a href={href_for('/contact')} class="rounded-md px-3 py-1.5 hover:bg-gray-100"
                >Contact</a
            >
            <a href={href_for('/about')} class="rounded-md px-3 py-1.5 hover:bg-gray-100">About</a>
            <a href={href_for('/account')} class="rounded-md px-3 py-1.5 hover:bg-gray-100"
                >Account</a
            >
            <a href={href_for('/admin/1')} class="rounded-md px-3 py-1.5 hover:bg-gray-100">Admin</a
            >
            <a
                href={href_for('/users/42')}
                class="rounded-md px-3 py-1.5 hover:bg-gray-100 {route_path.startsWith('/users')
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700'}">User 42</a
            >
            <a
                href={href_for('/files/foo/bar')}
                class="rounded-md px-3 py-1.5 hover:bg-gray-100 {route_path.startsWith('/files')
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700'}">Files</a
            >
            <a href={href_for('/scroll')} class="rounded-md px-3 py-1.5 hover:bg-gray-100">Scroll</a
            >
            <button
                class="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold uppercase hover:bg-gray-100 {current_locale ===
                'ar'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700'}"
                onclick={() => goto_locale('ar')}>AR</button
            >
            <button
                class="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold uppercase hover:bg-gray-100 {current_locale ===
                'en'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700'}"
                onclick={() => goto_locale('en')}>EN</button
            >
        </nav>
    </header>

    <main class="mx-auto max-w-3xl p-6">
        {#if app_layout_active}
            <AppLayoutCmp data={app_layout_data} />
        {/if}
        {#if admin_layout_active}
            <AdminLayoutCmp data={admin_layout_data} />
        {/if}
        {#if Component}
            <Component params={$route.params} data={route_data} {router} />
        {:else}
            <h1 class="mb-2 text-2xl font-semibold">Home</h1>
            <p class="opacity-80">Welcome. Use the navigation to try routes.</p>
        {/if}

        {#if is_404}
            <div class="flex flex-col items-center justify-center gap-3 py-16 text-2xl font-bold">
                <h1>Page not found</h1>
                <a class="text-blue-700 hover:underline" href={href_for('/')}>Go home</a>
            </div>
        {/if}
    </main>

    <aside class="mx-auto max-w-3xl p-6 pt-0">
        <div class="grid gap-4 sm:grid-cols-2">
            <section class="rounded-md border border-gray-200 bg-white p-4">
                <h2 class="mb-2 font-semibold">Programmatic</h2>
                <p class="mb-2 text-xs opacity-70">aria-current is enabled for active links.</p>
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
                    <div><span class="font-mono">locale</span>: {current_locale}</div>
                    <div><span class="font-mono">public</span>: {public_path}</div>
                    <div><span class="font-mono">internal</span>: {route_path}</div>
                    <div>
                        <span class="font-mono">params</span>:
                        <span class="font-mono">{JSON.stringify($route.params)}</span>
                    </div>
                    <div><span class="font-mono">hash</span>: {$route.url?.hash || ''}</div>
                    <div><span class="font-mono">revalidations</span>: {revalidate_count}</div>
                    {#if route_data?.__meta}
                        <div>
                            <span class="font-mono">sources</span>:
                            <span class="font-mono">{JSON.stringify(route_data.__meta.source)}</span
                            >
                        </div>
                    {/if}
                    <div class="pt-1">
                        <span class="font-mono">layout data</span>:
                        <div class="mt-1 space-y-1 text-xs">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="font-mono">app</span>
                                <span class="font-mono"
                                    >{JSON.stringify(app_layout_data ?? null)}</span
                                >
                            </div>
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="font-mono">admin</span>
                                <span class="font-mono"
                                    >{JSON.stringify(admin_layout_data ?? null)}</span
                                >
                            </div>
                        </div>
                    </div>
                </div>
                <p class="mt-3 text-xs opacity-70">
                    Hover the nav links to see preloading; click anchors on About to test
                    scroll/anchors.
                </p>
            </section>

            <section class="rounded-md border border-gray-200 bg-white p-4">
                <h2 class="mb-2 font-semibold">Rewrite</h2>
                <p class="text-sm text-gray-700">
                    One canonical route tree, two public URL variants. Switch locale without
                    duplicating routes.
                </p>
                <div class="mt-3 flex flex-wrap gap-2 text-sm">
                    <a
                        class="rounded bg-gray-100 px-3 py-1.5 hover:bg-gray-200"
                        href={href_for('/about')}
                    >
                        current about
                    </a>
                    <a
                        class="rounded bg-gray-100 px-3 py-1.5 hover:bg-gray-200"
                        href={href_for('/about', 'en')}
                    >
                        force /en/about
                    </a>
                    <a
                        class="rounded bg-gray-100 px-3 py-1.5 hover:bg-gray-200"
                        href={href_for('/about', 'ar')}
                    >
                        force /about
                    </a>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                    <button
                        class="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700"
                        onclick={() => router.goto('/contact', {context: {locale: 'en'}})}
                    >
                        goto('/contact', &#123; locale: 'en' &#125;)
                    </button>
                    <button
                        class="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700"
                        onclick={() => router.goto('/contact', {context: {locale: 'ar'}})}
                    >
                        goto('/contact', &#123; locale: 'ar' &#125;)
                    </button>
                </div>
                <div class="mt-3 space-y-1 text-xs text-gray-600">
                    <div>
                        <span class="font-mono">href('/contact')</span>: {href_for('/contact')}
                    </div>
                    <div>
                        <span class="font-mono">href('/contact', en)</span>: {href_for(
                            '/contact',
                            'en',
                        )}
                    </div>
                    <div>
                        <span class="font-mono">href('/contact', ar)</span>: {href_for(
                            '/contact',
                            'ar',
                        )}
                    </div>
                </div>
            </section>
        </div>
    </aside>
</div>
<div class="request-indicator" class:active={$is_navigating}></div>

<script module>
import Navgo, {v} from '../../index.js'

import * as ProductsRoute from './routes/Products.svelte'
import * as ProductRoute from './routes/Product.svelte'
import * as PostsRoute from './routes/Posts.svelte'
import * as PostRoute from './routes/Post.svelte'
import * as SearchParamsRoute from './routes/SearchParams.svelte'
import * as CacheRoute from './routes/Cache.svelte'
import * as ContactRoute from './routes/Contact.svelte'
import * as AboutRoute from './routes/About.svelte'
import * as AccountRoute from './routes/Account.svelte'
import * as AdminRoute from './routes/Admin.svelte'
import * as UsersRoute from './routes/Users.svelte'
import * as FilesRoute from './routes/Files.svelte'
import * as ScrollRoute from './routes/Scroll.svelte'
import * as CoerceRoute from './routes/Coerce.svelte'
import * as AppLayout from './layouts/App.svelte'
import * as AdminLayout from './layouts/Admin.svelte'
import AppLayoutCmp from './layouts/App.svelte'
import AdminLayoutCmp from './layouts/Admin.svelte'

const locale_rewrite = {
    input({url}) {
        const locale = url.pathname === '/en' || url.pathname.startsWith('/en/') ? 'en' : 'ar'
        if (locale === 'en') url.pathname = url.pathname.replace(/^\/en(?=\/|$)/, '') || '/'
        return {url, context: {locale}}
    },
    output({url, context}) {
        const locale = context?.locale || 'ar'
        if (locale === 'en') url.pathname = url.pathname === '/' ? '/en' : `/en${url.pathname}`
        return {url, context: {locale}}
    },
}

// prettier-ignore
/** @type {Array<any>} */
const routes = [
  {
    id: 'app',
    layout: AppLayout,
    // note: loaders return a Promise for plain data; returning a plain object is treated as a load plan
    loader: async () => ({session: {user: 'Zara', plan: 'pro'}}),
    routes: [
      ['/', {}],
      ['/cache', CacheRoute],
      ['/products', ProductsRoute],
      ['/products/:id', ProductRoute],
      ['/posts', PostsRoute],
      ['/posts/:id', PostRoute],
      ['/search-params', SearchParamsRoute],
      ['/contact', ContactRoute],
      ['/about', AboutRoute],
      ['/account', AccountRoute],
      ['/users/:id', UsersRoute],
      [
        '/coerce/:id',
        CoerceRoute,
        {
          validate: () => true,
          param_rules: {
            id: {
              schema: v.pipe(v.string(), v.regex(/^\d+$/)),
              coercer: value => (value == null ? value : Number(value)),
            },
          },
        },
      ],
      {
        id: 'admin',
        layout: AdminLayout,
        loader: async ({params}) => ({section: 'admin', admin_id: params?.id ?? null}),
        routes: [
          [
            '/admin/:id',
            AdminRoute,
            {
              // constrain/coerce params
              param_rules: {
                id: v.pipe(v.string(), v.toNumber(), v.minValue(1)),
              },
              // load data before URL changes; result goes to after_navigate(...)
              loader: async ({params}) => ({audit: 'ok', admin_id: params.id}),
              // per-route guard; cancel synchronously to block nav
              before_route_leave(nav) {
                if ((nav.type === 'link' || nav.type === 'goto') && !confirm('Exit admin?')) {
                  nav.cancel()
                }
              },
            },
          ],
        ],
      },
      ['/files/*', FilesRoute],
      ['/scroll', ScrollRoute],
    ],
  },
]

let Component = $state()
let is_404 = $state(false)
let route_data = $state(null)
let app_layout_data = $state(null)
let admin_layout_data = $state(null)
let app_layout_active = $state(false)
let admin_layout_active = $state(false)
let revalidate_count = $state(0)

function sync_from_nav(nav) {
    route_data = nav.to?.data ?? null
    const layouts = nav.to?.layouts ?? {}
    app_layout_data = layouts.app?.data ?? null
    admin_layout_data = layouts.admin?.data ?? null
    app_layout_active = !!layouts.app
    admin_layout_active = !!layouts.admin
    Component = nav.to?.route?.[1]?.default || null
}

const router = new Navgo(routes, {
    async after_navigate(nav, on_revalidate) {
        is_404 = nav.to?.data?.__error?.status === 404
        if (is_404) {
            console.log('404 for', nav.to.url.pathname)
            return
        }
        sync_from_nav(nav)

        on_revalidate?.(() => {
            revalidate_count += 1
            sync_from_nav(nav)
        })
    },
    aria_current: true,
    rewrite: locale_rewrite,
})
router.init()
const {route, is_navigating} = router
</script>

<script>
import {onDestroy} from 'svelte'

const public_path = $derived($route.url?.pathname || '/')
const route_path = $derived($route.path || '/')
const current_locale = $derived($route.context?.locale || 'ar')
const current_internal_href = $derived(
    ($route.internal_url?.pathname || '/') +
        ($route.internal_url?.search || '') +
        ($route.internal_url?.hash || ''),
)

function href_for(path, locale = undefined) {
    return router.href(path, locale ? {context: {locale}} : undefined) || path
}

function goto_locale(locale) {
    router.goto(current_internal_href, {context: {locale}})
}

onDestroy(() => {
    router.destroy()
})
</script>

<style>
:global(nav a[aria-current='page']) {
    text-decoration: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 4px;
    /* bg-blue-50 text-blue-700 */
    background-color: #eff6ff;
    color: #1d4ed8;
}
</style>
