import {createSignal, onCleanup, onSettled} from "solid-js"

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
	const [reduced, setReduced] = createSignal(false)

	onSettled(() => {
		if (typeof window === "undefined" || !window.matchMedia) return

		const query = window.matchMedia("(prefers-reduced-motion: reduce)")
		setReduced(query.matches)

		const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
		// Safari < 14 only supports addListener/removeListener
		if (query.addEventListener) query.addEventListener("change", onChange)
		else query.addListener(onChange)

		onCleanup(() => {
			if (query.removeEventListener) query.removeEventListener("change", onChange)
			else query.removeListener(onChange)
		})
	})

	return reduced
}
