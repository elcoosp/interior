import {createEffect, createRenderEffect, createSignal, onCleanup} from "solid-js"
import {Motion} from "solid-motionone"
import {usePrefersReducedMotion} from "./use-prefers-reduced-motion.js"

const EASE = [0.23, 1, 0.32, 1] as const
const CELL = {type: "spring", stiffness: 520, damping: 34, mass: 0.45} as const
const CROSSFADE = {type: "spring", stiffness: 260, damping: 34, mass: 0.8} as const
const DRAW = {duration: 0.26, ease: EASE} as const
const INSTANT = {duration: 0} as const

export type CopyStatus = "idle" | "copied" | "error"

export type UseCopyToClipboardOptions = {
	timeout?: number
	onCopy?: (value: string) => void
	onError?: (reason: unknown) => void
}

function writeFallback(text: string): boolean {
	const area = document.createElement("textarea")
	area.value = text
	area.setAttribute("readonly", "")
	area.style.position = "fixed"
	area.style.top = "0"
	area.style.left = "0"
	area.style.opacity = "0"
	document.body.appendChild(area)

	const selection = document.getSelection()
	const previous =
		selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

	area.select()
	let ok = false
	try {
		ok = document.execCommand("copy")
	} catch {
		ok = false
	}

	document.body.removeChild(area)
	if (selection && previous) {
		selection.removeAllRanges()
		selection.addRange(previous)
	}
	return ok
}

export function useCopyToClipboard({
	timeout = 2000,
	onCopy,
	onError,
}: UseCopyToClipboardOptions = {}) {
	const [status, setStatus] = createSignal<CopyStatus>("idle")
	const [ticket, setTicket] = createSignal(0)

	let mounted = true
	const copied = onCopy
	const failed = onError

	createEffect(() => undefined, () => {
		onCleanup(() => {
			mounted = false
		})
	})

	const reset = () => {
		setStatus("idle")
		setTicket(0)
	}

	const copy = async (text: string) => {
		if (!text) return false

		let ok = false
		let reason: unknown = null

		try {
			if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(text)
				ok = true
			} else {
				ok = writeFallback(text)
			}
		} catch (error) {
			reason = error
			try {
				ok = writeFallback(text)
			} catch {
				ok = false
			}
		}

		if (!mounted) return ok

		setStatus(ok ? "copied" : "error")
		setTicket((t) => t + 1)

		if (ok) copied?.(text)
		else failed?.(reason)

		return ok
	}

		createRenderEffect(
			() => {
				// track the dependencies so the effect re-runs on change
				ticket()
				status()
			},
			() => {
				const t = ticket()
				const s = status()
				if (t === 0 || s === "idle") return
				const id = setTimeout(() => setStatus("idle"), timeout)
				return () => clearTimeout(id)
			},
		)

	return {copy, reset, status, copied: () => status() === "copied"}
}

export type CopyButtonProps = {
	value: string
	label?: string
	copiedLabel?: string
	errorLabel?: string
	timeout?: number
	onCopy?: (value: string) => void
	onError?: (reason: unknown) => void
	disabled?: boolean
	class?: string
}

export function CopyButton(props: CopyButtonProps) {
	const {copy, status} = useCopyToClipboard({
		timeout: props.timeout,
		onCopy: props.onCopy,
		onError: props.onError,
	})
	const reduced = usePrefersReducedMotion()

	const fade = () => (reduced() ? INSTANT : CROSSFADE)
	const draw = () => (reduced() ? INSTANT : DRAW)

	const labels = () => [
		["idle", props.label ?? "Copy"],
		["copied", props.copiedLabel ?? "Copied"],
		["error", props.errorLabel ?? "Failed"],
	] as Array<[CopyStatus, string]>

	return (
		<Motion.button
			type="button"
			disabled={props.disabled}
			aria-label={props.label ?? "Copy"}
			onClick={() => {
				void copy(props.value)
			}}
			press={props.disabled || reduced() ? undefined : {y: 1}}
			transition={CELL as any}
			style={"border-radius: 9px; touch-action: manipulation"}
			class={`inline-flex h-9 select-none items-center gap-2 rounded-[9px] border border-stone-200 bg-white px-3 text-[13px] font-medium text-stone-700 shadow-[inset_0_1.5px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(28,25,23,0.06),0_1px_2px_rgba(28,25,23,0.08)] outline-none transition-[border-color,box-shadow,background-color] duration-150 hover:bg-stone-50 focus-visible:border-verdant-500 focus-visible:shadow-[0_1px_2px_rgba(28,25,23,0.08),0_10px_20px_-14px_rgba(36,196,122,0.6)] disabled:opacity-50 dark:border-white/[0.16] dark:bg-[#252522] dark:text-stone-200 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_1px_2px_rgba(0,0,0,0.4)] dark:hover:bg-[#2A2A27] dark:focus-visible:border-verdant-400 dark:focus-visible:shadow-[0_10px_20px_-14px_rgba(43,189,126,0.5)] ${props.class ?? ""}`}
		>
			<span class="grid size-[14px] shrink-0" aria-hidden="true">
				<Motion.svg
					viewBox="0 0 14 14"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="col-start-1 row-start-1 size-[14px]"
					initial={false}
					animate={{
						opacity: status() === "idle" ? 1 : 0,
						scale: status() === "idle" ? 1 : 0.92,
					}}
					transition={fade() as any}
				>
					<path d="M9.6 5.1V3.7A1.7 1.7 0 0 0 7.9 2H3.7A1.7 1.7 0 0 0 2 3.7v4.2a1.7 1.7 0 0 0 1.7 1.7h1.4" />
					<rect x="5.1" y="5.1" width="6.9" height="6.9" rx="1.7" />
				</Motion.svg>

				<Motion.svg
					viewBox="0 0 14 14"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="col-start-1 row-start-1 size-[14px]"
					initial={false}
					animate={{
						opacity: status() === "copied" ? 1 : 0,
						scale: status() === "copied" ? 1 : 0.92,
					}}
					transition={fade() as any}
				>
					<Motion.path
						d="M2.9 7.4 5.6 10.1 11.1 4"
						initial={false}
						animate={{pathLength: status() === "copied" ? 1 : 0} as any}
						transition={draw() as any}
					/>
				</Motion.svg>

				<Motion.svg
					viewBox="0 0 14 14"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="col-start-1 row-start-1 size-[14px]"
					initial={false}
					animate={{
						opacity: status() === "error" ? 1 : 0,
						scale: status() === "error" ? 1 : 0.92,
					}}
					transition={fade() as any}
				>
					<path d="M3.6 3.6 10.4 10.4" />
					<path d="M10.4 3.6 3.6 10.4" />
				</Motion.svg>
			</span>

			<span aria-hidden="true" class="relative grid">
				{labels().map(([key, text]) => (
					<Motion.span
						initial={false}
						animate={
							key === status()
								? {opacity: 1, y: 0, filter: "blur(0px)"}
								: {opacity: 0, y: 3, filter: "blur(3px)"}
						}
						transition={fade() as any}
						class="col-start-1 row-start-1 whitespace-nowrap"
					>
						{text}
					</Motion.span>
				))}
			</span>

			<span role="status" aria-live="polite" class="sr-only">
				{status() === "copied"
					? (props.copiedLabel ?? "Copied")
					: status() === "error"
						? (props.errorLabel ?? "Failed")
						: ""}
			</span>
		</Motion.button>
	)
}
