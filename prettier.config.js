/** @type {import("prettier").Config} */
const config = {
	useTabs: true,
	singleQuote: true,
	trailingComma: 'none',
	printWidth: 100,
	plugins: ['prettier-plugin-svelte', 'prettier-plugin-tailwindcss'],
	overrides: [{ files: '*.svelte', options: { parser: 'svelte' } }],
	svelteSortOrder: 'options-scripts-markup-styles',
	tailwindPreserveWhitespace: true,
	tailwindStylesheet: './src/routes/layout.css'
};

export default config;
