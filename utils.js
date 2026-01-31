import * as v from 'valibot'

export function normalize_path(value) {
	return '/' + (value || '').replace(/^\/|\/$/g, '')
}

export function scroll_to_hash(hash) {
	let id = hash.slice(1)
	if (!id) return false
	try {
		id = decodeURIComponent(id)
	} catch {}
	const el = document.getElementById(id) || document.querySelector(`[name="${CSS.escape(id)}"]`)
	el?.scrollIntoView()
	return !!el
}

export function try_parse_json(value) {
	if (typeof value !== 'string') return undefined
	try {
		return JSON.parse(value)
	} catch {
		return undefined
	}
}

export function normalize_array_style(value) {
	if (typeof value === 'string') return { default: value }
	if (value && typeof value === 'object' && !Array.isArray(value))
		return { default: value.default || 'repeat', ...value }
	return { default: 'repeat' }
}

export function merge_search_opts(base = {}, next = {}) {
	const out = { ...base, ...next }
	const a = normalize_array_style(base.array_style)
	const b = next.array_style
	out.array_style =
		b === undefined
			? a
			: typeof b === 'string'
				? { default: b }
				: { ...a, ...b, default: b.default || a.default }
	return out
}

export function coerce_search_value(value, def, style, schema) {
	if (value == null) return undefined
	const last = Array.isArray(value) ? value.at(-1) : value

	if (Array.isArray(def) || schema?.type === 'array' || schema?.wrapped?.type === 'array') {
		const arr = Array.isArray(value) ? value : [value]
		if (style !== 'json') {
			const item = (schema?.type === 'array' ? schema : schema?.wrapped)?.item
			const t = (item?.wrapped || item)?.type
			const def = t === 'number' ? 0 : t === 'boolean' ? false : t === 'object' ? {} : null
			return def == null ? arr : arr.map(v => coerce_search_value(v, def, style))
		}
		const parsed = try_parse_json(last)
		return Array.isArray(parsed) ? parsed : arr
	}

	if (typeof def === 'number' && typeof last === 'string') {
		const s = last.trim()
		if (!s) return undefined
		const n = Number(s)
		return Number.isNaN(n) ? undefined : n
	}

	if (typeof def === 'boolean' && typeof last === 'string') {
		if (last === 'true') return true
		if (last === 'false') return false
		return undefined
	}

	if (def && typeof def === 'object' && typeof last === 'string') {
		const parsed = try_parse_json(last)
		return parsed && typeof parsed === 'object' ? parsed : last
	}

	return last
}

export function read_search(url, schema, opts) {
	const sp = url?.searchParams
	if (!sp || !schema?.entries) return {}
	const out = {}
	const as = opts?.array_style
	for (const k in schema.entries) {
		const all = sp.getAll(k)
		if (!all.length) continue
		const style = as?.[k] || as?.default || 'repeat'
		if (style === 'json') out[k] = all.at(-1)
		else if (style === 'csv') out[k] = all.flatMap(v => (v ? v.split(',').filter(Boolean) : []))
		else out[k] = all.length > 1 ? all : all[0]
	}
	return out
}

export function validate_search(raw, schema, defaults = {}, opts) {
	if (!schema?.entries) return {}
	const input = {}
	const as = opts?.array_style
	for (const k in schema.entries) {
		if (!raw || !(k in raw)) continue
		const style = as?.[k] || as?.default || 'repeat'
		input[k] = coerce_search_value(raw[k], defaults?.[k], style, schema.entries[k])
	}
	const whole = v.safeParse(schema, input)
	if (whole.success) return whole.output

	const out = { ...defaults }
	for (const k in input) {
		const res = v.safeParse(schema.entries[k], input[k])
		if (res.success) out[k] = res.output
	}
	return out
}

function safe_json(value) {
	try {
		return JSON.stringify(value)
	} catch {
		return null
	}
}

export function build_search_url(cur, values, keys, defaults, opts, same_value) {
	let sp = new URLSearchParams(cur.search)
	const as = opts?.array_style
	for (const k of keys) {
		sp.delete(k)
		const val = values?.[k]
		if (val == null) continue
		if (!opts?.show_defaults && same_value?.(val, defaults?.[k])) continue

		if (Array.isArray(val)) {
			if (!val.length) continue
			const style = as?.[k] || as?.default || 'repeat'
			if (style === 'csv') {
				sp.set(k, val.map(String).join(','))
				continue
			}
			if (style === 'json') {
				sp.set(k, safe_json(val) ?? String(val))
				continue
			}
			for (const x of val) if (x != null) sp.append(k, String(x))
			continue
		}

		if (val && typeof val === 'object') {
			sp.set(k, safe_json(val) ?? String(val))
			continue
		}

		sp.set(k, String(val))
	}
	if (opts?.sort) {
		sp = new URLSearchParams([...sp.entries()].sort(([a], [b]) => a.localeCompare(b)))
	}
	const next = new URL(cur.href)
	const s = sp.toString()
	next.search = s ? `?${s}` : ''
	return next.href === cur.href ? null : next
}
