import adapter from '@sveltejs/adapter-vercel';
import nodeAdapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: [vitePreprocess({})],

	kit: {
		// Pin the Vercel adapter explicitly. adapter-auto downloads the adapter
		// (and its @vercel/nft) at build time, which resolved a stale nft that
		// could not CJS-require the ESM-only estree-walker v3 and broke the build.
		// Pin the runtime too: the adapter's auto-detect rejects unsupported local
		// Node versions, and this keeps the Vercel function runtime deterministic.
		adapter:
			process.env.SWEEPR_ADAPTER === 'node' ? nodeAdapter() : adapter({ runtime: 'nodejs22.x' })
	}
};

export default config;
