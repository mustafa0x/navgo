import {mount} from 'svelte'
import App from './App.svelte'
import Navgo from '../../index.js'
import * as ProductsRoute from './routes/Products.svelte'
import * as PostsRoute from './routes/Posts.svelte'
import * as ContactRoute from './routes/Contact.svelte'
import * as AboutRoute from './routes/About.svelte'
import * as AccountRoute from './routes/Account.svelte'
import * as UsersRoute from './routes/Users.svelte'
import * as FilesRoute from './routes/Files.svelte'
import * as ScrollRoute from './routes/Scroll.svelte'

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

const props = $state({Component: null, route_data: null, is_404: false})
function after_navigate(nav) {
    props.is_404 = nav.to.data?.__error?.status === 404
    props.route_data = nav.to.data ?? null
    props.Component = nav.to.route?.[1]?.default || null
}

const router = new Navgo(routes, {after_navigate})
await router.init()
mount(App, {target: document.body, props})
