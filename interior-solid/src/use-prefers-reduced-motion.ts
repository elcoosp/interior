import {createSignal, onCleanup, createEffect} from "solid-js"

/**
 * SolidJS equivalent of Framer Motion's `useReducedMotion`.
 *
 * Returns `true` when the user has requested reduced motion via the
 * `(prefers-reduced-motion: reduce)` media query, reactively updating if the
 * preference changes. Every interior component gates its motion behind this so
 * the reduced-motion path still delivers the information but skips the trip
 * (using `{ duration: 0 }` instead of removing the animation entirely).
 */
export function usePrefersReducedMotion(): () => boolean {
	// Initial value is read lazily (no reactive write during render). In
	// non-DOM environments (node/jsdom tests) matchMedia is absent → false.
	const [reduced, setReduced] = createSignal(
		typeof window !== "undefined" && window.matchMedia
			? window.matchMedia("(prefers-reduced-motion: reduce)").matches
			: false,
	)

	// rc.0 createEffect takes (compute, effect); the effect runs after render
	// and is a valid scope for onCleanup. We only attach a listener here — the
	// only setReduced calls happen inside the event handler (unowned scope),
	// which avoids REACTIVE_WRITE_IN_OWNED_SCOPE.
	createEffect(
		() => undefined,
		() => {
			if (typeof window === "undefined" || !window.matchMedia) return

			const query = window.matchMedia("(prefers-reduced-motion: reduce)")
			const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
			// Safari < 14 only supports addListener/removeListener
			if (query.addEventListener) query.addEventListener("change", onChange)
			else query.addListener(onChange)

			onCleanup(() => {
				if (query.removeEventListener) query.removeEventListener("change", onChange)
				else query.removeListener(onChange)
			})
		},
	)

	return reduced
}
