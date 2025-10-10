import { parse } from 'regexparam'

export default class Navaid {
	#opts = {
		base: '/',
		preload_delay: 20,
		preload_on_hover: true,
		on_404: undefined,
		before_navigate: undefined,
		after_navigate: undefined,
	}
	#routes = []
	#base = '/'
	#base_rgx = /^\/+/
	// preload cache: href -> { promise, data, error }
	#preloads = new Map()
	#current = { uri: null, route: null, params: {} } // last matched route info
	#route_idx = 0
	#scroll = new Map()
	#hash_navigating = false

	//
	// Event listeners
	//
	#click = e => {
		console.debug('[navaid:event:click]', { type: e?.type, target: e?.target })
		const info = this.#link_from_event(e, true)
		if (!info) return

		const url = new URL(info.href, location.href)
		const same_path =
			this.format(url.pathname) === (this.#current?.uri || this.format(location.pathname))
		const has_hash = info.href.includes('#') || url.hash !== ''

		// Hash-only navigation on same path: let browser handle, but track index
		if (has_hash && same_path) {
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
				console.debug('[navaid:hash]', 'same-hash scroll')
				return
			}

			// different hash on same path — let browser update URL + scroll
			this.#hash_navigating = true
			this.#save_scroll()
			console.debug('[navaid:hash]', 'navigate', { href: url.href })
			return
		}

		e.preventDefault()
		console.debug('[navaid:link]', 'intercept', { href: info.href })
		this.goto(info.href, { replace: false }, 'link', e)
	}

	#on_popstate = ev => {
		// ignore popstate while a hash-originating nav is in flight
		if (this.#hash_navigating) return

		// 1) If target entry is marked shallow, skip router work; just restore scroll
		if (ev?.state?.__navaid?.shallow) {
			console.debug('[navaid:event:popstate]', 'shallow entry; skip')
			this.#apply_scroll(ev)
			return
		}

		// 2) Same-path popstate is effectively shallow (query/hash only)
		const path = this.format(location.pathname)
		if (path && path === this.#current?.uri) {
			console.debug('[navaid:event:popstate]', 'same-path; skip loaders', {
				idx: ev?.state?.__navaid?.idx,
				path,
			})
			this.#apply_scroll(ev)
			return
		}

		console.debug('[navaid:event:popstate]', { idx: ev?.state?.__navaid?.idx })
		this.goto(location.href, { replace: true }, 'popstate', ev)
	}
	#on_hashchange = () => {
		// if hashchange originated from a click we tracked, bump our index and persist it
		if (!this.#hash_navigating) return
		this.#hash_navigating = false
		const prev = history.state && typeof history.state == 'object' ? history.state : {}
		const next_idx = this.#route_idx + 1
		const next_state = Object.assign({}, prev, {
			__navaid: Object.assign({}, prev.__navaid, { idx: next_idx }),
		})
		history.replaceState(next_state, '', location.href)
		this.#route_idx = next_idx
		console.debug('[navaid:event:hashchange]', { idx: next_idx, href: location.href })
	}

	#hover_timer = null
	#maybe_preload = ev => {
		const info = this.#link_from_event(ev, ev.type === 'mousedown')
		if (info) {
			console.debug('[navaid:preload]', 'link hover/tap', { href: info.href })
			this.preload(info.href)
		}
	}
	#mouse_move = ev => {
		clearTimeout(this.#hover_timer)
		this.#hover_timer = setTimeout(() => this.#maybe_preload(ev), this.#opts.preload_delay)
	}
	#tap = ev => this.#maybe_preload(ev)

	#before_unload = ev => {
		// persist scroll for refresh / session restore
		try {
			sessionStorage.setItem(
				`__navaid_scroll:${location.href}`,
				JSON.stringify({ x: scrollX, y: scrollY }),
			)
		} catch {}

		console.debug('[navaid:event:beforeunload]', 'persist scroll + guard')

		const nav = this.#make_nav({
			type: 'leave',
			to: null,
			willUnload: true,
			event: ev,
		})
		this.#current?.route?.[1]?.beforeRouteLeave?.(nav)
		if (nav.cancelled) {
			console.debug('[navaid:navigate]', 'cancelled by beforeRouteLeave during unload')
			ev.preventDefault()
			ev.returnValue = ''
		}
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
		oneOf(values) {
			const set = new Set(values)
			return v => set.has(v)
		},
	}

	/** @param {RouteTuple[]} [routes] @param {Options} [opts] */
	constructor(routes = [], opts) {
		this.#opts = { ...this.#opts, ...opts }
		this.#base = this.#normalize(this.#opts.base || '/')
		this.#base_rgx =
			this.#base == '/' ? /^\/+/ : new RegExp('^\\' + this.#base + '(?=\\/|$)\\/?', 'i')

		this.#routes = routes.map(r => {
			const pat_or_rx = r[0]
			const pat =
				pat_or_rx instanceof RegExp ? { pattern: pat_or_rx, keys: null } : parse(pat_or_rx)
			pat.data = r // keep original tuple: [pattern, hooks, ...]
			return pat
		})

		console.debug('[navaid:init]', {
			base: this.#base,
			routes: this.#routes.length,
			preload_on_hover: this.#opts.preload_on_hover,
			preload_delay: this.#opts.preload_delay,
		})
	}

	//
	// Helpers
	//
	#normalize(uri) {
		return '/' + (uri || '').replace(/^\/|\/$/g, '')
	}
	/** @param {string} uri @returns {string|false} */
	format(uri) {
		if (!uri) return uri
		uri = this.#normalize(uri)
		const out = this.#base_rgx.test(uri) && uri.replace(this.#base_rgx, '/')
		console.debug('[navaid:format]', { in: uri, out })
		return out
	}
	#resolve_url_and_path(uri) {
		if (uri[0] == '/' && !this.#base_rgx.test(uri)) uri = this.#base + uri
		const url = new URL(uri, location.href)
		const path = this.format(url.pathname)?.match(/[^?#]*/)?.[0]
		console.debug('[navaid:resolve]', { uri, url: url.href, path })
		return path ? { url, path } : null
	}

	/**
	 * Programmatic navigation that runs loaders before changing URL.
	 * Also used by popstate to unify the flow.
	 * @param {string} [uri]
	 * @param {{ replace?: boolean }} [opts]
	 * @param {'goto'|'link'|'popstate'} [nav_type]
	 * @param {Event} [ev_param]
	 * @returns {Promise<void>}
	 */
	async goto(uri = location.pathname, opts = {}, nav_type = 'goto', ev_param = undefined) {
		const info = this.#resolve_url_and_path(uri)
		if (!info) {
			console.debug('[navaid:goto]', 'invalid uri', { uri })
			return
		}
		const { url, path } = info

		const is_popstate = nav_type === 'popstate'
		let nav = this.#make_nav({ type: nav_type, to: null, event: ev_param })
		console.debug('[navaid:goto]', 'start', {
			type: nav_type,
			path,
			replace: !!opts.replace,
			popstate: is_popstate,
		})

		//
		// beforeRouteLeave
		//
		this.#current?.route?.[1]?.beforeRouteLeave?.(nav)
		if (nav.cancelled) {
			// use history.go to cancel the nav, and jump back to where we are
			if (is_popstate) {
				const new_idx = ev_param?.state?.__navaid?.idx
				if (new_idx != null) {
					const delta = new_idx - this.#route_idx
					if (delta) {
						console.debug('[navaid:goto]', 'cancel popstate; correcting history', {
							delta,
						})
						history.go(-delta)
					}
				}
			}
			console.debug('[navaid:goto]', 'cancelled by beforeRouteLeave')
			return
		}

		//
		// #
		//
		this.#opts.before_navigate?.(nav)
		console.debug('[navaid:hooks]', 'before_navigate', {
			from: nav.from?.url?.href,
			to: url.href,
		})
		this.#save_scroll()

		//
		// match
		//
		const hit = await this.match(path)
		if (!hit) {
			this.#opts.on_404?.(path)
			console.debug('[navaid:match]', '404', { path })
			this.#apply_scroll(ev_param)
			return
		}

		//
		// loaders
		//
		const pre = this.#preloads.get(path)
		const data =
			pre?.data ??
			(await (pre?.promise || this.#run_loaders(hit.route, hit.params)).catch(e => ({
				__error: e,
			})))
		this.#preloads.delete(path)
		console.debug('[navaid:loaders]', pre ? 'using preloaded data' : 'loaded', {
			path,
			preloaded: !!pre,
			has_error: !!data?.__error,
		})

		//
		// change URL (not needed for popstate - browser already did it)
		//
		if (!is_popstate) {
			const next_idx = this.#route_idx + (opts.replace ? 0 : 1)
			const prev_state =
				history.state && typeof history.state == 'object' ? history.state : {}
			const next_state = Object.assign({}, prev_state, {
				__navaid: Object.assign({}, prev_state.__navaid, { idx: next_idx, type: nav_type }),
			})
			history[(opts.replace ? 'replace' : 'push') + 'State'](next_state, null, url.href)
			console.debug('[navaid:history]', opts.replace ? 'replaceState' : 'pushState', {
				idx: next_idx,
				href: url.href,
			})
			this.#route_idx = next_idx
		}

		const prev = this.#current
		this.#current = { uri: path, route: hit.route, params: hit.params }

		// Build a completion nav using the previous route as `from`
		nav = this.#make_nav({
			type: nav_type,
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
				data,
			},
			event: ev_param,
		})
		this.#opts.after_navigate?.(nav)
		console.debug('[navaid:navigate]', 'done', {
			from: nav.from?.url?.href,
			to: nav.to?.url?.href,
			type: nav.type,
			idx: this.#route_idx,
		})
		this.#apply_scroll(nav)
	}

	/**
	 * Shallow push — updates the URL/state but DOES NOT call handlers or loaders.
	 * URL changes, content stays put until a real nav.
	 */
	#commit_shallow(url, state, replace) {
		const href = new URL(url || location.href, location.href).href
		// save scroll for current index before shallow change
		this.#save_scroll()
		const idx = this.#route_idx + (replace ? 0 : 1)
		const st = Object.assign({}, state, {
			__navaid: Object.assign({}, state?.__navaid, { shallow: true, idx }),
		})
		history[(replace ? 'replace' : 'push') + 'State'](st, '', href)
		console.debug(
			'[navaid:history]',
			replace ? 'replaceState(shallow)' : 'pushState(shallow)',
			{ idx, href },
		)
		// Popstate handler checks state.__navaid.shallow and skips router processing
		this.#route_idx = idx
	}
	/** @param {string|URL} [url] @param {any} [state] */
	pushState(url, state) {
		this.#commit_shallow(url, state, false)
	}
	/** @param {string|URL} [url] @param {any} [state] */
	replaceState(url, state) {
		this.#commit_shallow(url, state, true)
	}

	/**
	 * Manually preload loaders for a URL (e.g. to prime cache).
	 * Dedupes concurrent preloads for the same path.
	 */
	/** @param {string} uri @returns {Promise<unknown|void>} */
	async preload(uri) {
		const info = this.#resolve_url_and_path(uri)
		if (!info) {
			console.debug('[navaid:preload]', 'invalid uri', { uri })
			return Promise.resolve()
		}
		const { path } = info
		// Do not preload if we're already at this path
		if (path === this.#current?.uri) {
			console.debug('[navaid:preload]', 'skip current path', { path })
			return Promise.resolve()
		}
		const hit = await this.match(path)
		if (!hit) {
			console.debug('[navaid:preload]', 'no route', { path })
			return Promise.resolve()
		}

		if (this.#preloads.has(path)) {
			const p = this.#preloads.get(path)
			console.debug('[navaid:preload]', 'dedupe', { path })
			return p.promise || Promise.resolve(p.data)
		}

		const entry = {}
		entry.promise = this.#run_loaders(hit.route, hit.params).then(data => {
			entry.data = data
			delete entry.promise
			console.debug('[navaid:preload]', 'done', { path })
			return data
		})
		this.#preloads.set(path, entry)
		return entry.promise
	}

	//
	// Core matching
	//
	/** @param {string} uri @returns {Promise<MatchResult|null>} */
	async match(uri) {
		console.debug('[navaid:match]', 'start', { uri })
		let arr, obj
		for (let i = 0; i < this.#routes.length; i++) {
			obj = this.#routes[i]
			if (!(arr = obj.pattern.exec(uri))) continue
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
			) {
				console.debug('[navaid:match]', 'skip: param_validators', {
					pattern: obj.data?.[0],
				})
				continue
			}
			if (hooks.validate && !(await hooks.validate(params))) {
				console.debug('[navaid:match]', 'skip: validate', { pattern: obj.data?.[0] })
				continue
			}

			console.debug('[navaid:match]', 'hit', { pattern: obj.data?.[0], params })
			return { route: obj.data || null, params }
		}
		console.debug('[navaid:match]', 'miss', { uri })
		return null
	}

	//
	// Lifecycle hooks
	//
	/** Attach history + click listeners and process current location. */
	listen() {
		history.scrollRestoration = 'manual'
		console.debug('[navaid:listen]', 'attach listeners; scrollRestoration=manual')

		addEventListener('popstate', this.#on_popstate)
		addEventListener('click', this.#click)
		addEventListener('beforeunload', this.#before_unload)
		addEventListener('hashchange', this.#on_hashchange)

		if (this.#opts.preload_on_hover) {
			addEventListener('mousemove', this.#mouse_move)
			addEventListener('touchstart', this.#tap, { passive: true })
			addEventListener('mousedown', this.#tap)
			console.debug('[navaid:listen]', 'hover preloading enabled', {
				delay: this.#opts.preload_delay,
			})
		}

		// ensure current history state carries our index
		const cur_idx = history.state?.__navaid?.idx
		if (cur_idx == null) {
			const prev = history.state && typeof history.state == 'object' ? history.state : {}
			const next_state = Object.assign({}, prev, {
				__navaid: Object.assign({}, prev.__navaid, { idx: this.#route_idx }),
			})
			history.replaceState(next_state, '', location.href)
			console.debug('[navaid:history]', 'init idx', { idx: this.#route_idx })
		} else {
			this.#route_idx = cur_idx
			console.debug('[navaid:history]', 'restore idx', { idx: this.#route_idx })
		}

		console.debug('[navaid:listen]', 'initial goto')
		return this.goto()
	}

	/** Remove listeners installed by listen(). */
	unlisten() {
		removeEventListener('popstate', this.#on_popstate)
		removeEventListener('click', this.#click)
		removeEventListener('mousemove', this.#mouse_move)
		removeEventListener('touchstart', this.#tap)
		removeEventListener('mousedown', this.#tap)
		removeEventListener('beforeunload', this.#before_unload)
		removeEventListener('hashchange', this.#on_hashchange)
		console.debug('[navaid:listen]', 'detached listeners')
	}

	//
	// Internals
	//
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

	//
	// Scroll
	//
	#save_scroll() {
		this.#scroll.set(this.#route_idx, { x: scrollX, y: scrollY })
		console.debug('[navaid:scroll]', 'save', { idx: this.#route_idx, x: scrollX, y: scrollY })
	}

	#apply_scroll(ctx) {
		const hash = location.hash
		const t = ctx?.type || ctx?.event?.type
		requestAnimationFrame(() => {
			// 0) Initial (first) navigation: prefer restoring session scroll
			const is_initial = ctx && 'from' in ctx ? ctx.from == null : !t
			if (is_initial) {
				try {
					const k = `__navaid_scroll:${location.href}`
					const { x, y } = JSON.parse(sessionStorage.getItem(k))
					sessionStorage.removeItem(k)
					scrollTo(x, y)
					console.debug('[navaid:scroll]', 'restore session', { x, y })
					return
				} catch {}
			}
			// 1) On back/forward, restore saved position if available
			if (t === 'popstate') {
				const idx = ctx?.event?.state?.__navaid?.idx
				const target_idx = typeof idx === 'number' ? idx : this.#route_idx - 1
				this.#route_idx = target_idx
				const pos = this.#scroll.get(target_idx)
				if (pos) {
					scrollTo(pos.x, pos.y)
					console.debug('[navaid:scroll]', 'restore popstate', {
						idx: target_idx,
						...pos,
					})
					return
				}
			}
			// 2) If there is a hash, prefer anchor scroll
			if (hash && this.#scroll_to_hash(hash)) {
				console.debug('[navaid:scroll]', 'hash')
				return
			}
			// 3) Default: scroll to top for new navigations
			scrollTo(0, 0)
			console.debug('[navaid:scroll]', 'top')
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
		console.debug('[navaid:scroll]', 'anchor', { id, found: !!el })
		return !!el
	}
}

/** @typedef {import('navaid').Options} Options */
/** @typedef {import('navaid').RouteTuple} RouteTuple */
/** @typedef {import('navaid').MatchResult} MatchResult */
/** @typedef {import('navaid').ValidatorHelpers} ValidatorHelpers */
