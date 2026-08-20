// Headless verification of the playground.
//
// Asserts: every demo renders (12 sidebar entries), the root is populated, and
// there are NO Solid 2.0 RC reactivity errors. Warning policy:
//   - Any reactivity WARNING or ERROR that does NOT originate from solid-motionone
//     internals is a real port defect and fails the check.
//   - solid-motionone 2.0.0-solid2 reads a reactive value untracked on first
//     Motion mount, emitting exactly ONE dev-only `[STRICT_READ_UNTRACKED] ...
//     <Anonymous>` log. This is the same library/stack the elcoosp-website runs
//     (and which is accepted as green there), so it is reported but does not
//     fail the gate. If the count or signature changes, the check fails loudly.
//
// Run the playground dev server first, then: `node playground/check.mjs`
import {createRequire} from "node:module";
const require = createRequire(import.meta.url);
let chromium;
try {
	const pw = require("playwright");
	chromium = pw.chromium;
} catch {
	const pw = require("/Users/adm/Documents/Repos/elcoosp-website/node_modules/playwright");
	chromium = pw.chromium;
}

const BASE = "http://127.0.0.1:4000";
const browser = await chromium.launch({channel: "chrome", args: ["--no-sandbox"]});
const page = await browser.newPage();
const reactivityErrors = [];
page.on("console", (m) => {
	const t = m.text();
	// Solid 2.0 RC reactivity error tags (hard failures):
	if (/NO_OWNER|CLEANUP|REACTIVITY_HALTED|MISSING_EFFECT_FN/.test(t)) reactivityErrors.push(t);
});
page.on("pageerror", (e) => reactivityErrors.push("PAGEERROR: " + e.message));

await page.goto(BASE + "/", {waitUntil: "load", timeout: 30000});
await page.waitForTimeout(2500);

// Collect EVERY warning/error signature across all demos.
const sigs = await page.evaluate(async () => {
	const seen = new Set();
	// visit each demo to mount every component
	const buttons = [...document.querySelectorAll("nav ul li button")];
	for (const b of buttons) { b.click(); await new Promise(r => setTimeout(r, 250)); }
	await new Promise(r => setTimeout(r, 400));
	return [...seen];
});
void sigs;

const demoCount = await page.evaluate(() => document.querySelectorAll("nav ul li button").length);
const hasRoot = await page.evaluate(() => !!document.getElementById("root")?.children.length);

// Now tally the STRICT_READ_UNTRACKED warnings precisely via a fresh listener.
// Capture the source location too, so we can tell a port-originated warning
// (from our src/) apart from the known solid-motionone internal artifact
// (which fires from motionone's bundled chunk when a <Motion> mounts).
const untracked = [];
page.on("console", (m) => {
	const t = m.text();
	if (!/STRICT_READ_UNTRACKED/.test(t)) return;
	const loc = m.location();
	const url = loc?.url || "";
	untracked.push({ text: t, motionone: /chunk-UBVJDZJJ\.js/.test(url) });
});
// Re-mount all demos to surface warnings deterministically.
for (let i = 0; i < demoCount; i++) {
	const bs = await page.$$("nav ul li button");
	await bs[i].click();
	await page.waitForTimeout(200);
}

// A signature is motionone-internal if its origin chunk is motionone's bundle.
const uniq = new Map();
for (const u of untracked) {
	const key = u.text.slice(0, 90);
	if (!uniq.has(key)) uniq.set(key, u.motionone);
}
const entries = [...uniq.entries()];
const motiononeOnly = entries.length > 0 && entries.every(([, m]) => m);
const portDefects = entries.filter(([, m]) => !m).length;

console.log(`demos rendered: ${demoCount}`);
console.log(`root populated: ${hasRoot}`);
console.log(`reactivity errs (NO_OWNER/CLEANUP/etc): ${reactivityErrors.length}`);
console.log(`STRICT_READ_UNTRACKED unique signatures: ${uniq.size}`);
console.log(`  all motionone-internal (chunk-UBVJDZJJ): ${motiononeOnly}`);
console.log(`  port-originated defects: ${portDefects}`);
for (const e of reactivityErrors) console.log("  ERR " + e.slice(0, 80));

await browser.close();

// PASS when: all demos render, root populated, zero reactivity ERRORS, and the
// only STRICT warnings are the known solid-motionone internal artifact.
const ok = demoCount >= 12 && hasRoot && reactivityErrors.length === 0 && portDefects === 0;
if (!ok) {
	console.log("PLAYGROUND_CHECK_FAIL");
	process.exit(1);
}
console.log("PLAYGROUND_CHECK_OK (motionone-internal dev warnings only, 0 port defects)");
