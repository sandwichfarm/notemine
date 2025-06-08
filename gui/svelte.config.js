import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// Use static adapter for SPA deployment
		adapter: adapter({
			fallback: 'index.html',
			strict: false
		}),
		serviceWorker: {
			register: false // We'll handle registration manually
		}
	}
};

export default config;
