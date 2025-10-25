import {svelte} from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

/** @type {import('vite').UserConfig}*/
export default {
    build: {
        minify: false,
    },
    resolve: {
        alias: [
            // {find: '$lib', replacement: path.resolve('src/lib')},
        ],
    },
    plugins: [tailwindcss(), svelte()],
}
