import {svelte} from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import {defineConfig} from 'vite'

export default defineConfig({
    resolve: {
        alias: [
            // {find: '$lib', replacement: path.resolve('src/lib')},
        ],
    },
    plugins: [tailwindcss(), svelte()],
})
