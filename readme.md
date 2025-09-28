<div align="center">
  <img src="navaid.png" alt="navaid" height="160" />
</div>

<div align="center">
  <a href="https://npmjs.org/package/navaid">
    <img src="https://badgen.now.sh/npm/v/navaid" alt="version" />
  </a>
  <a href="https://github.com/lukeed/navaid/actions">
    <img src="https://github.com/lukeed/navaid/workflows/CI/badge.svg" alt="CI" />
  </a>
  <a href="https://licenses.dev/npm/navaid">
    <img src="https://licenses.dev/b/npm/navaid" alt="licenses" />
  </a>
  <a href="https://npmjs.org/package/navaid">
    <img src="https://badgen.now.sh/npm/dm/navaid" alt="downloads" />
  </a>
  <a href="https://packagephobia.now.sh/result?p=navaid">
    <img src="https://packagephobia.now.sh/badge?p=navaid" alt="install size" />
  </a>
</div>

<div align="center">A navigation aid (aka, router) for the browser in ~772 bytes (min+gzip)!</div>

## Install

```
$ npm install --save navaid
```


## Usage

```js
import navaid from 'navaid';

// Define routes up front
const routes = [
  ['/',                        /* optional data */],
  ['/users/:username'],
  ['/books/*'],
];

// Create router with options + callbacks
const router = navaid(routes, {
  base: '/',
  on404(uri) {
    console.log('404 for', uri);
  },
  onRoute(uri, matched, params) {
    // `matched` is the tuple from your `routes` list
    // e.g. ['/users/:username']
    console.log('matched:', matched[0], 'uri:', uri, 'params:', params);
  },
});

// Run as single instance
router.run('/');
//=> "matched: / uri: / params: {}"
router.run('/users/lukeed');
//=> "matched: /users/:username uri: /users/lukeed params: { username: 'lukeed' }"
router.run('/books/kids/narnia');
//=> "matched: /books/* uri: /books/kids/narnia params: { '*': 'kids/narnia' }"

// Long‑lived router: history + <a> bindings
// Also immediately processes the current location
router.listen();
```

## API

### navaid(routes?, options?)

Returns: `Router`

Create a router by defining your routes up front and passing callbacks via `options`.

#### routes
Type: `Array<[pattern: string, data?: any]>`<br>
Default: `[]`

Each route is a tuple whose first item is the pattern string and whose second (optional) item is any data you want to associate (often a lazy import). The `data` is not used by Navaid itself; it’s returned to you via `onRoute`.

Supported pattern types:

- static (`/users`)
- named parameters (`/users/:id`)
- nested parameters (`/users/:id/books/:title`)
- optional parameters (`/users/:id?/books/:title?`)
- wildcards (`/users/*`)

> Note: Pattern strings are matched relative to the [`base`](#base) path.

#### options
Type: `Object`

- base: `String` (default `'/'`)
  - The base pathname for your application. Navaid will accept it with or without leading/trailing slashes.
- on404: `(uri: string) => void`
  - Called when no route matches. Receives the formatted `uri`; see [`format`](#formaturi).
- onRoute: `(uri: string, matched: [string, any?], params: Record<string, string|null>) => void`
  - Called when a route matches. `matched` is the original tuple from your `routes` list and `params` contains extracted values (including `'*'` for wildcards). Optional parameters that aren’t present are `null`.

> Important: Navaid only processes routes that match your `base` path. `on404` will never run for URLs that do not begin with `base`. This allows multiple Navaid instances to coexist on the same page with different bases.


### format(uri)
Returns: `String` or `false`

Formats and returns a pathname relative to the [`base`](#base) path.

If the `uri` **does not** begin with the `base`, then `false` will be returned instead.<br>
Otherwise, the return value will always lead with a slash (`/`).

> **Note:** This is called automatically within the [`listen()`](#listen) and [`run()`](#runuri) methods.

#### uri
Type: `String`

The path to format.

> **Note:** Much like [`base`](#base), paths with or without leading and trailing slashes are handled identically.

### route(uri, replace)
Returns: `undefined`

Programmatically route to a path whilst modifying & using the `history` events.

#### uri
Type: `String`

The desired path to navigate.

> **Important:** Navaid will prefix your `uri` with the [`base`](#base), if/when defined.

#### replace
Type: `Boolean`<br>
Default: `false`

If `true`, then [`history.replaceState`](https://developer.mozilla.org/en-US/docs/Web/API/History_API#The_replaceState()_method) will be used. Otherwise [`history.pushState`](https://developer.mozilla.org/en-US/docs/Web/API/History_API#Adding_and_modifying_history_entries) will be used.

This is generally used for redirects; for example, redirecting a user away from a login page if they're already logged in.


> Migration from v2: The `.on(pattern, handler)` API has been replaced with route-table initialization and the `onRoute` callback. Define all routes up front and respond within `onRoute`.

### run(uri)
Returns: `Router`

Executes the matching handler for the specified path.

Unlike `route()`, this does not pass through the `history` state nor emit any events.

> **Note:** You'll generally want to use `listen()` instead, but `run()` may be useful in Node.js/SSR contexts.

#### uri
Type: `String`<br>
Default: `location.pathname`

The pathname to process. If it matches a route, your `onRoute` callback will be executed.

### listen(uri?)
Returns: `Router`

Attaches global listeners to synchronize your router with URL changes, which allows Navaid to respond consistently to your browser's <kbd>BACK</kbd> and <kbd>FORWARD</kbd> buttons.

These are the (global) events that Navaid creates and/or responds to:

* popstate
* replacestate
* pushstate

Navaid will also bind to any `click` event(s) on anchor tags (`<a href="" />`) so long as the link has a valid `href` that matches the [`base`](#base) path. Navaid **will not** intercept links that have _any_ `target` attribute or if the link was clicked with a special modifier (eg; <kbd>ALT</kbd>, <kbd>SHIFT</kbd>, <kbd>CMD</kbd>, or <kbd>CTRL</kbd>).

#### uri
Type: `String`<br>
Default: `undefined`

*(Optional)* Any value passed to `listen()` will be forwarded to the underlying [`run()`](#runuri) call.<br>When not defined, `run()` will read the current `location.pathname` value.

### unlisten()
Returns: `undefined`

Detach all listeners initialized by [`listen()`](#listen).

> **Note:** This method is only available after `listen()` has been invoked.


## License

MIT © [Luke Edwards](https://lukeed.com)
