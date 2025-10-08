import { parse } from 'regexparam'

export default class Navaid {
	#opts
	#routes = []
	#base = '/'
	#base_rgx
	#preloads
	#current = { uri: null, route: null, params: {} } // last matched route info
	#on_popstate
	#click
	#mouse_move
	#tap
	#idx
	#before_unload
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

	constructor(routes = [], opts = {}) {
		this.#opts = opts
		this.#base = this.#normalize(this.#opts.base || '/')
		this.#base_rgx =
			this.#base == '/' ? /^\/+/ : new RegExp('^\\' + this.#base + '(?=\\/|$)\\/?', 'i')

		// preload cache: href -> { promise, data, error }
		this.#preloads = new Map()
		this.#idx = 0
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
	 * @param {string} uri
	 * @param {{ replace?: boolean }} [opts]
	 * @returns {Promise<void>}
	 */
	async goto(uri, opts = {}, nav_type = 'goto', ev_param = undefined) {
		if (uri[0] == '/' && !this.#base_rgx.test(uri)) uri = this.#base + uri
		const url = new URL(uri, location.href)
		const path = this.format(url.pathname)?.match(/[^?#]*/)?.[0]
		if (!path) return

		const hit = await this.match(path)
		if (!hit) {
			this.#opts.on404?.(path)
			return
		}

		// Route-level beforeRouteLeave on current (leave)
		{
			const nav = this.#make_nav({
				type: nav_type,
				to: { url, params: hit.params, route: hit.route },
				event: ev_param,
			})
			this.#current?.route?.[1]?.beforeRouteLeave?.(nav)
			if (nav.cancelled) return
			this.#opts.beforeNavigate?.(nav)
		}

		// save current scroll before changing the entry
		this.#save_scroll()

		// run loaders first, cache data by URL (so run() can pick it up)
		const pre = this.#preloads.get(path)
		const data =
			pre?.data ||
			(await (
				pre?.promise ||
				this.#run_loaders(hit.route, hit.params).then(d => {
					this.#preloads.set(path, { data: d })
					return d
				})
			).catch(e => ({ __error: e })))
		this.#preloads.set(path, { data })

		// change URL (this triggers our wrapped pushstate/replacestate; run() will consume cache)
		const next_idx = opts.replace ? this.#idx : this.#idx + 1
		const prev_state = history.state && typeof history.state == 'object' ? history.state : {}
		const next_state = Object.assign({}, prev_state, {
			__navaid: Object.assign({}, prev_state.__navaid, { idx: next_idx, type: nav_type }),
		})
		history[(opts.replace ? 'replace' : 'push') + 'State'](next_state, null, url.href)
		this.#idx = next_idx
		// run immediately so afterNavigate fires without relying on the dispatched event
		await this.run({ state: { __navaid: { type: nav_type } } })
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
			__navaid: Object.assign({}, state?.__navaid, { shallow: true, idx: this.#idx + 1 }),
		})
		history.pushState(st, '', href)
		// note: our event handler will skip run() when it sees shallow=true
		this.#idx = this.#idx + 1
	}

