import { throttle, isEqual } from 'es-toolkit'
import { debounce } from 'es-toolkit/function'
import { isPromise } from 'es-toolkit/predicate'
import * as v from 'valibot'
import {
	build_search_string,
	build_search_url,
	create_search_store,
	merge_search_opts,
	normalize_path,
	read_search,
	scroll_to_hash,
	validate_search,
} from './utils.js'
import * as svelte from 'svelte'
import { writable } from 'svelte/store'
export { v }
import { parse } from 'regexparam'

const ℹ = (...args) => console.debug(...args)

export default class Navgo {
	/** @type {Options} */
	#opts = {
		base: '/',
		rewrite: undefined,
		preload_delay: 20,
		preload_on_hover: true,
		bootstrap: undefined,
		before_navigate: undefined,
		after_navigate: undefined,
		tick: svelte.tick,
		scroll_to_top: true,
		aria_current: false,
		attach_to_window: true,
		search: {
			show_defaults: false,
			debounce: 0,
			push_history: true,
			sort: true,
			array_style: 'repeat',
		},
		load_plan_defaults: {
			parse: 'json',
			cache: { strategy: 'swr', ttl: 86400000 },
		},
	}
	/** @type {Array<{ pattern: RegExp, keys: string[]|null, data: RouteTuple, stack: RouteGroup[] }>} */
	#routes = []
	/** @type {string} */
	#base = '/'
	/** @type {RegExp} */
	#base_rgx = /^\/+/
	/** @type {Map<string, { promise?: Promise<PreloadBundle>, data?: PreloadBundle }>} */
	#preloads = new Map()
	/** @type {unknown[]|null} */
	#bootstrap = null
	/** @type {{ url: URL|null, internal_url: URL|null, path: string, context: any, route: RouteTuple|null, params: Params, matches: Match[], layouts: Record<string, Match>, search_params: Record<string, unknown> }} */
	#current = {
		url: null,
		internal_url: null,
		path: '',
		context: undefined,
		route: null,
		params: {},
		matches: [],
		layouts: Object.create(null),
		search_params: {},
	}
	/** @type {number} */
	#route_idx = 0
	#hash_target = ''
	/** @type {Map<number, Map<string, { x: number, y: number }>>} */
	#areas_pos = new Map()
	// Latest-wins nav guard: monotonic id and currently active id
	/** @type {number} */
	#nav_seq = 0
	/** @type {number} */
	#nav_active = 0
	/** @type {(e: Event) => void | null} */
	#scroll_handler = null
	/** @type {AbortController|null} */
	#loader_controller = null
	#cache_name = 'navgo'
	#revalidation = null
	/** @type {any} */
	#search_schema = null
	#search_defaults = {}
	#search_keys = []
	#search_opts = { ...this.#opts.search }
	#search_syncing = false
	#search_unsub = null
	#search_writer = null
	route = writable({
		url: new URL(location.href),
		internal_url: new URL(location.href),
		path: normalize_path(new URL(location.href).pathname),
		context: undefined,
		route: null,
		params: {},
		matches: [],
		layouts: Object.create(null),
		search_params: {},
	})
	/** @type {Navigation|null} */
	nav = null
	is_navigating = writable(false)
	search_params = create_search_store()

	//
	// Event listeners
	//
	#click = async e => {
		ℹ('[🧭 event:click]', { type: e?.type, target: e?.target })
		const info = this.#link_from_event(e, true)
		if (!info) return

		const url = new URL(info.href, location.href)

		// Hash-only navigation on same path: let browser handle, but track index
		if (url.hash && this.#same_public_url(url, this.#current.url)) {
			const cur_hash = location.href.split('#')[1]
			const next_hash = url.href.split('#')[1] ?? ''
			if (cur_hash === next_hash) {
				// same hash: just scroll without history churn
				e.preventDefault()
				if (next_hash === '' || (next_hash === 'top' && !document.getElementById('top'))) {
					scrollTo({ top: 0 })
				} else {
					scroll_to_hash('#' + next_hash)
				}
				ℹ('[🧭 hash]', 'same-hash scroll')
				return
			}

			// different hash on same path — let browser update URL + scroll
			this.#hash_target = url.href
			ℹ('[🧭 hash]', 'navigate', { href: url.href })
			return
		}

		e.preventDefault()

		// allow the browser to repaint before navigating —
		// this prevents INP scores being penalised
		await new Promise(fulfil => {
			requestAnimationFrame(() => {
				setTimeout(fulfil, 0)
			})

			// fallback for edge case where rAF doesn't fire because e.g. tab was backgrounded
			setTimeout(fulfil, 100)
		})

		ℹ('[🧭 link]', 'intercept', { href: info.href })
		this.goto(info.href, { replace: false, literal: true }, 'link', e)
	}

	#on_popstate = ev => {
		// ignore popstate while a hash-originating nav is in flight
		if (this.#hash_target === location.href) return

		const st = ev?.state?.__navgo
		ℹ('[🧭 event:popstate]', st)
		// Hash-only or state-only change: pathname+search unchanged -> skip loader
		const cur = this.#current.url
		const target = this.#resolve_url_and_path(location.href, { literal: true })
		if (cur && target && this.#same_public_url(target.url, cur)) {
			const next_current = this.#update_current_info(target)
			ℹ('  - [🧭 event:popstate]', 'same path+search; skip loader')
			this.#apply_scroll(ev)
			this.route.set(next_current)
			this.#update_active_links()
			return
		}
		// Explicit shallow entries (pushState/replaceState).
		// Only treat as shallow if it was created from the pathname that's currently rendered.
		// This prevents shallow history entries from keeping the wrong component after a reload
		// or after navigating to a different route and coming back via Back/Forward.
		if (st?.shallow) {
			const from = typeof st.from === 'string' ? st.from : null
			if (!from || (cur && normalize_path(from) === normalize_path(cur.pathname))) {
				const next_current = this.#update_current_info(target)
				this.#sync_search_from_url(next_current.url)
				ℹ('  - [🧭 event:popstate]', 'shallow entry; skip loader')
				this.#apply_scroll(ev)
				this.route.set(next_current)
				this.#update_active_links()
				return
			}
		}

		ℹ('  - [🧭 event:popstate]', { idx: st?.idx })
		this.goto(location.href, { replace: true, literal: true }, 'popstate', ev)
	}
	#on_hashchange = () => {
		// if hashchange originated from a click we tracked, bump our index and persist it
		const hash_target = this.#hash_target
		const hash_from_click = hash_target === location.href
		this.#hash_target = ''
		if (hash_from_click) {
			const prev_idx = this.#route_idx
			// Hash navigation creates a new history entry and clears the browser's forward stack.
			// Clear our forward scroll snapshots too (avoid stale reuse at the next idx).
			this.#clear_onward_history()
			const prev = history.state && typeof history.state == 'object' ? history.state : {}
			const next_idx = prev_idx + 1
			const next_state = { ...prev, __navgo: { ...prev.__navgo, idx: next_idx } }
			history.replaceState(next_state, '', location.href)
			this.#route_idx = next_idx
			const m = new Map(this.#areas_pos.get(prev_idx) || [])
			m.set('window', { x: scrollX || 0, y: scrollY || 0 })
			this.#areas_pos.set(next_idx, m)
			ℹ('[🧭 event:hashchange]', { idx: next_idx, href: location.href })
		} else {
			// hashchange via Back/Forward — restore previous position when hash is removed
			const idx = history.state?.__navgo?.idx
			if (!hash_target && typeof idx === 'number') this.#route_idx = idx
			if (!location.hash) {
				const pos = this.#areas_pos.get(this.#route_idx)?.get?.('window')
				if (pos) {
					setTimeout(() => scrollTo(pos.x, pos.y), 0)
					ℹ('[🧭 scroll]', 'restore hash-back', { idx: this.#route_idx, ...pos })
				} else if (this.#opts.scroll_to_top) {
					// no saved position for previous entry — default to top
					setTimeout(() => scrollTo(0, 0), 0)
					ℹ('[🧭 scroll]', 'hash-back -> top')
				}
			}
		}
		// update current URL snapshot and notify
		const next_current = this.#update_current_info(
			this.#resolve_url_and_path(location.href, { literal: true }),
		)
		this.route.set(next_current)
		this.#update_active_links()
	}

	/** @type {any} */
	#hover_timer = null
	#maybe_preload = ev => {
		const info = this.#link_from_event(ev, ev.type === 'mousedown')
		if (info) {
			ℹ('[🧭 preload]', 'link hover/tap', { href: info.href })
			this.preload(info.href, { literal: true })
		}
	}
	#mouse_move = ev => {
		clearTimeout(this.#hover_timer)
		this.#hover_timer = setTimeout(() => this.#maybe_preload(ev), this.#opts.preload_delay)
	}
	#tap = ev => this.#maybe_preload(ev)

	#on_scroll = e => {
		// prevent hash from overwriting the previous entry’s saved position.
		if (this.#hash_target === location.href) return

		const el = e?.target
		const id =
			!el || el === window || el === document ? 'window' : el?.dataset?.scrollId || el?.id
		if (!id) return
		const pos =
			id === 'window'
				? { x: scrollX || 0, y: scrollY || 0 }
				: { x: el.scrollLeft || 0, y: el.scrollTop || 0 }
		const m = this.#areas_pos.get(this.#route_idx) || new Map()
		m.set(String(id), pos)
		this.#areas_pos.set(this.#route_idx, m)
		ℹ('[🧭 scroll:set]', this.#route_idx, m)
	}

	#before_unload = ev => {
		// persist scroll for refresh / session restore
		try {
			const idx = history.state?.__navgo?.idx ?? this.#route_idx
			sessionStorage.setItem(
				`__navgo_scroll:${idx}`,
				JSON.stringify({ x: scrollX, y: scrollY }),
			)
		} catch {}

		ℹ('[🧭 event:beforeunload]', 'persist scroll + guard')

		const nav = this.#make_nav({
			type: 'leave',
			to: null,
			will_unload: true,
			event: ev,
		})
		this.#run_before_route_leave(nav)
		if (nav.cancelled) {
			ℹ('[🧭 navigate]', 'cancelled by before_route_leave during unload')
			ev.preventDefault()
			ev.returnValue = ''
			return
		}

		history.scrollRestoration = 'auto'
	}

	//
	// Helpers
	//
	#info(state) {
		if (!state?.url) return null
		const internal_url = state.internal_url || state.url
		return {
			url: state.url,
			internal_url,
			path: state.path || internal_url.pathname || '',
			context: state.context,
		}
	}

	#target(state, extra = undefined) {
		const info = this.#info(state)
		if (!info) return null
		const target = {
			...info,
			params: state?.params || {},
			route: state?.route || null,
			matches: state?.matches || [],
			layouts: state?.layouts || Object.create(null),
		}
		return extra ? { ...target, ...extra } : target
	}

	#update_current_info(info, fallback = location.href) {
		this.#current = info
			? { ...this.#current, ...this.#info(info) }
			: { ...this.#current, url: new URL(fallback, location.href) }
		return this.#current
	}

	#coerce_url(url_raw, base = location.href) {
		if (url_raw == null) return new URL(location.href)
		let raw = url_raw instanceof URL ? url_raw.href : String(url_raw)
		const has_scheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw)
		const has_relative_prefix = /^(?:\/|\?|#|\.\/?|\.\.\/?)/.test(raw)
		if (!has_scheme && !has_relative_prefix) raw = '/' + raw
		return new URL(raw, base)
	}

	#public_key(url) {
		return normalize_path(url.pathname) + (url.search || '')
	}

	#same_public_url(a, b) {
		return !!a && !!b && this.#public_key(a) === this.#public_key(b)
	}

	#strip_base_path(pathname) {
		const value = normalize_path(pathname)
		const out = this.#base_rgx.test(value) && value.replace(this.#base_rgx, '/')
		return out || false
	}

	#apply_base_path(pathname) {
		const path = String(pathname || '/')
		const out = path[0] === '/' ? path : '/' + path
		if (this.#base == '/') return out
		if (out === '/') return this.#base + '/'
		return this.#base + out
	}

	#current_context(context = undefined) {
		return context !== undefined
			? context
			: this.#current.context !== undefined
				? this.#current.context
				: this.#resolve_public_url(location.href)?.context
	}

	#resolved_info(url, internal_url = url, context = undefined) {
		internal_url.pathname = normalize_path(internal_url.pathname)
		return {
			url,
			internal_url,
			path: internal_url.pathname,
			load_key: this.#public_key(url),
			context,
		}
	}

	#apply_rewrite(kind, url, context = undefined) {
		const fn = this.#opts.rewrite?.[kind]
		if (typeof fn !== 'function') return { url, context }
		try {
			const out = fn({
				url: new URL(url.href),
				current: this.#target(this.#current),
				context,
			})
			if (!out) return { url, context }
			if (typeof out === 'string' || out instanceof URL) {
				return { url: new URL(out, url), context }
			}
			return {
				url: new URL(out.url ?? url, url),
				context: out.context !== undefined ? out.context : context,
			}
		} catch (e) {
			ℹ('[🧭 rewrite]', kind, 'error', { err: e })
			return { url, context }
		}
	}

	#resolve_public_url(url_raw) {
		const url = this.#coerce_url(url_raw, location.href)
		if (url.origin !== location.origin) return null
		const stripped = this.#strip_base_path(url.pathname)
		if (!stripped) return null
		const internal_url = new URL(url.href)
		internal_url.pathname = stripped
		const rewritten = this.#apply_rewrite('input', internal_url)
		return this.#resolved_info(url, rewritten.url, rewritten.context)
	}

	#resolve_internal_url(url_raw, context = undefined) {
		const base =
			this.#current.internal_url?.href ||
			this.#resolve_public_url(location.href)?.internal_url?.href ||
			location.href
		const internal_url = this.#coerce_url(url_raw, base)
		if (internal_url.origin !== location.origin) return null
		internal_url.pathname = normalize_path(internal_url.pathname)
		const rewritten = this.#apply_rewrite(
			'output',
			internal_url,
			this.#current_context(context),
		)
		const url = rewritten.url
		if (url.origin !== location.origin) return null
		url.pathname = this.#apply_base_path(url.pathname)
		return this.#resolved_info(url, internal_url, rewritten.context)
	}

	#resolve_url_and_path(url_raw, opts = {}) {
		if (url_raw == null) return null
		const raw = url_raw instanceof URL ? url_raw.href : String(url_raw)
		const has_scheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw)
		const same_origin =
			!has_scheme || this.#coerce_url(url_raw, location.href).origin === location.origin
		const public_info = same_origin ? this.#resolve_public_url(url_raw) : null
		if (opts.literal) return public_info
		if (!same_origin) return null
		const use_public =
			!!public_info && public_info.path !== normalize_path(public_info.url.pathname)
		const out = use_public ? public_info : this.#resolve_internal_url(url_raw, opts.context)
		ℹ('[🧭 resolve]', {
			url_in: url_raw,
			mode: use_public ? 'public' : 'internal',
			url: out?.url?.href,
			internal_url: out?.internal_url?.href,
			path: out?.path,
			context: out?.context,
		})
		return out || public_info
	}

	/** @param {string} url @returns {string|false} */
	format(url) {
		if (!url) return url
		const out = this.#resolve_public_url(url)
		const value = out
			? out.internal_url.pathname +
				(out.internal_url.search || '') +
				(out.internal_url.hash || '')
			: false
		ℹ('[🧭 format]', { in: url, out: value || false })
		return value || false
	}

	href(url_raw = location.href, opts = {}) {
		const info = this.#resolve_url_and_path(url_raw, opts)
		if (!info) return false
		return opts.absolute ? info.url.href : info.url.pathname + info.url.search + info.url.hash
	}

	#link_from_event(e, check_button = false) {
		// prettier-ignore
		if (!e || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (check_button && e.button))
			return null
		const a = (e.composedPath()[0] || e.target)?.closest?.('a')
		const href = a?.getAttribute?.('href')
		return href &&
			!a.target &&
			!a.download &&
			a.host === location.host &&
			this.#resolve_url_and_path(href, { literal: true })
			? { a, href }
			: null
	}

	#update_active_links() {
		if (!this.#opts.aria_current) return
		const cur = this.#current.url && normalize_path(this.#current.url.pathname)
		if (!cur) return
		for (const a of document.querySelectorAll('a[href]')) {
			const href = a.getAttribute('href')
			if (href[0] === '#') continue
			const link_url = href && this.#resolve_url_and_path(href, { literal: true })?.url
			if (link_url && normalize_path(link_url.pathname) === cur)
				a.setAttribute('aria-current', 'page')
			else if (a.getAttribute('aria-current') === 'page') a.removeAttribute('aria-current')
		}
	}

	#get_hooks(route) {
		if (!route) return {}
		const a = route[1]
		const b = route[2]
		if (!b) return a || {}
		const hooks = { ...(a || {}), ...b }
		const ar = a?.param_rules
		const br = b?.param_rules
		if (ar || br) {
			const out = {}
			const norm_rule = r =>
				r?.schema !== undefined || r?.coercer !== undefined ? r : r ? { schema: r } : {}
			for (const k in ar || {}) out[k] = norm_rule(ar[k])
			for (const k in br || {}) out[k] = { ...out[k], ...norm_rule(br[k]) }
			hooks.param_rules = out
		}
		return hooks
	}

	#to_get_request(input, init) {
		const base = input instanceof Request ? input : new Request(input, init)
		const headers = new Headers(base.headers)
		if (init?.headers) {
			for (const [k, v] of new Headers(init.headers)) headers.set(k, v)
		}
		return new Request(base.url, { ...init, method: 'GET', headers })
	}

	#meta_key = '__navgo_meta:'
	#read_meta(url) {
		try {
			return JSON.parse(sessionStorage.getItem(this.#meta_key + url) || 'null')
		} catch {
			return null
		}
	}
	#write_meta(url, meta) {
		try {
			sessionStorage.setItem(this.#meta_key + url, JSON.stringify(meta))
		} catch {}
	}

	#make_loader_ctx(route, info, params, search_params, controller) {
		const { url, internal_url = url, path = internal_url?.pathname || '', context } = info || {}
		return {
			route_entry: route,
			url,
			internal_url,
			path,
			context,
			params,
			search_params,
			signal: controller.signal,
			fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }),
			invalidate: x => this.invalidate(x),
		}
	}

	/* Resolve search schema + options for the current match. */
	#resolve_search(matches, route, info, params) {
		const { url, internal_url = url, path = internal_url?.pathname || '', context } = info || {}
		const ctx = { route_entry: route, url, internal_url, path, context, params }
		let schema = null
		let opts = merge_search_opts(this.#opts.search || {})

		const apply_schema = s => {
			if (!s) return
			const sch = typeof s === 'function' ? s(ctx) : s
			if (sch?.entries) schema = sch
		}

		for (const m of matches || []) {
			if (m.type !== 'layout') continue
			const e = m.__entry
			opts = merge_search_opts(opts, e?.search_options)
			apply_schema(e?.search_schema)
		}

		const hooks = this.#get_hooks(route)
		opts = merge_search_opts(opts, hooks?.search_options)
		apply_schema(hooks?.search_schema)

		return { schema, opts }
	}

	#build_search_state(matches, route, info, params) {
		const { url } = info || {}
		const { schema, opts } = this.#resolve_search(matches, route, info, params)
		const defaults = schema ? v.getDefaults(schema) || {} : {}
		const search_params = schema
			? validate_search(read_search(url, schema, opts), schema, defaults, opts)
			: {}
		return { schema, opts, defaults, search_params }
	}

	/* Sync search_params store and route snapshot. */
	#set_search_store(values) {
		const next = values || {}
		this.#search_syncing = true
		try {
			this.#current.search_params = next
			if (this.#current.url) this.route.set(this.#current)
			this.search_params.set(next)
		} finally {
			this.#search_syncing = false
		}
	}

	/* Apply resolved search config to current route. */
	#set_search_state(search) {
		this.#search_schema = search?.schema || null
		this.#search_opts = merge_search_opts(this.#opts.search || {}, search?.opts || {})
		this.#search_defaults = search?.defaults || {}
		this.#search_keys = this.#search_schema?.entries
			? Object.keys(this.#search_schema.entries)
			: []
		this.#search_writer?.cancel?.()
		this.#search_writer =
			this.#search_opts.debounce > 0
				? debounce(v => this.#commit_search(v), this.#search_opts.debounce)
				: null
		this.search_params.set_stringifier(v => this.#stringify_search(v))
		this.#set_search_store(search?.search_params ?? {})
	}

	#stringify_search(values) {
		if (!this.#search_schema) return ''
		const cur = this.#current.url || new URL(location.href)
		return build_search_string(
			cur,
			values,
			this.#search_keys,
			this.#search_defaults,
			this.#search_opts,
			isEqual,
		)
	}

	/* Read + validate search params from URL. */
	#sync_search_from_url(url) {
		if (!this.#search_schema) return this.#set_search_store({})
		const raw = read_search(url, this.#search_schema, this.#search_opts)
		const next = validate_search(
			raw,
			this.#search_schema,
			this.#search_defaults,
			this.#search_opts,
		)
		this.#set_search_store(next)
	}

	/* Commit search_params to the URL. */
	#commit_search(values) {
		if (!this.#search_schema) return
		const cur = this.#current.url || new URL(location.href)
		const next = build_search_url(
			cur,
			values,
			this.#search_keys,
			this.#search_defaults,
			this.#search_opts,
			isEqual,
		)
		if (!next) return
		if (this.#search_opts.push_history) this.push_state(next.href)
		else this.replace_state(next.href)
	}

	async #fetch_and_cache(req, cache, side, tags, signal) {
		const headers = new Headers(req.headers)
		if (side?.etag) headers.set('If-None-Match', side.etag)
		if (side?.last_modified) headers.set('If-Modified-Since', side.last_modified)
		const res = await fetch(new Request(req, { headers }), { signal })
		if (!cache) return res
		if (res.status === 304) {
			this.#write_meta(req.url, { ...side, ts: Date.now() })
			try {
				return (await cache.match(req)) || res
			} catch {
				return res
			}
		}
		if (res.ok) {
			try {
				await cache.put(req, res.clone())
			} catch {}
			this.#write_meta(req.url, {
				ts: Date.now(),
				etag: res.headers.get('ETag'),
				last_modified: res.headers.get('Last-Modified'),
				tags: tags || [],
			})
		}
		return res
	}

	async #parse_response(res, parse) {
		if (typeof parse === 'function') return parse(res)
		return res[parse || 'json']()
	}

	async #run_plan(plan, controller, nav_id) {
		let cache = null
		try {
			cache = await caches.open(this.#cache_name)
		} catch {}
		const out = {}
		const sources = {}
		const defaults = this.#opts.load_plan_defaults || {}
		await Promise.all(
			Object.entries(plan || {}).map(async ([as, raw]) => {
				const spec = typeof raw === 'string' ? { request: raw } : raw || {}
				const req = this.#to_get_request(spec.request, spec.init)
				const parse = spec.parse || defaults.parse || 'json'
				const cache_hints = { ...(defaults.cache || {}), ...(spec.cache || {}) }
				const strategy = cache_hints.strategy || 'swr'
				const ttl = cache_hints.ttl ?? 86400000
				const tags = cache_hints.tags || []
				const side = cache ? this.#read_meta(req.url) : null
				let entry
				try {
					entry = await cache?.match?.(req)
				} catch {}
				const fresh = !!(side && typeof side.ts === 'number' && Date.now() - side.ts <= ttl)
				let res
				let source = 'network'
				if (!cache || strategy === 'no-store') {
					res = await fetch(req, { signal: controller.signal })
				} else if (strategy === 'cache-first' && entry && fresh) {
					res = entry
					source = 'cache'
				} else if (strategy === 'swr' && entry) {
					if (fresh) {
						res = entry
						source = 'cache'
					} else if (nav_id === 0) {
						// Preload should not freeze a stale snapshot into #preloads.
						// Fetch now so goto() reuses fresh data.
						try {
							res = await this.#fetch_and_cache(
								req,
								cache,
								side,
								tags,
								controller.signal,
							)
							source = 'network'
						} catch {
							res = entry
							source = 'stale'
						}
					} else {
						res = entry
						source = 'stale'
						this.#fetch_and_cache(req, cache, side, tags, controller.signal)
							.then(r => this.#parse_response(r.clone ? r.clone() : r, parse))
							.then(v => this.#emit_revalidate(nav_id, as, v))
							.catch(() => {})
					}
				} else if (strategy === 'network-first') {
					try {
						res = await this.#fetch_and_cache(req, cache, side, tags, controller.signal)
					} catch (e) {
						if (entry) {
							res = entry
							source = fresh ? 'cache' : 'stale'
						} else throw e
					}
				} else {
					res = await this.#fetch_and_cache(req, cache, side, tags, controller.signal)
				}
				out[as] = await this.#parse_response(res.clone ? res.clone() : res, parse)
				sources[as] = source
			}),
		)
		return {
			...out,
			__meta: { source: sources, at: Date.now() },
		}
	}

	#emit_revalidate(id, as, value) {
		const r = this.#revalidation
		if (id !== this.#nav_active || !r || r.id !== id) return
		const data = r.nav?.to?.data
		// Revalidate results can arrive before `after_navigate` and before `r.nav` is wired.
		// Buffer them and flush once navigation commits.
		if (!data || typeof data !== 'object') {
			r.pending?.set(as, value)
			return
		}
		if (isEqual(data[as], value)) return
		try {
			data[as] = value
			if (data.__meta?.source) data.__meta.source[as] = 'revalidated'
			r.nav.status = this.#nav_status(r.nav.to)
			r.updated = true
			this.route.set(this.#current)
			for (const fn of r.cbs || [])
				try {
					fn()
				} catch {}
		} catch {}
	}

	async #run_loader_fn(loader, route, info, params, search_params, controller, nav_id) {
		if (!loader) return undefined
		const ret = loader(this.#make_loader_ctx(route, info, params, search_params, controller))
		if (isPromise(ret)) return ret
		if (ret && typeof ret === 'object' && !Array.isArray(ret))
			return this.#run_plan(ret, controller, nav_id)
		return ret
	}

	#run_before_route_leave(nav) {
		const matches = this.#current.matches || []
		for (let i = matches.length - 1; i >= 0; i--) {
			const m = matches[i]
			try {
				if (m.type === 'route') this.#get_hooks(m.route)?.before_route_leave?.(nav)
				else m.__entry?.before_route_leave?.(nav)
			} catch (e) {
				ℹ('[🧭 hooks]', 'before_route_leave threw', { err: e })
			}
			if (nav.cancelled) break
		}
	}

	#build_layouts(matches) {
		const out = Object.create(null)
		for (const m of matches || []) if (m.type === 'layout' && m.id) out[m.id] = m
		return out
	}

	#nav_status(target) {
		const err = target?.data?.__error
		return typeof err?.status === 'number'
			? err.status
			: err
				? 500
				: target?.route === null
					? 404
					: 200
	}

	#build_matches(route, stack) {
		const out = []
		for (const g of stack || []) {
			const obj = { type: 'layout', layout: g.layout }
			if (g.id) obj.id = g.id
			Object.defineProperty(obj, '__entry', { value: g })
			out.push(obj)
		}
		out.push({ type: 'route', route })
		return out
	}

	async #load_hit(hit, info, controller, nav_id) {
		const matches = hit.matches || this.#build_matches(hit.route, hit.stack)
		const search = this.#build_search_state(matches, hit.route, info, hit.params)

		const ps = matches.map(m => {
			const entry = m.type === 'route' ? this.#get_hooks(m.route) : m.__entry
			const route = m.type === 'route' ? m.route : hit.route
			return Promise.resolve(
				this.#run_loader_fn(
					entry?.loader,
					route,
					info,
					hit.params,
					search.search_params,
					controller,
					nav_id,
				),
			).catch(e => ({ __error: e }))
		})
		const datas = await Promise.all(ps)
		for (let i = 0; i < matches.length; i++) matches[i].data = datas[i]
		return {
			matches,
			layouts: this.#build_layouts(matches),
			data: datas[datas.length - 1],
			search,
		}
	}

	#take_bootstrap_bundle(hit, info) {
		if (!this.#bootstrap || this.#current.url != null) return null
		const branch = this.#bootstrap
		this.#bootstrap = null
		const matches = hit.matches || this.#build_matches(hit.route, hit.stack)
		if (!Array.isArray(branch) || branch.length !== matches.length) {
			ℹ('[🧭 bootstrap]', 'ignore mismatched branch', {
				expected: matches.length,
				received: Array.isArray(branch) ? branch.length : null,
			})
			return null
		}

		for (let i = 0; i < matches.length; i++) matches[i].data = branch[i]
		return {
			matches,
			layouts: this.#build_layouts(matches),
			data: branch[branch.length - 1],
			search: this.#build_search_state(matches, hit.route, info, hit.params),
		}
	}

	/**
	 * @returns {Navigation}
	 */
	#make_nav({ type, from = undefined, to = undefined, will_unload = false, event = undefined }) {
		const from_obj = from !== undefined ? from : this.#target(this.#current)
		const ssr = to?.route && this.#get_hooks(to.route)?.ssr
		return {
			type, // 'link' | 'goto' | 'popstate' | 'leave'
			from: from_obj,
			to,
			status: 200,
			ssr:
				ssr && typeof ssr === 'object'
					? {
							serve_shell: ssr.serve_shell === true,
							refresh_every: Number.isFinite(ssr.refresh_every)
								? Math.max(0, Math.floor(ssr.refresh_every))
								: 0,
						}
					: undefined,
			will_unload,
			cancelled: false,
			event,
			cancel() {
				this.cancelled = true
			},
		}
	}

	/**
	 * @param {string} [url_raw]
	 * @param {{ replace?: boolean }} [opts]
	 * @param {'goto'|'link'|'popstate'} [nav_type]
	 * @param {Event} [ev_param]
	 * @returns {Promise<void>}
	 */
	async goto(url_raw = location.href, opts = {}, nav_type = 'goto', ev_param = undefined) {
		const nav_id = ++this.#nav_seq
		this.#nav_active = nav_id

		const rollback_popstate = () => {
			if (nav_type !== 'popstate') return
			const new_idx = ev_param?.state?.__navgo?.idx
			if (new_idx != null) {
				const delta = new_idx - this.#route_idx
				if (delta) {
					ℹ('[🧭 goto]', 'cancel popstate; correcting history', { delta })
					history.go(-delta)
				}
			}
		}

		try {
			const info = this.#resolve_url_and_path(url_raw, opts)
			if (!info) return void ℹ('[🧭 goto]', 'invalid url', { url: url_raw })
			this.is_navigating.set(true)

			const { url, path, load_key } = info
			this.#revalidation = {
				id: nav_id,
				nav: null,
				cbs: new Set(),
				updated: false,
				pending: new Map(),
			}
			this.#loader_controller?.abort?.()
			const controller = new AbortController()
			this.#loader_controller = controller

			let nav = this.#make_nav({
				type: nav_type,
				to: this.#target(info),
				event: ev_param,
			})
			ℹ('[🧭 goto]', 'start', {
				type: nav_type,
				path,
				replace: !!opts.replace,
				popstate: nav_type === 'popstate',
			})

			// before_route_leave
			this.#run_before_route_leave(nav)
			if (nav.cancelled) {
				rollback_popstate()
				ℹ('[🧭 goto]', 'cancelled by before_route_leave')
				return
			}

			// match (so before_navigate can see route/params/matches)
			let hit = null
			let match_error = null
			try {
				hit = await this.match(path)
			} catch (e) {
				match_error = e
				ℹ('[🧭 match]', 'error', { err: e })
			}
			if (nav_id !== this.#nav_active) return
			nav.to = this.#target(
				hit
					? {
							...info,
							params: hit.params || {},
							route: hit.route || null,
							matches: hit.matches || [],
							layouts: hit.layouts || this.#build_layouts(hit.matches || []),
						}
					: info,
			)
			if (match_error) nav.to.data = { __error: match_error }
			nav.status = this.#nav_status(nav.to)

			// before_navigate (skip initial)
			if (nav.from) {
				try {
					this.#opts.before_navigate?.(nav)
				} catch (e) {
					ℹ('[🧭 hooks]', 'before_navigate threw', { err: e })
				}
				ℹ('[🧭 hooks]', 'before_navigate', {
					from: nav.from?.url?.href,
					to: nav.to?.url?.href,
				})
				if (nav.cancelled) {
					rollback_popstate()
					ℹ('[🧭 goto]', 'cancelled by before_navigate')
					return
				}
				if (nav_id !== this.#nav_active) return
			}

			// loader
			let bundle
			if (hit && !match_error) {
				const pre = this.#preloads.get(load_key)
				const bootstrap_bundle = pre ? null : this.#take_bootstrap_bundle(hit, info)
				bundle =
					pre?.data ??
					bootstrap_bundle ??
					(await (pre?.promise || this.#load_hit(hit, info, controller, nav_id)).catch(
						e => ({
							matches: [],
							data: { __error: e },
						}),
					))
				this.#preloads.delete(load_key)
				const has_error = !!bundle?.matches?.some(m => m?.data?.__error)
				ℹ(
					'[🧭 loader]',
					pre ? 'using preloaded data' : bootstrap_bundle ? 'bootstrapped' : 'loaded',
					{
						path,
						preloaded: !!pre,
						has_error,
					},
				)
			}
			if (nav_id !== this.#nav_active) return

			// change URL (skip if popstate as browser changes, or first goto())
			if (nav_type !== 'popstate' && !(nav_type === 'goto' && this.#current.url == null)) {
				const next_idx = this.#route_idx + (opts.replace ? 0 : 1)
				const prev_state =
					history.state && typeof history.state == 'object' ? history.state : {}
				const next_state = { ...prev_state, __navgo: { idx: next_idx, type: nav_type } }
				history[(opts.replace ? 'replace' : 'push') + 'State'](next_state, null, url.href)
				ℹ('[🧭 history]', opts.replace ? 'replaceState' : 'pushState', {
					idx: next_idx,
					href: url.href,
				})
				this.#route_idx = next_idx
				if (!opts.replace) {
					this.#areas_pos.delete(next_idx)
					this.#clear_onward_history()
				}
			}
			if (nav_id !== this.#nav_active) return

			const prev = this.#current
			const matches = hit && !match_error ? bundle?.matches || [] : []
			const layouts =
				hit && !match_error
					? bundle?.layouts || this.#build_layouts(matches)
					: Object.create(null)
			const data = match_error
				? { __error: match_error }
				: hit
					? bundle?.data
					: { __error: { status: 404 } }
			this.#current = {
				...this.#target({
					...info,
					route: match_error ? null : hit?.route || null,
					params: match_error ? {} : hit?.params || {},
					matches,
					layouts,
				}),
				search_params: {},
			}

			this.#set_search_state(hit && !match_error ? bundle?.search : null)

			// Build a completion nav using the previous route as `from`
			nav = this.#make_nav({
				type: nav_type,
				from: this.#target(prev),
				to: this.#target(this.#current, { data }),
				event: ev_param,
			})
			nav.status = this.#nav_status(nav.to)
			this.nav = nav

			// Wire up revalidation tracking early (revalidate fetches can resolve before after_navigate runs).
			const reval = this.#revalidation
			if (reval && reval.id === nav_id) {
				reval.nav = nav
				const nav_data = nav.to?.data
				if (nav_data && typeof nav_data === 'object' && reval.pending?.size) {
					for (const [as, value] of reval.pending) {
						if (!isEqual(nav_data[as], value)) {
							nav_data[as] = value
							if (nav_data.__meta?.source) nav_data.__meta.source[as] = 'revalidated'
							reval.updated = true
						}
					}
					reval.pending.clear()
					nav.status = this.#nav_status(nav.to)
				}
			}

			this.route.set(this.#current)
			const commit_promise = svelte.settled?.()
			// await so that apply_scroll is after potential async work
			try {
				await this.#opts.after_navigate?.(nav, cb => {
					if (nav_id !== this.#nav_active) return
					const r = this.#revalidation
					if (!r || r.id !== nav_id) return
					r.cbs.add(cb)
					if (r.updated)
						(typeof queueMicrotask === 'function' ? queueMicrotask : setTimeout)(cb, 0)
				})
			} catch (e) {
				ℹ('[🧭 hooks]', 'after_navigate threw', { err: e })
			}

			if (nav_id !== this.#nav_active) return
			ℹ('[🧭 navigate]', match_error ? 'done (error)' : hit ? 'done' : 'done (404)', {
				from: nav.from?.url?.href,
				to: nav.to?.url?.href,
				type: nav.type,
				idx: this.#route_idx,
			})

			// allow frameworks to flush DOM before scrolling
			try {
				await commit_promise
				await this.#opts.tick?.()
				await this.#opts.tick?.()
			} catch (e) {
				ℹ('[🧭 hooks]', 'tick threw', { err: e })
			}

			this.#update_active_links()
			this.#apply_scroll(nav)
		} catch (e) {
			// Prevent event handlers (click/popstate) from causing unhandled rejections.
			ℹ('[🧭 goto]', 'error', { err: e })
		} finally {
			if (nav_id === this.#nav_active) this.is_navigating.set(false)
		}
	}

	/**
	 * Shallow push — updates the URL/state but DOES NOT call handlers or loader.
	 */
	#commit_shallow(url, state, replace) {
		const u = new URL(url || location.href, location.href)
		const prev_idx = this.#route_idx
		// Pushing from a non-tip position clears forward history.
		if (!replace) this.#clear_onward_history()
		// persist current entry's scroll into its state so Back after refresh restores it
		const prev = history.state && typeof history.state == 'object' ? history.state : {}
		history.replaceState(
			{ ...prev, __navgo: { ...prev.__navgo, pos: { x: scrollX || 0, y: scrollY || 0 } } },
			'',
			location.href,
		)
		// also stash per-entry scroll in session storage as a fallback across reloads
		try {
			sessionStorage.setItem(
				`__navgo_scroll:${prev_idx}`,
				JSON.stringify({ x: scrollX || 0, y: scrollY || 0 }),
			)
		} catch {}
		const idx = prev_idx + (replace ? 0 : 1)
		const from = normalize_path(this.#current.url?.pathname || location.pathname)
		const st = { ...state, __navgo: { shallow: true, idx, from } }
		history[(replace ? 'replace' : 'push') + 'State'](st, '', u.href)
		ℹ('[🧭 history]', replace ? 'replace_state(shallow)' : 'push_state(shallow)', {
			idx,
			href: u.href,
		})
		// Popstate handler checks state.__navgo.shallow and skips router processing
		this.#route_idx = idx
		// Snapshot scroll areas for the new entry (so Forward restores even without new scroll events).
		const m = replace
			? this.#areas_pos.get(idx) || new Map()
			: new Map(this.#areas_pos.get(prev_idx) || [])
		m.set('window', { x: scrollX || 0, y: scrollY || 0 })
		this.#areas_pos.set(idx, m)
		// update current URL snapshot and notify
		const next_current = this.#update_current_info(
			this.#resolve_url_and_path(u.href, { literal: true }),
			u,
		)
		this.#sync_search_from_url(next_current.url)
		this.route.set(next_current)
		this.#update_active_links()
	}

	/** @param {string|URL} [url] @param {any} [state] */
	push_state(url, state) {
		this.#commit_shallow(url, state, false)
	}
	/** @param {string|URL} [url] @param {any} [state] */
	replace_state(url, state) {
		this.#commit_shallow(url, state, true)
	}

	/**
	 * Invalidate cache entries by canonical keys (URLs) or tags.
	 * @param {string|string[]} keys_or_tags
	 */
	async invalidate(keys_or_tags) {
		const arr = Array.isArray(keys_or_tags) ? keys_or_tags : [keys_or_tags]
		let cache
		try {
			cache = await caches.open(this.#cache_name)
		} catch {
			return
		}
		const prefix = this.#meta_key
		const to_delete = []
		for (const x of arr) {
			const str = String(x)
			const is_key = str.includes('://') || str.startsWith('/')
			if (is_key) {
				to_delete.push(str)
				continue
			}
			// treat as tag
			for (let i = 0; i < sessionStorage.length; i++) {
				const k = sessionStorage.key(i)
				if (!k || !k.startsWith(prefix)) continue
				try {
					const meta = JSON.parse(sessionStorage.getItem(k) || 'null')
					if (meta?.tags?.includes?.(str)) to_delete.push(k.slice(prefix.length))
				} catch {}
			}
		}
		for (const url of new Set(to_delete)) {
			try {
				await cache.delete(new Request(url, { method: 'GET' }))
			} catch {}
			try {
				sessionStorage.removeItem(prefix + url)
			} catch {}
		}
	}

	/**
	 * Preload loader data for a URL (e.g. to prime cache).
	 * Dedupes concurrent preloads for the same path.
	 */
	/** @param {string} url_raw @returns {Promise<unknown|void>} */
	async preload(url_raw, opts = {}) {
		try {
			const info = this.#resolve_url_and_path(url_raw, opts)
			const { path, load_key } = info || {}
			if (!path) return void ℹ('[🧭 preload]', 'invalid url', { url: url_raw })
			if (this.#current.url && this.#public_key(this.#current.url) === load_key)
				return void ℹ('[🧭 preload]', 'skip current path', { path })
			const hit = await this.match(path).catch(() => null)
			if (!hit) return void ℹ('[🧭 preload]', 'no route', { path })

			if (this.#preloads.has(load_key)) {
				const p = this.#preloads.get(load_key)
				ℹ('[🧭 preload]', 'dedupe', { path })
				return p.promise ? p.promise.then(b => b?.data) : p.data?.data
			}

			const entry = {}
			const controller = new AbortController()
			entry.promise = this.#load_hit(hit, info, controller, 0).then(
				bundle => {
					entry.data = bundle
					delete entry.promise
					ℹ('[🧭 preload]', 'done', { path })
					return bundle
				},
				err => {
					const bundle = { matches: [], data: { __error: err } }
					entry.data = bundle
					delete entry.promise
					ℹ('[🧭 preload]', 'error', { path, err })
					return bundle
				},
			)
			this.#preloads.set(load_key, entry)
			return entry.promise.then(b => b?.data)
		} catch (e) {
			ℹ('[🧭 preload]', 'error', { url: url_raw, err: e })
		}
	}

	//
	// Core matching
	//
	/** @param {string} url_raw @returns {Promise<MatchResult|null>} */
	async match(url_raw) {
		ℹ('[🧭 match]', 'start', { url: url_raw })
		let arr, obj
		for (let i = 0; i < this.#routes.length; i++) {
			obj = this.#routes[i]
			// Guard against user-provided /g or /y patterns (lastIndex is sticky).
			if (obj.pattern.global || obj.pattern.sticky) obj.pattern.lastIndex = 0
			if (!(arr = obj.pattern.exec(url_raw))) continue
			const params = {}
			if (obj.keys?.length) {
				for (let j = 0; j < obj.keys.length; ) {
					params[obj.keys[j]] = arr[++j] || null
				}
			} else if (arr.groups) {
				for (const k in arr.groups) params[k] = arr.groups[k]
			}

			// per-route param rules and optional async validate()
			const hooks = this.#get_hooks(obj.data)
			const rules = hooks.param_rules
			if (rules) {
				let ok = true
				for (const k in rules) {
					const schema = rules[k]?.schema
					if (!schema) continue
					const res = v.safeParse(schema, params[k])
					if (!res.success) {
						ok = false
						break
					}
					params[k] = res.output
				}
				if (!ok) {
					ℹ('[🧭 match]', 'skip: param_rules', { pattern: obj.data?.[0] })
					continue
				}
				for (const k in rules) {
					const param_coercer = rules[k]?.coercer
					if (typeof param_coercer === 'function') {
						try {
							params[k] = param_coercer(params[k])
						} catch {
							ok = false
							break
						}
					}
				}
				if (!ok) continue
			}
			if (hooks.validate) {
				try {
					if (!(await hooks.validate(params))) {
						ℹ('[🧭 match]', 'skip: validate', { pattern: obj.data?.[0] })
						continue
					}
				} catch {
					continue
				}
			}

			ℹ('[🧭 match]', 'hit', { pattern: obj.data?.[0], params })
			const matches = this.#build_matches(obj.data, obj.stack)
			return {
				route: obj.data || null,
				params,
				matches,
				layouts: this.#build_layouts(matches),
			}
		}
		ℹ('[🧭 match]', 'miss', { url: url_raw })
		return null
	}

	/** @param {RouteEntry[]} [routes] @param {Options} [opts] */
	constructor(routes = [], opts) {
		const base_opts = this.#opts
		this.#opts = { ...base_opts, ...opts }
		this.#opts.search = merge_search_opts(base_opts.search || {}, opts?.search || {})
		this.#base = normalize_path(this.#opts.base || '/')
		this.#base_rgx =
			this.#base == '/' ? /^\/+/ : new RegExp('^\\' + this.#base + '(?=\\/|$)\\/?', 'i')

		const initial = this.#resolve_public_url(location.href)
		if (initial) this.route.set({ ...this.#target(initial), search_params: {} })

		const group_ids = new Map()
		function compile_routes(entries, stack = []) {
			const out = []
			for (const e of entries || []) {
				if (Array.isArray(e) && (typeof e[0] === 'string' || e[0] instanceof RegExp)) {
					const pat_or_rx = e[0]
					const pat =
						pat_or_rx instanceof RegExp
							? { pattern: pat_or_rx, keys: null }
							: parse(pat_or_rx)
					pat.data = e
					pat.stack = stack
					out.push(pat)
					continue
				}
				if (e && typeof e === 'object' && Array.isArray(e.routes)) {
					if (e.id != null) {
						if (typeof e.id !== 'string' || !e.id) {
							throw new Error('Route group id must be a non-empty string')
						}
						if (group_ids.has(e.id))
							throw new Error(`Duplicate route group id "${e.id}"`)
						group_ids.set(e.id, e)
					}
					out.push(...compile_routes(e.routes, stack.concat(e)))
					continue
				}
			}
			return out
		}
		this.#routes = compile_routes(routes)
		this.#bootstrap = Array.isArray(this.#opts.bootstrap) ? this.#opts.bootstrap.slice() : null

		// keep URL in sync when search_params store changes
		this.#search_unsub = this.search_params.subscribe(next => {
			if (this.#search_syncing) return
			if (!this.#search_schema) return
			const validated = validate_search(
				next || {},
				this.#search_schema,
				this.#search_defaults,
				this.#search_opts,
			)
			if (!isEqual(validated, next)) this.#set_search_store(validated)
			if (this.#search_writer) this.#search_writer(validated)
			else this.#commit_search(validated)
		})

		ℹ('[🧭 init]', {
			base: this.#base,
			routes: this.#routes.length,
			preload_on_hover: this.#opts.preload_on_hover,
			preload_delay: this.#opts.preload_delay,
			bootstrapped: Array.isArray(this.#bootstrap) && this.#bootstrap.length > 0,
		})
	}

	//
	// Lifecycle hooks
	//
	async init() {
		ℹ('[🧭 init]', 'attach listeners')
		// ensure current history state carries our index
		const cur_idx = history.state?.__navgo?.idx
		if (cur_idx == null) {
			const prev = history.state && typeof history.state == 'object' ? history.state : {}
			const next_state = { ...prev, __navgo: { ...prev.__navgo, idx: this.#route_idx } }
			history.replaceState(next_state, '', location.href)
			ℹ('[🧭 history]', 'init idx', { idx: this.#route_idx })
		} else {
			this.#route_idx = cur_idx
			ℹ('[🧭 history]', 'restore idx', { idx: this.#route_idx })
		}
		try {
			const pos = JSON.parse(
				sessionStorage.getItem(`__navgo_scroll:${this.#route_idx}`) || 'null',
			)
			if (pos) {
				history.scrollRestoration = 'manual'
				scrollTo(pos.x, pos.y)
				ℹ('[🧭 scroll]', 'restore session', { idx: this.#route_idx, ...pos })
			}
		} catch {}

		addEventListener('popstate', this.#on_popstate)
		addEventListener('click', this.#click)
		addEventListener('beforeunload', this.#before_unload)
		addEventListener('hashchange', this.#on_hashchange)
		this.#scroll_handler = throttle(this.#on_scroll, 100)
		addEventListener('scroll', this.#scroll_handler, { capture: true })

		if (this.#opts.preload_on_hover) {
			// @ts-expect-error
			if (!navigator.connection?.saveData) addEventListener('mousemove', this.#mouse_move)
			addEventListener('touchstart', this.#tap, { passive: true })
			addEventListener('mousedown', this.#tap)
			ℹ('[🧭 init]', 'hover preloading enabled', {
				delay: this.#opts.preload_delay,
			})
		}

		ℹ('[🧭 init]', 'initial goto')
		if (this.#opts.attach_to_window) window.navgo = this
		await this.goto()
		this.#bootstrap = null
		history.scrollRestoration = 'manual'
	}
	destroy() {
		removeEventListener('popstate', this.#on_popstate)
		removeEventListener('click', this.#click)
		removeEventListener('mousemove', this.#mouse_move)
		removeEventListener('touchstart', this.#tap)
		removeEventListener('mousedown', this.#tap)
		removeEventListener('beforeunload', this.#before_unload)
		removeEventListener('hashchange', this.#on_hashchange)
		removeEventListener('scroll', this.#scroll_handler, { capture: true })
		this.#areas_pos.clear()
		this.#search_unsub?.()
		delete window.navgo
	}

	#clear_onward_history() {
		for (const k of this.#areas_pos.keys()) if (k > this.#route_idx) this.#areas_pos.delete(k)
		ℹ('[🧭 scroll]', 'clear onward', { upto: this.#route_idx })
	}

	#apply_scroll(ctx) {
		const hash = location.hash
		const t = ctx?.type || ctx?.event?.type
		requestAnimationFrame(() => {
			// 0) Initial (first) navigation: preserve whatever the browser
			// already did for the SSR document.
			const is_initial = ctx && 'from' in ctx ? ctx.from == null : !t
			if (is_initial) {
				if (hash && scroll_to_hash(hash)) {
					ℹ('[🧭 scroll]', 'initial hash')
					return
				}
				ℹ('[🧭 scroll]', 'initial preserve')
				return
			}
			// 1) On back/forward, restore saved position if available
			if (t === 'popstate') {
				const ev_state = ctx?.state ?? ctx?.event?.state
				const st = ev_state?.__navgo
				const idx = st?.idx
				const target_idx = typeof idx === 'number' ? idx : this.#route_idx - 1
				this.#route_idx = target_idx
				const m = this.#areas_pos.get(target_idx)
				let pos = st?.pos || m?.get?.('window')
				if (!pos) {
					try {
						pos = JSON.parse(
							sessionStorage.getItem(`__navgo_scroll:${target_idx}`) || 'null',
						)
					} catch {}
				}
				if (pos) {
					scrollTo(pos.x, pos.y)
					// re-apply on next tick to resist late reflows (e.g. images)
					setTimeout(() => scrollTo(pos.x, pos.y), 0)
					ℹ('[🧭 scroll]', 'restore popstate', { idx: target_idx, ...pos })
				}
				for (const [id, p] of m || []) {
					if (id === 'window') continue
					const sel = `[data-scroll-id="${CSS.escape(id)}"],` + `#${CSS.escape(id)}`
					const el = document.querySelector(sel)
					if (el) {
						el.scrollTo?.(p.x, p.y)
						el.scrollLeft = p.x
						el.scrollTop = p.y
					}
				}
				if (pos) return
			}
			// 2) If there is a hash, prefer anchor scroll
			if (hash && scroll_to_hash(hash)) {
				ℹ('[🧭 scroll]', 'hash')
				return
			}
			// 3) Default: scroll to top for new navigations
			if (this.#opts.scroll_to_top) {
				scrollTo(0, 0)
				ℹ('[🧭 scroll]', 'top')
			}
		})
	}
}

/** @typedef {import('./index.d.ts').Options} Options */
/** @typedef {import('./index.d.ts').RouteEntry} RouteEntry */
/** @typedef {import('./index.d.ts').RouteGroup} RouteGroup */
/** @typedef {import('./index.d.ts').Match} Match */
/** @typedef {import('./index.d.ts').PreloadBundle} PreloadBundle */
/** @typedef {import('./index.d.ts').RouteTuple} RouteTuple */
/** @typedef {import('./index.d.ts').MatchResult} MatchResult */
/** @typedef {import('./index.d.ts').Navigation} Navigation */
