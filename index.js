import { throttle } from 'es-toolkit'
import { parse } from 'regexparam'
import { tick } from 'svelte'
import { writable } from 'svelte/store'

const ℹ = (...args) => console.debug(...args)

/** @param {any} x @returns {x is RouteTuple} */
function is_route_tuple(x) {
	return Array.isArray(x) && (typeof x[0] === 'string' || x[0] instanceof RegExp)
}

/** @param {any} x @returns {x is RouteGroup} */
function is_route_group(x) {
	return !!x && typeof x === 'object' && Array.isArray(x.routes)
}

/**
 * Flatten nested route groups into a list of matchable routes.
 *
 * @param {RouteEntry[]} entries
 * @param {RouteGroup[]} stack
 * @returns {Array<{ pattern: RegExp, keys: string[]|null, data: RouteTuple, stack: RouteGroup[] }>}
 */
function compile_routes(entries, stack = []) {
	/** @type {Array<{ pattern: RegExp, keys: string[]|null, data: RouteTuple, stack: RouteGroup[] }>} */
	const out = []
	for (const e of entries || []) {
		if (is_route_tuple(e)) {
			const pat_or_rx = e[0]
			const pat =
				pat_or_rx instanceof RegExp ? { pattern: pat_or_rx, keys: null } : parse(pat_or_rx)
			pat.data = e // keep original tuple: [pattern, hooks, ...]
			pat.stack = stack
			out.push(pat)
			continue
		}
		if (is_route_group(e)) {
			out.push(...compile_routes(e.routes, stack.concat(e)))
			continue
		}
	}
	return out
}

/**
 * Create a match descriptor.
 * Uses a non-enumerable `__entry` field for internal references.
 */
function make_match(obj, entry) {
	if (entry) Object.defineProperty(obj, '__entry', { value: entry })
	return obj
}

