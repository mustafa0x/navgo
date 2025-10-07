import { parse } from 'regexparam'

/**
 * Navaid with routing ergonomics:
 * - load-then-navigate (goto)
 * - per-route hooks: loaders(params): Promise|Promise[]; beforeNavigate(ctx)
 * - param validators via hooks.param_validators
 * - shallow routing: pushState/replaceState that don't trigger route handlers
 * - preload on hover/tap
 *
 * Route shape examples:
 *   ['/users/:id', {
 *     param_validators: { id: Navaid.validators.int({ min: 1, max: 114 }) },
 *     loaders(params) { return fetch(`/api/users/${params.id}`).then(r => r.json()) },
 *     beforeNavigate({ from, to, type, cancel }) {
 *       // return false or call cancel() to stop navigation
 *     }
 *   }]
 */
export default class Navaid {
	#opts
	#routes
	#base
	#rgx
	#preloads
	#current
	#run_wrapped
	#click
	#mousemove
	#tap
	#idx
	#beforeunload
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

	constructor(routes_ = [], opts = {}) {
		this.#opts = opts
		this.#routes = []
		this.#base = this.#normalize(this.#opts.base || '/')
		this.#rgx =
			this.#base == '/' ? /^\/+/ : new RegExp('^\\' + this.#base + '(?=\\/|$)\\/?', 'i')

		// preload cache: href -> { promise, data, error }
		this.#preloads = new Map()
		// last matched route info
		this.#current = { uri: null, route: null, params: {} }
		this.#idx = 0
		this.#scroll = new Map()

		for (const r of routes_) {
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
		return this.#rgx.test(uri) && uri.replace(this.#rgx, '/')
	}

	/**
	 * Programmatic navigation that runs loaders before changing URL.
	 * @param {string} uri
	 * @param {{ replace?: boolean }} [opts]
	 * @returns {Promise<void>}
	 */
	async goto(uri, opts = {}, navType = 'goto', evParam = undefined) {
		if (uri[0] == '/' && !this.#rgx.test(uri)) uri = this.#base + uri
		const url = new URL(uri, location.href)
		const path = this.format(url.pathname)?.match(/[^?#]*/)?.[0]
		if (!path) return

		const hit = this.match(path)
		if (!hit) {
			this.#opts.on404?.(path)
			return
		}

		// Route-level beforeNavigate on current (leave) and next (enter)
		{
			const nav = this.#makeBeforeNav({
				type: navType,
				to: { url, params: hit.params, route: hit.route },
				event: evParam,
			})
			this.#callRouteBefore(nav, this.#current.route)
			if (nav.cancelled) return
		}

		// save current scroll before changing the entry
		this.#saveScroll()

		// run loaders first, cache data by URL (so run() can pick it up)
		const data = await this.#loadFor(hit.route, hit.params).catch(e => {
			// If loaders fail, we still navigate to keep behavior predictable.
			// Apps can show errors from the returned data.
			return { __error: e }
		})
		this.#preloads.set(path, { data })

		// change URL (this triggers our wrapped pushstate/replacestate; run() will consume cache)
		const nextIdx = opts.replace ? this.#idx : this.#idx + 1
		const prevState = history.state && typeof history.state == 'object' ? history.state : {}
		const nextState = Object.assign({}, prevState, {
			__navaid: Object.assign({}, prevState.__navaid, { idx: nextIdx }),
		})
		history[(opts.replace ? 'replace' : 'push') + 'State'](nextState, null, url.href)
		this.#idx = nextIdx
	}

