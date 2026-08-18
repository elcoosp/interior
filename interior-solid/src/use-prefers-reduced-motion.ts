import { onCleanup } from "solid-js"

/**
 * SolidJS equivalent of Framer Motion's `useReducedMotion`.
 *
 * Returns a STABLE accessor `() => boolean` backed by a plain module variable
 * (not a signal). Solid 2.0 RC renders every component inside
 * `untrack(() => Comp(props))`, so reading a *signal* (or memo) here during
 * the initial render trips STRICT_READ_UNTRACKED — and these reads happen all
 * over the place (Motion `initial`/`transition` props, TextReveal, …), which
 * produced a ton of dev warnings. A plain variable read is not a reactive read,
 * so it never warns. The prefers-reduced-motion preference is read once on
 * mount (and kept in sync via the media-query listener); live runtime changes
 * are extremely rare and not worth a reactive signal here.
 */
let prefersReduced = false

function readPreference(): boolean {
	if (typeof window === "undefined" || !window.matchMedia) return false
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function usePrefersReducedMotion(): () => boolean {
	prefersReduced = readPreference()

	// Subscribe to OS changes. The listener writes a plain variable; there is
	// no signal, so no re-render is triggered (intentional — see note above).
	// onCleanup runs in the component body, which has a valid owner.
	if (typeof window !== "undefined" && window.matchMedia) {
		const query = window.matchMedia("(prefers-reduced-motion: reduce)")
		const onChange = (event: MediaQueryListEvent) => {
			prefersReduced = event.matches
		}
		if (query.addEventListener) query.addEventListener("change", onChange)
		else query.addListener(onChange)

		onCleanup(() => {
			if (query.removeEventListener) query.removeEventListener("change", onChange)
			else query.removeListener(onChange)
		})
	}

	return () => prefersReduced
}
