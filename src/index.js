import { parse } from 'regexparam'

export default class Navaid {
	#opts
	#routes = []
	#base = '/'
	#base_rgx
	#preloads
	#current = { uri: null, route: null, params: {} } // last matched route info
	#mouse_move
	#tap
	#route_idx
	#scroll

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
		oneOf(values) {
			const set = new Set(values)
			return v => set.has(v)
		},
	}

	constructor(routes = [], opts = { preload_delay: 20, preload_on_hover: true }) {
		this.#opts = opts
		this.#base = this.#normalize(this.#opts.base || '/')
		this.#base_rgx =
			this.#base == '/' ? /^\/+/ : new RegExp('^\\' + this.#base + '(?=\\/|$)\\/?', 'i')

		// preload cache: href -> { promise, data, error }
		this.#preloads = new Map()
		this.#route_idx = 0
		this.#scroll = new Map()

		for (const r of routes) {
			const patOrRx = r[0]
			let pat
			if (patOrRx instanceof RegExp) {
				pat = { pattern: patOrRx, keys: null }
			} else {
				pat = parse(patOrRx)
			}
			pat.data = r // keep original tuple: [pattern, hooks, ...]
			this.#routes.push(pat)
		}
	}

	//
	// Helpers
	//
	#normalize(uri) {
		return '/' + (uri || '').replace(/^\/|\/$/g, '')
	}

	format(uri) {
		if (!uri) return uri
		uri = this.#normalize(uri)
		return this.#base_rgx.test(uri) && uri.replace(this.#base_rgx, '/')
	}

	/**
	 * Programmatic navigation that runs loaders before changing URL.
	 * Also used by popstate to unify the flow.
	 * @param {string} uri
	 * @param {{ replace?: boolean }} [opts]
	 * @param {'goto'|'link'|'popstate'} [nav_type]
	 * @param {Event} [ev_param]
	 * @returns {Promise<void>}
	 */
	async goto(uri, opts = {}, nav_type = 'goto', ev_param = undefined) {
		const is_popstate = nav_type === 'popstate'
		if (is_popstate) this.#save_scroll()

		if (uri[0] == '/' && !this.#base_rgx.test(uri)) uri = this.#base + uri
		const url = new URL(uri, location.href)
		const path = this.format(url.pathname)?.match(/[^?#]*/)?.[0]
		if (!path) return

		// Route-level guard MUST run synchronously before any awaits
		if (is_popstate) {
			const nav = this.#make_nav({ type: 'popstate', to: null, event: ev_param })
			this.#current?.route?.[1]?.beforeRouteLeave?.(nav)
			if (nav.cancelled) {
				const new_idx = ev_param?.state?.__navaid?.idx
				if (new_idx != null) {
					const delta = new_idx - this.#route_idx
					if (delta) history.go(-delta)
				}
				return
			}
		}

		// For link/goto, run guard before async work too (nav.to will be filled by run())
		if (!is_popstate) {
			const nav = this.#make_nav({
				type: nav_type,
				to: { url, params: {}, route: null },
				event: ev_param,
			})
			this.#current?.route?.[1]?.beforeRouteLeave?.(nav)
			if (nav.cancelled) return
			this.#opts.beforeNavigate?.(nav)
			this.#save_scroll()
		}

		const hit = await this.match(path)
		if (!hit) {
			this.#opts.on404?.(path)
			if (is_popstate) this.#apply_scroll(ev_param)
			return
		}

		// run loaders first, cache data by URL (so run() can pick it up)
		const pre = this.#preloads.get(path)
		const data =
			pre?.data ??
			(await (pre?.promise || this.#run_loaders(hit.route, hit.params)).catch(e => ({
				__error: e,
			})))
		this.#preloads.set(path, { data })

		// change URL (not needed for popstate - browser already did it)
		if (!is_popstate) {
			const next_idx = this.#route_idx + (opts.replace ? 0 : 1)
			const prev_state =
				history.state && typeof history.state == 'object' ? history.state : {}
			const next_state = Object.assign({}, prev_state, {
				__navaid: Object.assign({}, prev_state.__navaid, { idx: next_idx, type: nav_type }),
			})
			history[(opts.replace ? 'replace' : 'push') + 'State'](next_state, null, url.href)
			this.#route_idx = next_idx
		}

		await this.run({ state: { __navaid: { type: nav_type } } })
	}

	//
	// Router driver
	//
	async run(e) {
		// skip when this was a shallow push/replace
		if (e?.state?.__navaid?.shallow) return

		const uri = this.format(location.pathname)?.match(/[^?#]*/)?.[0]
		if (!uri) return

		const hit = await this.match(uri)
		if (!hit) {
			this.#opts.on404?.(uri)
			this.#apply_scroll(e)
			return
		}

		const prev = this.#current
		this.#current = { uri, route: hit.route, params: hit.params }

		// Use any preloaded data for this URI (from goto() or hover preload)
		const pre = this.#preloads.get(uri)
		const loaded = pre?.data
		if (pre) this.#preloads.delete(uri)

		// Build a completion nav using the previous route as `from`
		const nav = this.#make_nav({
			type: e?.state?.__navaid?.type || (e?.type === 'popstate' ? 'popstate' : 'goto'),
			from: prev?.uri
				? {
						url: new URL(prev.uri, location.origin),
						params: prev.params || {},
						route: prev.route,
					}
				: null,
			to: {
				url: new URL(location.href),
				params: hit.params,
				route: hit.route,
				data: loaded,
			},
			event: e,
		})
		this.#opts.afterNavigate?.(nav)
		this.#apply_scroll(e)
	}

	/**
	 * Shallow push — updates the URL/state but DOES NOT call handlers or loaders.
	 * URL changes, content stays put until a real nav.
	 */
	pushState(url, state) {
		const href = new URL(url || location.href, location.href).href
		// save scroll for current index before shallow change
		this.#save_scroll()
		const st = Object.assign({}, state, {
			__navaid: Object.assign({}, state?.__navaid, {
				shallow: true,
				idx: this.#route_idx + 1,
			}),
		})
		history.pushState(st, '', href)
		// note: our event handler will skip run() when it sees shallow=true
		this.#route_idx = this.#route_idx + 1
	}

	/**
	 * Shallow replace — same semantics as pushState but replaces current entry.
	 */
	replaceState(url, state) {
		const href = new URL(url || location.href, location.href).href
		// save scroll for current index before shallow change
		this.#save_scroll()
		const st = Object.assign({}, state, {
			__navaid: Object.assign({}, state?.__navaid, { shallow: true, idx: this.#route_idx }),
		})
		history.replaceState(st, '', href)
	}

	/**
	 * Manually preload loaders for a URL (e.g. to prime cache).
	 * Dedupes concurrent preloads for the same path.
	 */
	async preload(uri) {
		if (uri[0] == '/' && !this.#base_rgx.test(uri)) uri = this.#base + uri
		const url = new URL(uri, location.href)
		const path = this.format(url.pathname)?.match(/[^?#]*/)?.[0]
		if (!path) return Promise.resolve()
		// Do not preload if we're already at this path
		if (path === this.#current?.uri) return Promise.resolve()
		const hit = await this.match(path)
		if (!hit) return Promise.resolve()

		if (this.#preloads.has(path)) {
			const p = this.#preloads.get(path)
			return p.promise || Promise.resolve(p.data)
		}

		const entry = {}
		entry.promise = this.#run_loaders(hit.route, hit.params).then(data => {
			entry.data = data
			delete entry.promise
			return data
		})
		this.#preloads.set(path, entry)
		return entry.promise
	}

	//
	// Core matching
	//
	async match(uri) {
		let arr, obj
		for (let i = 0; i < this.#routes.length; i++) {
			obj = this.#routes[i]
			if ((arr = obj.pattern.exec(uri))) {
				const params = {}
				if (obj.keys?.length) {
					for (let j = 0; j < obj.keys.length; ) {
						params[obj.keys[j]] = arr[++j] || null
					}
				} else if (arr.groups) {
					for (const k in arr.groups) params[k] = arr.groups[k]
				}

				// per-route validators and optional async validate()
				const hooks = obj.data[1]
				if (
					hooks.param_validators &&
					!this.#check_param_validators(hooks.param_validators, params)
				)
					continue
				if (hooks.validate && !(await hooks.validate(params))) {
					continue
				}

				return { route: obj.data || null, params }
			}
		}
		return null
	}

	//
	// Event listeners
	//
	#click = e => {
		const info = this.#link_from_event(e, true)
		if (!info) return
		e.preventDefault()
		this.goto(info.href, { replace: false }, 'link', e)
	}

	#on_popstate = ev => {
		// unify via goto; it will handle leave-guards, preloads, and scroll
		this.goto(location.href, { replace: true }, 'popstate', ev)
	}

	#before_unload = ev => {
		// persist scroll for refresh / session restore
		try {
			sessionStorage.setItem(
				`__navaid_scroll:${location.href}`,
				JSON.stringify({ x: scrollX, y: scrollY }),
			)
		} catch {}

		const nav = this.#make_nav({
			type: 'leave',
			to: null,
			willUnload: true,
			event: ev,
		})
		this.#current?.route?.[1]?.beforeRouteLeave?.(nav)
		if (nav.cancelled) {
			ev.preventDefault()
			ev.returnValue = ''
		}
		this.#opts.beforeNavigate?.(nav)
	}

	//
	// Lifecycle hooks
	//
	listen() {
		history.scrollRestoration = 'manual'

		addEventListener('popstate', this.#on_popstate)
		addEventListener('click', this.#click)
		addEventListener('beforeunload', this.#before_unload)

		let hover_timer = null
		const maybe_preload = ev => {
			const info = this.#link_from_event(ev, ev.type === 'mousedown')
			if (info) this.preload(info.href)
		}
		this.#mouse_move = ev => {
			clearTimeout(hover_timer)
			hover_timer = setTimeout(() => maybe_preload(ev), this.#opts.preload_delay)
		}
		this.#tap = ev => maybe_preload(ev)
		if (this.#opts.preload_on_hover) {
			addEventListener('mousemove', this.#mouse_move)
			addEventListener('touchstart', this.#tap, { passive: true })
			addEventListener('mousedown', this.#tap)
		}

		// ensure current history state carries our index
		const cur_idx = history.state?.__navaid?.idx
		if (cur_idx == null) {
			const prev = history.state && typeof history.state == 'object' ? history.state : {}
			const next_state = Object.assign({}, prev, {
				__navaid: Object.assign({}, prev.__navaid, { idx: this.#route_idx }),
			})
			history.replaceState(next_state, '', location.href)
		} else {
			this.#route_idx = cur_idx
		}

		this.run()
	}

	unlisten() {
		removeEventListener('popstate', this.#on_popstate)
		removeEventListener('click', this.#click)

		if (this.#mouse_move) removeEventListener('mousemove', this.#mouse_move)
		if (this.#tap) {
			removeEventListener('touchstart', this.#tap, { passive: true })
			removeEventListener('mousedown', this.#tap)
		}
		removeEventListener('beforeunload', this.#before_unload)
	}

	//
	// Internals
	//
	#link_from_event(e, check_button = false) {
		if (
			!e ||
			e.defaultPrevented ||
			e.metaKey ||
			e.ctrlKey ||
			e.shiftKey ||
			e.altKey ||
			(check_button && e.button)
		)
			return null
		const a = e.composedPath()[0]?.closest?.('a')
		const href = a?.getAttribute?.('href')
		return href &&
			!a?.target &&
			!a?.download &&
			href[0] != '#' &&
			a?.host === location.host &&
			(href[0] != '/' || this.#base_rgx.test(href))
			? { a, href }
			: null
	}

	#check_param_validators(param_validators, params) {
		if (!param_validators) return true
		for (const k in param_validators) {
			const fn = param_validators[k]
			if (typeof fn !== 'function') continue
			if (!fn(params[k])) return false
		}
		return true
	}

	async #run_loaders(route, params) {
		const ret_val = route[1].loaders?.(params)
		return Array.isArray(ret_val) ? Promise.all(ret_val) : ret_val
	}

	#make_nav({ type, from = undefined, to = undefined, willUnload = false, event = undefined }) {
		const from_obj =
			from !== undefined
				? from
				: this.#current?.uri
					? {
							url: new URL(this.#current.uri, location.origin),
							params: this.#current.params || {},
							route: this.#current.route,
						}
					: null
		return {
			type, // 'link' | 'goto' | 'popstate' | 'leave'
			from: from_obj,
			to,
			willUnload,
			cancelled: false,
			event,
			cancel() {
				this.cancelled = true
			},
		}
	}

	#save_scroll() {
		this.#scroll.set(this.#route_idx, { x: scrollX, y: scrollY })
	}

	#apply_scroll(e) {
		const hash = location.hash
		const ev_type = e?.type
		requestAnimationFrame(() => {
			// 0) If this is an initial run (not popstate), prefer restoring
			// last-known position from sessionStorage (e.g., after refresh/tab restore)
			if (!ev_type) {
				try {
					const k = `__navaid_scroll:${location.href}`
					const { x, y } = JSON.parse(sessionStorage.getItem(k))
					sessionStorage.removeItem(k)
					scrollTo(x, y)
					return
				} catch {}
			}
			// 1) On back/forward, restore saved position if available
			if (ev_type === 'popstate') {
				const idx = e?.state?.__navaid?.idx
				const target_idx = typeof idx === 'number' ? idx : this.#route_idx - 1
				// Update our current index to match the target of popstate
				this.#route_idx = target_idx
				const pos = this.#scroll.get(target_idx)
				if (pos) {
					scrollTo(pos.x, pos.y)
					return
				}
			}
			// 2) If there is a hash, prefer anchor scroll
			if (hash && this.#scroll_to_hash(hash)) return
			// 3) Default: scroll to top for new navigations
			scrollTo(0, 0)
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
		return !!el
	}
}
