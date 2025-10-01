<nav>
  <a href="/">Home</a>
  <a href="/projects">Projects</a>
  <a href="/contact">Contact</a>
  <a href="/about">About</a>
  <a href="/account">Account</a>
</nav>

<div class="flex min-h-screen flex-col">
    <main class="flex flex-1 flex-col">
            {#if Component}
                <Component params={route.params} />
            {:else}
              Home
            {/if}
            {#if is404}
                <div
                    class="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-2xl font-bold"
                >
                    <h1>Page not found</h1>
                    <a class="text-blue-600" href="/">Home</a>
                </div>
            {/if}
    </main>
</div>

<script module>
import navaid from 'navaid'

import * as ProjectsRoute from './routes/Projects.svelte'
import * as ContactRoute from './routes/Contact.svelte'
import * as AboutRoute from './routes/About.svelte'
import * as AccountRoute from './routes/Account.svelte'


// prettier-ignore
/** @type {Array<[string, any]>} */
const routes = [
    ['/', null],
    ['/projects', ProjectsRoute],
    ['/contact', ContactRoute],
    ['/about', AboutRoute],
    ['/account', AccountRoute],
]
let Component = $state()
let is404 = $state(false)

const router = new navaid(routes, {
    base: '/',
    async on404(url) {
        console.log('404', url)
        is404 = true
        Component = null
        Object.assign(route, {path: url, params: null})
    },
    // preloadDelay: 20,
    // preloadOnHover: true,
    async onRoute(uri, matched, params, data) {
        console.log('onRoute', {uri, matched, params, data})
        Component = matched[1]?.default || null
    },
})
router.listen()
const route = $state({path: location.pathname, params: null})

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
