import {defineConfig} from "vite";
import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

// The interior-solid source + the linked solid-motionone fork are edited live.
// Excluding them from dep pre-bundling makes Vite transform them on demand
// from their real files, so fork/source changes are always picked up
// (otherwise Vite caches a stale optimized copy in node_modules/.vite).
export default defineConfig({
	cacheDir: "node_modules/.vite-fresh",
	plugins: [solid(), tailwindcss()],
	resolve: {
		alias: {
			"interior-solid": new URL("../src/index.tsx", import.meta.url).pathname,
		},
	},
	optimizeDeps: {
		exclude: ["solid-motionone", "interior-solid", "@motionone/dom", "@motionone/utils"],
	},
});
