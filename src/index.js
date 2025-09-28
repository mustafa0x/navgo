import { parse } from 'regexparam'

export default function Navaid(routes_ = [], opts = {}) {
	let curr
	let $ = {}
	const routes = []
	const normalize = uri => '/' + (uri || '').replace(/^\/|\/$/g, '')

	const base = normalize(opts.base || '/')
	const rgx = base == '/' ? /^\/+/ : new RegExp('^\\' + base + '(?=\\/|$)\\/?', 'i')

	for (let r of routes_) {
		let pat = parse(r[0])
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

	$.run = function (uri) {
		let i = 0
		const params = {}
		let arr
		let obj
		if ((uri = $.format(uri || location.pathname))) {
			uri = uri.match(/[^\?#]*/)[0]
			for (curr = uri; i < routes.length; i++) {
				if ((arr = (obj = routes[i]).pattern.exec(uri))) {
					for (i = 0; i < obj.keys.length; ) {
						params[obj.keys[i]] = arr[++i] || null
					}
					opts.onRoute?.(uri, obj.data || null, params)
					return $
				}
			}
			opts.on404?.(uri)
		}
		return $
	}

	$.listen = function (u) {
		wrap('push')
		wrap('replace')

		function run() {
			$.run()
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

		addEventListener('popstate', run)
		addEventListener('replacestate', run)
		addEventListener('pushstate', run)
		addEventListener('click', click)

		$.unlisten = function () {
			removeEventListener('popstate', run)
			removeEventListener('replacestate', run)
			removeEventListener('pushstate', run)
			removeEventListener('click', click)
		}

		return $.run(u)
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
