import { parse } from 'regexparam'

export default function Navaid(routes_ = [], opts = {}) {
	let curr
	let $ = {}
	const routes = []
	const normalize = uri => '/' + (uri || '').replace(/^\/|\/$/g, '')

	const base = normalize(opts.base || '/')
	const rgx = base == '/' ? /^\/+/ : new RegExp('^\\' + base + '(?=\\/|$)\\/?', 'i')

	// Pre-compile provided routes: route tuple is [patternOrRegex, data]
	for (let r of routes_) {
		const patOrRx = r[0]
		let pat
		if (patOrRx instanceof RegExp) {
			pat = { pattern: patOrRx, keys: null } // regex route (keys handled via groups or positions)
		} else {
			pat = parse(patOrRx) // string pattern via regexparam
		}
		pat.data = r // keep the original tuple for onRoute
		routes.push(pat)
	}

	$.format = function (uri) {
		if (!uri) return uri
		uri = normalize(uri)
		return rgx.test(uri) && uri.replace(rgx, '/')
	}

	$.route = function (uri, replace) {
		if (uri[0] == '/' && !rgx.test(uri)) uri = base + uri
		history[(uri === curr || replace ? 'replace' : 'push') + 'State'](uri, null, uri)
	}

	$.match = function (uri) {
		let arr, obj
		for (let i = 0; i < routes.length; i++) {
			if ((arr = (obj = routes[i]).pattern.exec(uri))) {
				const params = {}
				// string patterns -> named keys from regexparam
				if (obj.keys?.length) {
					for (let j = 0; j < obj.keys.length; ) {
						params[obj.keys[j]] = arr[++j] || null
					}
				} else if (arr.groups) {
					// RegExp with named groups
					for (const k in arr.groups) params[k] = arr.groups[k]
				}
				return { route: obj.data || null, params }
			}
		}
		return null
	}

	function run() {
		const uri = $.format(location.pathname)
		if (!url) return

		uri = uri.match(/[^\?#]*/)[0]
		curr = uri
		const hit = match(uri)
		if (hit) {
			opts.onRoute?.(uri, hit.route, hit.params)
			return
		}
		opts.on404?.(uri)
	}

	$.listen = function () {
		wrap('push')
		wrap('replace')

		function run_wrapped() {
			run()
		}

		function click(e) {
			const el = e.target.closest('a')
			const href = el?.getAttribute('href')
			if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.button || e.defaultPrevented)
				return
			if (!href || el.target || el.download || el.host !== location.host || href[0] == '#')
				return
			if (href[0] != '/' || rgx.test(href)) {
				e.preventDefault()
				$.route(href)
			}
		}

		addEventListener('popstate', run_wrapped)
		addEventListener('replacestate', run_wrapped)
		addEventListener('pushstate', run_wrapped)
		addEventListener('click', click)

		$.unlisten = function () {
			removeEventListener('popstate', run_wrapped)
			removeEventListener('replacestate', run_wrapped)
			removeEventListener('pushstate', run_wrapped)
			removeEventListener('click', click)
		}

		run()
	}

	return $
}

function wrap(type, fn) {
	if (history[type]) return
	history[type] = type
	fn = history[(type += 'State')]
	history[type] = function (uri) {
		let ev = new Event(type.toLowerCase())
		ev.uri = uri
		fn.apply(this, arguments)
		return dispatchEvent(ev)
	}
}