	/**
	 * Shallow push — updates the URL/state but DOES NOT call handlers or loaders.
	 * URL changes, content stays put until a real nav.
	 */
	pushState(url, state) {
		const href = new URL(url || location.href, location.href).href
		// save scroll for current index before shallow change
		this.#saveScroll()
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
		this.#saveScroll()
		const st = Object.assign({}, state, {
			__navaid: Object.assign({}, state?.__navaid, { shallow: true, idx: this.#idx }),
		})
		history.replaceState(st, '', href)
	}

	/**
	 * Manually preload loaders for a URL (e.g. to prime cache).
	 * Dedupes concurrent preloads for the same path.
	 */
	preload(uri) {
		if (uri[0] == '/' && !this.#rgx.test(uri)) uri = this.#base + uri
		const url = new URL(uri, location.href)
		const path = this.format(url.pathname)?.match(/[^?#]*/)?.[0]
		if (!path) return Promise.resolve()
		const hit = this.match(path)
		if (!hit) return Promise.resolve()

		if (this.#preloads.has(path)) {
			const p = this.#preloads.get(path)
			return p.promise || Promise.resolve(p.data)
		}

		const entry = {}
		entry.promise = this.#loadFor(hit.route, hit.params).then(data => {
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
	match(uri) {
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

				// optional per-route param validators (e.g. enforce int ranges etc.)
				const hooks = this.#hooksFor(obj.data)
				const ok = this.#check_param_validators(hooks?.param_validators, params)
				if (!ok) continue

				return { route: obj.data || null, params }
			}
		}
		return null
	}

	//
	// Router driver
	//
	run(e) {
		// skip when this was a shallow push/replace
		if (e?.state?.__navaid?.shallow) return

		let uri = this.format(location.pathname)
		if (!uri) return
		uri = uri.match(/[^?#]*/)[0]

		const hit = this.match(uri)

		if (hit) {
			this.#current = { uri, route: hit.route, params: hit.params }

			// Use any preloaded data for this URI (from goto() or hover preload)
			const pre = this.#preloads.get(uri)
			const loaded = pre?.data
			if (pre) this.#preloads.delete(uri)

			this.#opts.onRoute?.(uri, hit.route, hit.params, loaded) // back-compat + data
			// apply scroll after route commit
			this.#applyScroll(e)
			return
		}
		this.#opts.on404?.(uri)
		this.#applyScroll(e)
	}

	//
	// Lifecycle hooks
	//
	listen() {
		this.#wrap('push')
		this.#wrap('replace')

		// manual scroll restoration — we manage it
		if (typeof history.scrollRestoration === 'string') {
			history.scrollRestoration = 'manual'
		}

		const run_wrapped = ev => {
			this.run(ev)
		}

		// Click to navigate — load then change URL (SvelteKit-like)
		this.#click = async e => {
			if (e.defaultPrevented) return
			if (e.button || e.which !== 1) return
			if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

			const el = e.target.closest('a')
			const href = el?.getAttribute('href')
			if (!href) return
			if (el.target || el.download) return
			if (href[0] == '#') return
			// External?
			if (el.host !== location.host) return

			if (href[0] != '/' || this.#rgx.test(href)) {
				e.preventDefault()
				await this.goto(href, { replace: false }, 'link', e)
			}
		}

		addEventListener('popstate', ev => {
			const url = new URL(location.href)
			const path = this.format(url.pathname)?.match(/[^?#]*/)?.[0]
			const hit = path && this.match(path)
			const nav = this.#makeBeforeNav({
				type: 'popstate',
				to: hit
					? { url, params: hit.params, route: hit.route }
					: { url, params: {}, route: null },
				event: ev,
			})
			this.#callRouteBefore(nav, this.#current.route)
			if (nav.cancelled) {
				const newIdx = ev.state?.__navaid?.idx
				if (typeof newIdx === 'number') {
					const delta = newIdx - this.#idx
					if (delta) history.go(-delta)
				}
				return
			}
			run_wrapped(ev)
		})
		addEventListener('replacestate', run_wrapped)
		addEventListener('pushstate', run_wrapped)
		addEventListener('click', this.#click)
		this.#run_wrapped = run_wrapped

		const hoverDelay = this.#opts.preloadDelay ?? 20
		let hoverTimer = null
		const maybePreload = el => {
			const a = el?.closest?.('a')
			const href = a?.getAttribute?.('href')
			if (!href || a.target || a.download || a.host !== location.host) return
			if (!(href[0] != '/' || this.#rgx.test(href))) return
			this.preload(href)
		}
		const mousemove = ev => {
			clearTimeout(hoverTimer)
			hoverTimer = setTimeout(() => maybePreload(ev.target), hoverDelay)
		}
		const tap = ev => {
			if (ev.defaultPrevented) return
			maybePreload(ev.composedPath ? ev.composedPath()[0] : ev.target)
		}
		if (this.#opts.preloadOnHover !== false) {
			addEventListener('mousemove', mousemove)
			addEventListener('touchstart', tap, { passive: true })
			addEventListener('mousedown', tap)
			this.#mousemove = mousemove
			this.#tap = tap
		}
		// ensure current history state carries our index
		const curIdx = history.state?.__navaid?.idx
		if (typeof curIdx !== 'number') {
			const prev = history.state && typeof history.state == 'object' ? history.state : {}
			const nextState = Object.assign({}, prev, {
				__navaid: Object.assign({}, prev.__navaid, { idx: this.#idx }),
			})
			history.replaceState(nextState, '', location.href)
		} else {
			this.#idx = curIdx
		}
		// beforeunload -> 'leave' event (route-level)
		function beforeunload(ev) {
			const nav = this.#makeBeforeNav({
				type: 'leave',
				to: null,
				willUnload: true,
				event: ev,
			})
			this.#callRouteBefore(nav, this.#current.route)
			if (nav.cancelled) {
				ev.preventDefault()
				ev.returnValue = ''
			}
		}
		addEventListener('beforeunload', beforeunload)
		this.#beforeunload = beforeunload

		this.run()
	}

	unlisten() {
		removeEventListener('popstate', this.#run_wrapped)
		removeEventListener('replacestate', this.#run_wrapped)
		removeEventListener('pushstate', this.#run_wrapped)
		removeEventListener('click', this.#click)

		if (this.#mousemove) removeEventListener('mousemove', this.#mousemove)
		if (this.#tap) {
			removeEventListener('touchstart', this.#tap, { passive: true })
			removeEventListener('mousedown', this.#tap)
		}
		if (this.#beforeunload) removeEventListener('beforeunload', this.#beforeunload)
	}

	//
	// Internals
	//
	#hooksFor(routeTuple) {
		// routes[i] === [pattern, hooks?]
		return routeTuple?.[1] || null
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

	async #loadFor(routeTuple, params) {
		const hooks = this.#hooksFor(routeTuple)
		if (!hooks?.loaders) return undefined
		let res = hooks.loaders(params)
		if (Array.isArray(res)) {
			return Promise.all(res)
		}
		return res
	}

	#makeBeforeNav({ type, to, willUnload = false, event = undefined }) {
		const from = this.#current?.uri
			? {
					url: new URL(this.#current.uri, location.origin),
					params: this.#current.params || {},
					route: this.#current.route,
				}
			: null
		const nav = {
			type, // 'link' | 'goto' | 'popstate' | 'leave'
			from,
			to,
			willUnload,
			cancelled: false,
			event,
			cancel() {
				this.cancelled = true
			},
		}
		return nav
	}

	#callRouteBefore(nav, routeTuple) {
		const hooks = this.#hooksFor(routeTuple)
		const fn = hooks?.beforeNavigate
		if (!fn) return
		// Synchronous cancellation only; ignore returned promises
		fn(nav)
	}

	#saveScroll() {
		const x =
			typeof scrollX === 'number'
				? scrollX
				: typeof window !== 'undefined'
					? window.scrollX || 0
					: 0
		const y =
			typeof scrollY === 'number'
				? scrollY
				: typeof window !== 'undefined'
					? window.scrollY || 0
					: 0
		this.#scroll.set(this.#idx, { x, y })
	}

	#applyScroll(e) {
		const hash = location.hash
		const evtype = e?.type
		requestAnimationFrame(() => {
			// 1) If there is a hash, prefer anchor scroll
			if (hash && this.#scrollToHash(hash)) return
			// 2) On back/forward, restore saved position if available
			if (evtype === 'popstate') {
				const idx = e?.state?.__navaid?.idx
				const fallback_idx = typeof idx === 'number' ? idx : this.#idx - 1
				const pos = this.#scroll.get(fallback_idx)
				if (pos) {
					if (typeof scrollTo === 'function') scrollTo(pos.x, pos.y)
					if (typeof idx === 'number') this.#idx = idx
					else this.#idx = fallback_idx
					return
				}
			}
			// 3) Default: scroll to top for new navigations
			if (typeof scrollTo === 'function') scrollTo(0, 0)
		})
	}

	#scrollToHash(hash) {
		if (!hash || hash === '#') return false
		let id = ''
		try {
			id = decodeURIComponent(hash.slice(1))
		} catch {
			id = hash.slice(1)
		}
		let el = null
		try {
			const sel = CSS?.escape ? CSS.escape(id) : id
			el = document.getElementById(id) || document.querySelector(`[name="${sel}"]`)
		} catch {
			el = document.getElementById(id)
		}
		if (el) {
			if (typeof el.scrollIntoView === 'function') el.scrollIntoView()
			return true
		}
		return false
	}

	// Wrap native history to dispatch custom events we can inspect (and carry state/url).
	// Also used to bypass navigation during shallow routing entries
	#wrap(type, fn) {
		if (history[type]) return
		history[type] = type
		fn = history[(type += 'State')]
		history[type] = function (state, title, url) {
			const ev = new Event(type.toLowerCase())
			ev.state = state
			ev.url = url
			fn.apply(this, arguments)
			return dispatchEvent(ev)
		}
	}
}
