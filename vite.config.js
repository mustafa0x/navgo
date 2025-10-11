export default {
	build: { lib: { entry: 'index.js', formats: ['es'] }, minify: true },
	plugins: [
		{
			name: 'console-debug-pure',
			enforce: 'pre',
			apply: 'build',
			config() {
				return {
					esbuild: {
						pure: ['console.debug'],
					},
				}
			},
			transform(code, id) {
				if (id.includes('node_modules') || !/\.(mjs|cjs|js|ts|tsx|jsx)$/.test(id))
					return null
				// Rewrite calls:  ℹ(...)  ->  console.debug(...)
				// Keep it simple; avoid matching after ., $ or word chars.
				const callRE = /(^|[^$\w.])ℹ\s*\(/gm
				const out = code
					.replace(/const ℹ = .*/, '')
					.replace(callRE, (_, p1) => `${p1}console.debug(`)
				return out === code ? null : { code: out, map: null }
			},
		},
	],
}
