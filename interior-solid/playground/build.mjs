// Production build of the playground (no "dev server" implied by name).
// Run from the interior-solid package root: `node playground/build.mjs`
import {build} from "vite";

await build({
	root: new URL(".", import.meta.url).pathname,
	configFile: new URL("./vite.config.ts", import.meta.url).pathname,
	mode: "production",
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
	},
	build: {
		outDir: "dist-playground",
		emptyOutDir: true,
	},
});
console.log("PLAYGROUND_BUILD_OK");
