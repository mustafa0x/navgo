## Install

```
$ pnpm install --dev navaid
```


## Usage

```js
import Navaid from 'navaid';

// Define routes up front (strings or RegExp)
const routes = [
  ['/',                        /* optional data */],
  ['/users/:username'],
  ['/books/*'],
  [/articles\/(?<year>[0-9]{4})/],
  [/privacy|privacy-policy/],
];

// Create router with options + callbacks
const router = new Navaid(routes, {
  base: '/',
  on404(uri) {
    console.log('404 for', uri);
  },
  onRoute(uri, matched, params, data) {
    // `matched` is the tuple from your `routes` list
    // e.g. ['/users/:username'] or a RegExp
    console.log('matched:', matched[0], 'uri:', uri, 'params:', params, 'data:', data);
  },
});

// Process current location
router.run();

// Long‑lived router: history + <a> bindings
// Also immediately processes the current location
router.listen();
```

## API

### new Navaid(routes?, options?)

Returns: `Router`

Create a router instance by defining your routes up front and passing callbacks via `options`.

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
- RegExp patterns (with optional named groups)

> Notes:
> - Pattern strings are matched relative to the [`base`](#base) path.
> - RegExp patterns are used as-is. If you use named capture groups (e.g. `(?<year>\d{4})`), those keys will appear in the `params` object. Unnamed groups are ignored.

#### options
Type: `Object`

- base: `String` (default `'/'`)
  - The base pathname for your application. Navaid will accept it with or without leading/trailing slashes.
- on404: `(uri: string) => void`
  - Called when no route matches. Receives the formatted `uri`; see [`format`](#formaturi).
- onRoute: `(uri: string, matched: [string, any?], params: Record<string, string|null>, data?: unknown) => void`
  - Called when a route matches. `matched` is the original tuple from your `routes` list, `params` contains extracted values (including `'*'` for wildcards), and `data` is any value returned by your route's `loaders` (if defined). Optional parameters that aren’t present are `null`.

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

### goto(uri, options?)
Returns: `Promise<void>`

Runs any matching route `loaders` before updating the URL and emitting `onRoute`. Use `replace: true` to replace the current history entry.

#### uri
Type: `String`

The desired path to navigate. If it begins with `/` and does not match the configured [`base`](#base), it will be prefixed automatically.

#### options
Type: `Object`

- replace: `Boolean` (default `false`)
  - When `true`, uses `history.replaceState`; otherwise `history.pushState`.

### run()
Returns: `void`

Processes the current `location.pathname`. This does not modify browser history nor emit History API events.

### listen()
Returns: `void`

Attaches global listeners to synchronize your router with URL changes, which allows Navaid to respond consistently to your browser's <kbd>BACK</kbd> and <kbd>FORWARD</kbd> buttons.

These are the (global) events that Navaid creates and/or responds to:

* popstate
* replacestate
* pushstate

Navaid will also bind to any `click` event(s) on anchor tags (`<a href="" />`) so long as the link has a valid `href` that matches the [`base`](#base) path. Navaid **will not** intercept links that have _any_ `target` attribute or if the link was clicked with a special modifier (eg; <kbd>ALT</kbd>, <kbd>SHIFT</kbd>, <kbd>CMD</kbd>, or <kbd>CTRL</kbd>).

While listening, link clicks are intercepted and translated into `goto()` navigations. You can also call `goto()` programmatically.

### preload(uri)
Returns: `Promise<unknown>`

Preload a route’s `loaders` data for a given `uri` without navigating. Concurrent calls for the same path are deduped.

### pushState(url?, state?)
Returns: `void`

Perform a shallow history push: updates the URL/state without triggering route processing.

### replaceState(url?, state?)
Returns: `void`

Perform a shallow history replace: updates the URL/state without triggering route processing.

### unlisten()
Returns: `undefined`

Detach all listeners initialized by [`listen()`](#listen).

> **Note:** This method is only available after `listen()` has been invoked.


## License

MIT © [Luke Edwards](https://lukeed.com)
