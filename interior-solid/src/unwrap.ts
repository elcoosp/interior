/**
 * Unwraps a value that may be either a plain value or an accessor (getter
 * function). Solid 2.0 passes reactive values as accessors; a plain value is
 * treated as a constant. Use this for any prop that may be reactive.
 */
export function unwrap<T>(v: T | (() => T)): T {
	return typeof v === "function" ? (v as () => T)() : v
}