export default class Navgo {
	/** @type {Options} */
	#opts = {
		base: '/',
		preload_delay: 20,
		preload_on_hover: true,
		before_navigate: undefined,
		after_navigate: undefined,
		tick,
		scroll_to_top: true,
		aria_current: false,
		attach_to_window: true,
	}
	/** @type {Array<{ pattern: RegExp, keys: string[]|null, data: RouteTuple, stack: RouteGroup[] }>} */
	#routes = []
	/** @type {string} */
	#base = '/'
	/** @type {RegExp} */
	#base_rgx = /^\/+/
	/** @type {Map<string, { promise?: Promise<PreloadBundle>, data?: PreloadBundle }>} */
	#preloads = new Map()
	/** @type {{ url: URL|null, route: RouteTuple|null, params: Params, matches: Match[] }} */
	#current = { url: null, route: null, params: {}, matches: [] }
	/** @type {number} */
	#route_idx = 0
	/** @type {boolean} */
	#hash_navigating = false
	/** @type {Map<number, Map<string, { x: number, y: number }>>} */
	#areas_pos = new Map()
	// Latest-wins nav guard: monotonic id and currently active id
	/** @type {number} */
	#nav_seq = 0
	/** @type {number} */
	#nav_active = 0
	/** @type {(e: Event) => void | null} */
	#scroll_handler = null
	route = writable({ url: new URL(location.href), route: null, params: {}, matches: [] })
	is_navigating = writable(false)

	//
	// Event listeners
	//
	#click = async e => {
		ℹ('[🧭 event:click]', { type: e?.type, target: e?.target })
		const info = this.#link_from_event(e, true)
		if (!info) return

		const url = new URL(info.href, location.href)

		// Hash-only navigation on same path: let browser handle, but track index
		if (url.hash && url.pathname === this.#current.url.pathname) {
			const cur_hash = location.href.split('#')[1]
			const next_hash = url.href.split('#')[1] ?? ''
			if (cur_hash === next_hash) {
				// same hash: just scroll without history churn
				e.preventDefault()
				if (next_hash === '' || (next_hash === 'top' && !document.getElementById('top'))) {
					scrollTo({ top: 0 })
				} else {
					this.#scroll_to_hash('#' + next_hash)
				}
				ℹ('[🧭 hash]', 'same-hash scroll')
				return
			}

			// different hash on same path — let browser update URL + scroll
			this.#hash_navigating = true
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
		this.goto(info.href, { replace: false }, 'link', e)
	}

	#on_popstate = ev => {
		// ignore popstate while a hash-originating nav is in flight
		if (this.#hash_navigating) return

		const st = ev?.state?.__navgo
		ℹ('[🧭 event:popstate]', st)
		// Hash-only or state-only change: pathname+search unchanged -> skip loader
		const cur = this.#current.url
		const target = new URL(location.href)
		if (cur && target.pathname === cur.pathname) {
			this.#current.url = target
			ℹ('  - [🧭 event:popstate]', 'same path+search; skip loader')
			this.#apply_scroll(ev)
			this.route.set(this.#current)
			this.#update_active_links()
			return
		}
		// Explicit shallow entries (pushState/replaceState) regardless of path
		if (st?.shallow) {
			this.#current.url = target
			ℹ('  - [🧭 event:popstate]', 'shallow entry; skip loader')
			this.#apply_scroll(ev)
			this.route.set(this.#current)
			this.#update_active_links()
			return
		}

		ℹ('  - [🧭 event:popstate]', { idx: st?.idx })
		this.goto(location.href, { replace: true }, 'popstate', ev)
	}
	#on_hashchange = () => {
		// if hashchange originated from a click we tracked, bump our index and persist it
		if (this.#hash_navigating) {
			this.#hash_navigating = false
			const prev = history.state && typeof history.state == 'object' ? history.state : {}
			const next_idx = this.#route_idx + 1
			const next_state = { ...prev, __navgo: { ...prev.__navgo, idx: next_idx } }
			history.replaceState(next_state, '', location.href)
			this.#route_idx = next_idx
			ℹ('[🧭 event:hashchange]', { idx: next_idx, href: location.href })
		} else {
			// hashchange via Back/Forward — restore previous position when hash is removed
			const idx = history.state?.__navgo?.idx
			if (typeof idx === 'number') this.#route_idx = idx
			if (!location.hash) {
				const pos = this.#areas_pos.get(this.#route_idx)?.get?.('window')
				if (pos) {
					scrollTo(pos.x, pos.y)
					ℹ('[🧭 scroll]', 'restore hash-back', { idx: this.#route_idx, ...pos })
				} else if (this.#opts.scroll_to_top) {
					// no saved position for previous entry — default to top
					scrollTo(0, 0)
					ℹ('[🧭 scroll]', 'hash-back -> top')
				}
			}
		}
		// update current URL snapshot and notify
		this.#current.url = new URL(location.href)
		this.route.set(this.#current)
		this.#update_active_links()
	}

	/** @type {any} */
	#hover_timer = null
	#maybe_preload = ev => {
		const info = this.#link_from_event(ev, ev.type === 'mousedown')
		if (info) {
			ℹ('[🧭 preload]', 'link hover/tap', { href: info.href })
			this.preload(info.href)
		}
	}
	#mouse_move = ev => {
		clearTimeout(this.#hover_timer)
		this.#hover_timer = setTimeout(() => this.#maybe_preload(ev), this.#opts.preload_delay)
	}
	#tap = ev => this.#maybe_preload(ev)

	#on_scroll = e => {
		// prevent hash from overwriting the previous entry’s saved position.
		if (this.#hash_navigating) return

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
			sessionStorage.setItem(
				`__navgo_scroll:${location.href}`,
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
		}
	}

	//
	// Helpers
	//
	#normalize(url) {
		return '/' + (url || '').replace(/^\/|\/$/g, '')
	}
	/** @param {string} url @returns {string|false} */
	format(url) {
		if (!url) return url
		url = this.#normalize(url)
		const out = this.#base_rgx.test(url) && url.replace(this.#base_rgx, '/')
		ℹ('[🧭 format]', { in: url, out })
		return out
	}
	#resolve_url_and_path(url_raw) {
		if (url_raw[0] == '/' && !this.#base_rgx.test(url_raw)) url_raw = this.#base + url_raw
		const url = new URL(url_raw, location.href)
		const path = this.format(url.pathname).match?.(/[^?#]*/)?.[0]
		ℹ('[🧭 resolve]', { url_in: url_raw, url: url.href, path })
		return path ? { url, path } : null
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
			this.#base_rgx.test(a.pathname)
			? { a, href }
			: null
	}

	#update_active_links() {
		if (!this.#opts.aria_current) return
		const cur = this.format(this.#current.url?.pathname)
		if (!cur) return
		for (const a of document.querySelectorAll('a[href]')) {
			const href = a.getAttribute('href')
			if (href[0] === '#') continue
			const link_path = href && this.#resolve_url_and_path(href)?.path
			if (link_path === cur) a.setAttribute('aria-current', 'page')
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
			const norm = r => (typeof r === 'function' ? { validator: r } : r || {})
			for (const k in ar || {}) out[k] = norm(ar[k])
			for (const k in br || {}) out[k] = { ...out[k], ...norm(br[k]) }
			hooks.param_rules = out
		}
		return hooks
	}

	async #run_loader(route, url, params) {
		const ret_val = this.#get_hooks(route)?.loader?.({ route_entry: route, url, params })
		return Array.isArray(ret_val) ? Promise.all(ret_val) : ret_val
	}

	async #run_group_loader(group, route, url, params) {
		const ret_val = group?.loader?.({ route_entry: route, url, params })
		return Array.isArray(ret_val) ? Promise.all(ret_val) : ret_val
	}

	#run_before_route_leave(nav) {
		const matches = this.#current.matches || []
		for (let i = matches.length - 1; i >= 0; i--) {
			const m = matches[i]
			if (m.type === 'route') this.#get_hooks(m.route)?.before_route_leave?.(nav)
			else m.__entry?.before_route_leave?.(nav)
			if (nav.cancelled) break
		}
	}

	#build_matches(route, stack) {
		const out = []
		for (const g of stack || []) out.push(make_match({ type: 'layout', layout: g.layout }, g))
		out.push(make_match({ type: 'route', route }, null))
		return out
	}

	async #load_hit(hit, url) {
		const matches = hit.matches || this.#build_matches(hit.route, hit.stack)
		const ps = matches.map(m => {
			const p =
				m.type === 'route'
					? this.#run_loader(m.route, url, hit.params)
					: this.#run_group_loader(m.__entry, hit.route, url, hit.params)
			return Promise.resolve(p).catch(e => ({ __error: e }))
		})
		const datas = await Promise.all(ps)
		for (let i = 0; i < matches.length; i++) matches[i].data = datas[i]
		return { matches, data: datas[datas.length - 1] }
	}

	/**
	 * @returns {Navigation}
	 */
	#make_nav({ type, from = undefined, to = undefined, will_unload = false, event = undefined }) {
		const from_obj =
			from !== undefined
				? from
				: this.#current.url
					? {
							url: this.#current.url,
							params: this.#current.params || {},
							route: this.#current.route,
							matches: this.#current.matches || [],
						}
					: null
		return {
			type, // 'link' | 'goto' | 'popstate' | 'leave'
			from: from_obj,
			to,
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
		const info = this.#resolve_url_and_path(url_raw)
		if (!info) {
			ℹ('[🧭 goto]', 'invalid url', { url: url_raw })
			return
		}
		this.is_navigating.set(true)
		const { url, path } = info

		const is_popstate = nav_type === 'popstate'
		let nav = this.#make_nav({ type: nav_type, to: null, event: ev_param })
		ℹ('[🧭 goto]', 'start', {
			type: nav_type,
			path,
			replace: !!opts.replace,
			popstate: is_popstate,
		})

		//
		// before_route_leave
		//
		this.#run_before_route_leave(nav)
		if (nav.cancelled) {
			// use history.go to cancel the nav, and jump back to where we are
			if (is_popstate) {
				const new_idx = ev_param?.state?.__navgo?.idx
				if (new_idx != null) {
					const delta = new_idx - this.#route_idx
					if (delta) {
						ℹ('[🧭 goto]', 'cancel popstate; correcting history', {
							delta,
						})
						history.go(-delta)
					}
				}
			}
			if (nav_id === this.#nav_active) this.is_navigating.set(false)
			ℹ('[🧭 goto]', 'cancelled by before_route_leave')
			return
		}

		//
		// #
		//
		this.#opts.before_navigate?.(nav)
		ℹ('[🧭 hooks]', 'before_navigate', {
			from: nav.from?.url?.href,
			to: url.href,
		})
		const hit = await this.match(path)
		if (nav_id !== this.#nav_active) return

		//
		// loader
		//
		let bundle
		if (hit) {
			const pre = this.#preloads.get(path)
			bundle =
				pre?.data ??
				(await (pre?.promise || this.#load_hit(hit, url)).catch(e => ({
					matches: [],
					data: { __error: e },
				})))
			this.#preloads.delete(path)
			const has_error = !!bundle?.matches?.some(m => m?.data?.__error)
			ℹ('[🧭 loader]', pre ? 'using preloaded data' : 'loaded', {
				path,
				preloaded: !!pre,
				has_error,
			})
		}
		if (nav_id !== this.#nav_active) return

		//
		// change URL (skip if popstate as browser changes, or first goto())
		//
		if (!is_popstate && !(nav_type === 'goto' && this.#current.url == null)) {
			const next_idx = this.#route_idx + (opts.replace ? 0 : 1)
			const prev_state =
				history.state && typeof history.state == 'object' ? history.state : {}
			const next_state = {
				...prev_state,
				__navgo: { ...prev_state.__navgo, idx: next_idx, type: nav_type },
			}
			history[(opts.replace ? 'replace' : 'push') + 'State'](next_state, null, url.href)
			ℹ('[🧭 history]', opts.replace ? 'replaceState' : 'pushState', {
				idx: next_idx,
				href: url.href,
			})
			this.#route_idx = next_idx
			if (!opts.replace) this.#clear_onward_history()
		}
		if (nav_id !== this.#nav_active) return

		const prev = this.#current
		const matches = hit ? bundle?.matches || [] : []
		const data = hit ? bundle?.data : { __error: { status: 404 } }
		this.#current = { url, route: hit?.route || null, params: hit?.params || {}, matches }

		// Build a completion nav using the previous route as `from`
		nav = this.#make_nav({
			type: nav_type,
			from: prev?.url
				? {
						url: prev.url,
						params: prev.params || {},
						route: prev.route,
						matches: prev.matches || [],
					}
				: null,
			to: {
				url: new URL(location.href),
				params: hit?.params || {},
				route: hit?.route || null,
				matches,
				data,
			},
			event: ev_param,
		})
		this.route.set(this.#current)

		// await so that apply_scroll is after potential async work
		await this.#opts.after_navigate?.(nav)

		if (nav_id !== this.#nav_active) return
		ℹ('[🧭 navigate]', hit ? 'done' : 'done (404)', {
			from: nav.from?.url?.href,
			to: nav.to?.url?.href,
			type: nav.type,
			idx: this.#route_idx,
		})

		// allow frameworks to flush DOM before scrolling
		await this.#opts.tick?.()

		this.#update_active_links()
		this.#apply_scroll(nav)
		this.is_navigating.set(false)
	}

	/**
	 * Shallow push — updates the URL/state but DOES NOT call handlers or loader.
	 */
	#commit_shallow(url, state, replace) {
		const u = new URL(url || location.href, location.href)
		// persist current entry's scroll into its state so Back after refresh restores it
		const prev = history.state && typeof history.state == 'object' ? history.state : {}
		history.replaceState(
			{ ...prev, __navgo: { ...prev.__navgo, pos: { x: scrollX || 0, y: scrollY || 0 } } },
			'',
			location.href,
		)
		// also stash per-URL scroll in session storage as a fallback across reloads
		try {
			sessionStorage.setItem(
				`__navgo_scroll:${location.href}`,
				JSON.stringify({ x: scrollX || 0, y: scrollY || 0 }),
			)
		} catch {}
		const idx = this.#route_idx + (replace ? 0 : 1)
		const st = { ...state, __navgo: { ...state?.__navgo, shallow: true, idx } }
		history[(replace ? 'replace' : 'push') + 'State'](st, '', u.href)
		ℹ('[🧭 history]', replace ? 'replace_state(shallow)' : 'push_state(shallow)', {
			idx,
			href: u.href,
		})
		// Popstate handler checks state.__navgo.shallow and skips router processing
		this.#route_idx = idx
		// carry forward current window position for the shallow entry so Forward restores correctly
		const m = this.#areas_pos.get(idx) || new Map()
		m.set('window', { x: scrollX || 0, y: scrollY || 0 })
		this.#areas_pos.set(idx, m)
		if (!replace) this.#clear_onward_history()
		// update current URL snapshot and notify
		this.#current.url = u
		this.route.set(this.#current)
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
	 * Preload loader data for a URL (e.g. to prime cache).
	 * Dedupes concurrent preloads for the same path.
	 */
	/** @param {string} url_raw @returns {Promise<unknown|void>} */
	async preload(url_raw) {
		const { path, url } = this.#resolve_url_and_path(url_raw) || {}
		if (!path) {
			ℹ('[🧭 preload]', 'invalid url', { url: url_raw })
			return Promise.resolve()
		}
		// Do not preload if we're already at this path
		if (this.format(this.#current.url?.pathname) === path) {
			ℹ('[🧭 preload]', 'skip current path', { path })
			return Promise.resolve()
		}
		const hit = await this.match(path)
		if (!hit) {
			ℹ('[🧭 preload]', 'no route', { path })
			return Promise.resolve()
		}

		if (this.#preloads.has(path)) {
			const p = this.#preloads.get(path)
			ℹ('[🧭 preload]', 'dedupe', { path })
			return p.promise ? p.promise.then(b => b?.data) : Promise.resolve(p.data?.data)
		}

		const entry = {}
		entry.promise = this.#load_hit(hit, url).then(bundle => {
			entry.data = bundle
			delete entry.promise
			ℹ('[🧭 preload]', 'done', { path })
			return bundle
		})
		this.#preloads.set(path, entry)
		return entry.promise.then(b => b?.data)
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
			if (!(arr = obj.pattern.exec(url_raw))) continue
			const params = {}
			if (obj.keys?.length) {
				for (let j = 0; j < obj.keys.length; ) {
					params[obj.keys[j]] = arr[++j] || null
				}
			} else if (arr.groups) {
				for (const k in arr.groups) params[k] = arr.groups[k]
			}

			// per-route validators and optional async validate()
			const hooks = this.#get_hooks(obj.data)
			if (hooks.param_rules) {
				let ok = true
				for (const k in hooks.param_rules) {
					const param_rule = hooks.param_rules[k]
					const param_validator =
						typeof param_rule === 'function' ? param_rule : param_rule?.validator
					if (typeof param_validator === 'function' && !param_validator(params[k])) {
						ok = false
						break
					}
				}
				if (!ok) {
					ℹ('[🧭 match]', 'skip: param_rules', { pattern: obj.data?.[0] })
					continue
				}
				for (const k in hooks.param_rules) {
					const param_rule = hooks.param_rules[k]
					const param_coercer =
						typeof param_rule === 'function' ? null : param_rule?.coercer
					if (typeof param_coercer === 'function') params[k] = param_coercer(params[k])
				}
			}
			if (hooks.validate && !(await hooks.validate(params))) {
				ℹ('[🧭 match]', 'skip: validate', { pattern: obj.data?.[0] })
				continue
			}

			ℹ('[🧭 match]', 'hit', { pattern: obj.data?.[0], params })
			return {
				route: obj.data || null,
				params,
				matches: this.#build_matches(obj.data, obj.stack),
			}
		}
		ℹ('[🧭 match]', 'miss', { url: url_raw })
		return null
	}

	/** @param {RouteEntry[]} [routes] @param {Options} [opts] */
	constructor(routes = [], opts) {
		this.#opts = { ...this.#opts, ...opts }
		this.#base = this.#normalize(this.#opts.base || '/')
		this.#base_rgx =
			this.#base == '/' ? /^\/+/ : new RegExp('^\\' + this.#base + '(?=\\/|$)\\/?', 'i')

		this.#routes = compile_routes(routes)

		ℹ('[🧭 init]', {
			base: this.#base,
			routes: this.#routes.length,
			preload_on_hover: this.#opts.preload_on_hover,
			preload_delay: this.#opts.preload_delay,
		})
	}

	//
	// Lifecycle hooks
	//
	init() {
		history.scrollRestoration = 'manual'
		ℹ('[🧭 init]', 'attach listeners; scrollRestoration=manual')

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

		ℹ('[🧭 init]', 'initial goto')
		if (this.#opts.attach_to_window) window.navgo = this
		return this.goto()
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
			// 0) Initial (first) navigation: prefer restoring session scroll
			const is_initial = ctx && 'from' in ctx ? ctx.from == null : !t
			if (is_initial) {
				try {
					const k = `__navgo_scroll:${location.href}`
					const { x, y } = JSON.parse(sessionStorage.getItem(k))
					sessionStorage.removeItem(k)
					scrollTo(x, y)
					ℹ('[🧭 scroll]', 'restore session', { x, y })
					return
				} catch {}
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
						const k = `__navgo_scroll:${location.href}`
						pos = JSON.parse(sessionStorage.getItem(k)) || null
						sessionStorage.removeItem(k)
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
				if (pos || m) return
			}
			// 2) If there is a hash, prefer anchor scroll
			if (hash && this.#scroll_to_hash(hash)) {
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

	#scroll_to_hash(hash) {
		let id = hash.slice(1)
		if (!id) return false
		try {
			id = decodeURIComponent(id)
		} catch {}
		const el =
			document.getElementById(id) || document.querySelector(`[name="${CSS.escape(id)}"]`)
		el?.scrollIntoView()
		ℹ('[🧭 scroll]', 'anchor', { id, found: !!el })
		return !!el
	}

	/** @type {ValidatorHelpers} */
	static validators = {
		int(opts = {}) {
			const { min = null, max = null } = opts
			return v => {
				if (typeof v !== 'string' || !/^-?\d+$/.test(v)) return false
				const n = Number(v)
				if (min != null && n < min) return false
				if (max != null && n > max) return false
				return true
			}
		},
		one_of(values) {
			const set = new Set(values)
			return v => set.has(v)
		},
	}
}

/** @typedef {import('./index.d.ts').Options} Options */
/** @typedef {import('./index.d.ts').RouteEntry} RouteEntry */
/** @typedef {import('./index.d.ts').RouteGroup} RouteGroup */
/** @typedef {import('./index.d.ts').Match} Match */
/** @typedef {import('./index.d.ts').PreloadBundle} PreloadBundle */
/** @typedef {import('./index.d.ts').RouteTuple} RouteTuple */
/** @typedef {import('./index.d.ts').MatchResult} MatchResult */
/** @typedef {import('./index.d.ts').ValidatorHelpers} ValidatorHelpers */
/** @typedef {import('./index.d.ts').Navigation} Navigation */
