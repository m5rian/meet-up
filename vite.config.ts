import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			typescript: {
				config: (config) => {
					// sveltekit types `config` as `Record<string, any>`, so narrow the
					// include array to a typed value before mutating it.
					const include = config.include as string[];
					include.push('../drizzle.config.ts');
					include.push('../drizzle/migrate.ts');
					include.push('../eslint.config.js');
					include.push('../prettier.config.js');
				}
			}
		})
	]
});
