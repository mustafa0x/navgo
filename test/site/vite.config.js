import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

/** @type {import('vite').UserConfig}*/
export default {
	resolve: {
		alias: [
			// {find: '$lib', replacement: path.resolve('src/lib')},
		],
	},
	plugins: [tailwindcss(), svelte()],
}
