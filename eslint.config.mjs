import pluginTs from "@typescript-eslint/eslint-plugin";
import parserTs from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
	{
		ignores: ["dist/**", "node_modules/**", "*.config.mjs", "version-bump.mjs"],
	},
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: parserTs,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: "module",
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
			globals: {
				// Electron / Obsidian environment
				window: "readonly",
				document: "readonly",
				activeDocument: "readonly",
				activeWindow: "readonly",
				console: "readonly",
				setTimeout: "readonly",
				clearTimeout: "readonly",
				setInterval: "readonly",
				clearInterval: "readonly",
				fetch: "readonly",
				navigator: "readonly",
				localStorage: "readonly",
				module: "readonly",
				require: "readonly",
				process: "readonly",
				Buffer: "readonly",
				__dirname: "readonly",
				__filename: "readonly",
				HTMLImageElement: "readonly",
				HTMLSelectElement: "readonly",
				HTMLInputElement: "readonly",
				HTMLTextAreaElement: "readonly",
				HTMLElement: "readonly",
				ClipboardEvent: "readonly",
				DataTransfer: "readonly",
				InputEvent: "readonly",
				TextEncoder: "readonly",
				Image: "readonly",
				requestAnimationFrame: "readonly",
				cancelAnimationFrame: "readonly",
			},
		},
		plugins: {
			"@typescript-eslint": pluginTs,
		},
		rules: {
			// TypeScript already enforces these via strict mode
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-non-null-assertion": "warn",
			// Enforce async/await over raw promises
			"@typescript-eslint/no-floating-promises": "off", // no project service in parserOptions
			// Allow brand/acronym casing in UI strings (mostly Chinese with mixed English brands)
			"obsidianmd/ui/sentence-case": [
				"error",
				{
					brands: ["WeChat", "GitHub", "Electron", "DevTools", "Mermaid", "Markdown", "Obsidian", "Dracula"],
					acronyms: ["KB", "MB", "GB", "URL", "HTML", "CSS", "JS", "TS", "PNG", "SVG", "ID"],
				},
			],
			// Style
			"no-console": "off",
			"no-debugger": "error",
			"prefer-const": "error",
			"no-var": "error",
			eqeqeq: ["error", "always", { null: "ignore" }],
		},
	},
];