	/**
	 * Shallow replace — same semantics as pushState but replaces current entry.
	 */
	replaceState(url, state) {
		const href = new URL(url || location.href, location.href).href
		// save scroll for current index before shallow change
		this.#save_scroll()
		const st = Object.assign({}, state, {
			__navaid: Object.assign({}, state?.__navaid, { shallow: true, idx: this.#idx }),
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
	// Router driver
	//
	async run(e) {
		// skip when this was a shallow push/replace
		if (e?.state?.__navaid?.shallow) return

		let uri = this.format(location.pathname)
		if (!uri) return
		uri = uri.match(/[^?#]*/)[0]

		const hit = await this.match(uri)

		if (hit) {
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
			// apply scroll after route commit
			this.#apply_scroll(e)
			return
		}
		this.#opts.on404?.(uri)
		this.#apply_scroll(e)
	}

	//
	// Lifecycle hooks
	//
	listen() {
		history.scrollRestoration = 'manual'

		this.#click = async e => {
			const info = this.#link_from_event(e, true)
			if (!info) return
			e.preventDefault()
			await this.goto(info.href, { replace: false }, 'link', e)
		}

		this.#on_popstate = async ev => {
			// Save scroll of the entry we're leaving so it can be restored on forward
			this.#save_scroll()
			const url = new URL(location.href)
			const path = this.format(url.pathname)?.match(/[^?#]*/)?.[0]
			// Construct nav with unknown target first; call leave-guard synchronously
			const nav = this.#make_nav({
				type: 'popstate',
				to: null,
				event: ev,
			})
			this.#current?.route?.[1]?.beforeRouteLeave?.(nav)
			if (nav.cancelled) {
				const new_idx = ev.state?.__navaid?.idx
				if (typeof new_idx === 'number') {
					const delta = new_idx - this.#idx
					if (delta) history.go(-delta)
				}
				return
			}
			const hit = path && (await this.match(path))
			nav.to = hit
				? { url, params: hit.params, route: hit.route }
				: { url, params: {}, route: null }

			// For consistent layout and scroll restoration, run loaders on popstate
			if (hit) {
				try {
					const data = await this.#run_loaders(hit.route, hit.params)
					const p = this.format(url.pathname)?.match(/[^?#]*/)?.[0]
					if (p) this.#preloads.set(p, { data })
				} catch (e) {
					const p = this.format(url.pathname)?.match(/[^?#]*/)?.[0]
					if (p) this.#preloads.set(p, { data: { __error: e } })
				}
			}
			this.run(ev)
		}
		addEventListener('popstate', this.#on_popstate)
		addEventListener('click', this.#click)

		const hover_delay = this.#opts.preloadDelay ?? 20
		let hover_timer = null
		const maybe_preload = ev => {
			const info = this.#link_from_event(ev, ev.type === 'mousedown')
			if (!info) return
			this.preload(info.href)
		}
		const mouse_move = ev => {
			clearTimeout(hover_timer)
			hover_timer = setTimeout(() => maybe_preload(ev), hover_delay)
		}
		const tap = ev => maybe_preload(ev)
		if (this.#opts.preloadOnHover !== false) {
			addEventListener('mousemove', mouse_move)
			addEventListener('touchstart', tap, { passive: true })
			addEventListener('mousedown', tap)
			this.#mouse_move = mouse_move
			this.#tap = tap
		}
		// ensure current history state carries our index
		const cur_idx = history.state?.__navaid?.idx
		if (typeof cur_idx !== 'number') {
			const prev = history.state && typeof history.state == 'object' ? history.state : {}
			const nextState = Object.assign({}, prev, {
				__navaid: Object.assign({}, prev.__navaid, { idx: this.#idx }),
			})
			history.replaceState(nextState, '', location.href)
		} else {
			this.#idx = cur_idx
		}
		// beforeunload -> 'leave' event (route-level)
		const before_unload = ev => {
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
		this.#before_unload = ev => before_unload(ev)
		addEventListener('beforeunload', this.#before_unload)

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
		const el = e.composedPath()[0]
		const a = el?.closest?.('a')
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
		this.#scroll.set(this.#idx, { x: scrollX, y: scrollY })
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
				const target_idx = typeof idx === 'number' ? idx : this.#idx - 1
				// Update our current index to match the target of popstate
				this.#idx = target_idx
				const pos = this.#scroll.get(target_idx)
				if (pos) {
					if (typeof scrollTo === 'function') scrollTo(pos.x, pos.y)
					return
				}
			}
			// 2) If there is a hash, prefer anchor scroll
			if (hash && this.#scroll_to_hash(hash)) return
			// 3) Default: scroll to top for new navigations
			if (typeof scrollTo === 'function') scrollTo(0, 0)
		})
	}

	#scroll_to_hash(hash) {
		let id = hash.slice(1)
		if (!id) return false
		try {
			id = decodeURIComponent(hash)
		} catch {}
		const el =
			document.getElementById(id) || document.querySelector(`[name="${CSS.escape(id)}"]`)
		el?.scrollIntoView()
		return !!el
	}
}
