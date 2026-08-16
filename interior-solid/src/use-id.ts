// Solid 2.0 removed `useId`. This is a lightweight client-side replacement:
// a module-level counter yielding unique ids per call (no SSR hydration here).
let counter = 0

export function useId(): string {
	return `i${(counter += 1)}`
}
