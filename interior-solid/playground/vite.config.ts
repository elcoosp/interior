import {defineConfig} from "vite";
import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import {fileURLToPath} from "node:url";

// The playground imports the live port source (../src) so demos always
// track the components you are porting — not a stale built dist.
export default defineConfig({
	root: fileURLToPath(new URL(".", import.meta.url)),
	plugins: [solid({hot: false}), tailwindcss()],
	resolve: {
		alias: {
			"interior-solid": fileURLToPath(new URL("../src/index.tsx", import.meta.url)),
		},
	},
	server: {
		port: 4000,
		host: "127.0.0.1",
	},
});
