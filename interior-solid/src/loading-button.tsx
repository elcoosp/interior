import {createEffect, createMemo, createRoot, createSignal, getOwner, onCleanup} from "solid-js"
import {Motion} from "solid-motionone"
import {usePrefersReducedMotion} from "./use-prefers-reduced-motion.js"

const CELL = {type: "spring", stiffness: 520, damping: 34, mass: 0.45} as const
const CROSSFADE = {type: "spring", stiffness: 260, damping: 34, mass: 0.8} as const
const INSTANT = {duration: 0} as const

export type AsyncActionStatus = "idle" | "pending" | "success" | "error"

export type UseAsyncActionOptions = {
	action: () => unknown
	resetAfter?: number
	onError?: (error: unknown) => void
}

export function useAsyncAction({
	action,
	resetAfter = 1400,
	onError,
}: UseAsyncActionOptions) {
	// IMPORTANT (Solid 2.0 RC): a signal created during a component's render and
	// updated later from an event handler must belong to an OWNER that stays
	// alive. In this RC the component-render owner can be disposed by the time
	// the handler fires, which makes the setter a silent no-op. Wrapping the
	// hook in a persistent createRoot (disposed only on unmount) keeps the
	// signal's owner alive for the component's whole lifetime.
	let disposeRoot: (() => void) | undefined
	void getOwner()

	// `alive` lives in the hook's outer scope so onCleanup (outside the
	// createRoot closure) can flip it on unmount.
	let alive = true

	const api = createRoot((dispose) => {
		disposeRoot = dispose
		const [status, setStatus] = createSignal<AsyncActionStatus>("idle")

		let phase: AsyncActionStatus = "idle"
		let runId = 0
		let timer: ReturnType<typeof setTimeout> | null = null

		const act = action
		const fail = onError

		const clear = () => {
			if (timer) {
				clearTimeout(timer)
				timer = null
			}
		}

		const reset = () => {
			runId += 1
			clear()
			phase = "idle"
			setStatus("idle")
		}

		const run = () => {
			if (phase === "pending") return

			clear()
			const id = ++runId
			phase = "pending"
			setStatus("pending")

			const settle = (next: "success" | "error") => {
				if (!alive || id !== runId) return
				clear()
				phase = next
				setStatus(next)
				timer = setTimeout(() => {
					if (!alive || id !== runId) return
					phase = "idle"
					setStatus("idle")
				}, resetAfter)
			}

			Promise.resolve()
				.then(() => act())
				.then(
					() => settle("success"),
					(error: unknown) => {
						fail?.(error)
						settle("error")
					},
				)
		}

		return {
			status,
			run,
			reset,
			pending: () => status() === "pending",
		}
	})

	onCleanup(() => {
		alive = false
		disposeRoot?.()
	})

	return api
}

function Spinner(props: {still: boolean}) {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			class={`shrink-0${props.still ? "" : " animate-spin motion-reduce:animate-none"}`}
		>
			<circle
				cx="6"
				cy="6"
				r="4.5"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-opacity="0.22"
			/>
			<path
				d="M10.5 6A4.5 4.5 0 0 0 6 1.5"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
			/>
		</svg>
	)
}

function CheckMark() {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			class="shrink-0"
		>
			<path
				d="M2.6 6.3 4.9 8.6 9.4 3.6"
				stroke="currentColor"
				stroke-width="1.7"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	)
}

function AlertMark() {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			class="shrink-0"
		>
			<path d="M6 2.9v3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
			<path d="M6 9.05h.01" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
		</svg>
	)
}

export type LoadingButtonProps = {
	onAction: () => unknown
	children: string
	pendingLabel?: string
	successLabel?: string
	errorLabel?: string
	resetAfter?: number
	disabled?: boolean
	onError?: (error: unknown) => void
	class?: string
}

export function LoadingButton(props: LoadingButtonProps) {
	const reduced = usePrefersReducedMotion()

	const {status, run, pending} = useAsyncAction({
		action: props.onAction,
		resetAfter: props.resetAfter,
		onError: props.onError,
	})

	const fade = () => (reduced() ? INSTANT : CROSSFADE)

	// Snapshot the async status inside a memo (a tracked scope) so the
	// `status()` reads feeding Motion's animate accessors don't trip
	// STRICT_READ_UNTRACKED, and the crossfade updates reactively.
	const statusState = createMemo(() => status())

	const label = () =>
		status() === "pending"
			? (props.pendingLabel ?? props.children)
			: status() === "success"
			? (props.successLabel ?? "Done")
			: status() === "error"
			? (props.errorLabel ?? "Try again")
			: props.children

	const faces = () => [
		{key: "idle", text: props.children, tone: "text-stone-700 dark:text-stone-200", icon: null},
		{
			key: "pending",
			text: props.pendingLabel ?? props.children,
			tone: "text-stone-500 dark:text-stone-400",
			icon: <Spinner still={reduced() === true || status() !== "pending"} />,
		},
		{
			key: "success",
			text: props.successLabel ?? "Done",
			tone: "text-emerald-600 dark:text-emerald-400",
			icon: <CheckMark />,
		},
		{
			key: "error",
			text: props.errorLabel ?? "Try again",
			tone: "text-red-600 dark:text-red-400",
			icon: <AlertMark />,
		},
	]

	// Each face's inner <span> visibility is toggled via this effect (not a JSX
	// `class` attribute) so the `statusState()` read stays tracked and never
	// becomes a reactive getter that devComponent enumerates in untrack.
	const faceEls: Record<string, HTMLElement> = {}
	createEffect(
		() => ({s: statusState(), fs: faces()}),
		({s, fs}) => {
			for (const f of fs) {
				const el = faceEls[f.key]
				if (el) el.classList.toggle("opacity-0", s !== f.key)
			}
		},
	)

	return (
		<>
			<Motion.button
				type="button"
				disabled={props.disabled}
				aria-label={label}
				aria-busy={() => pending()}
				aria-disabled={() => pending()}
				transition={CELL as any}
				onClick={(event: MouseEvent) => {
					if (pending()) {
						event.preventDefault()
						return
					}
					run()
				}}
				class={`relative inline-flex min-h-9 select-none items-center justify-center rounded-[9px] border border-stone-200 bg-white px-3.5 text-[13px] font-medium text-stone-700 shadow-[inset_0_1.5px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(28,25,23,0.06),0_1px_2px_rgba(28,25,23,0.08)] outline-none transition-[border-color,background-color] duration-150 hover:bg-stone-50 focus-visible:border-[#4568FF] focus-visible:shadow-[0_1px_2px_rgba(28,25,23,0.08),0_10px_20px_-14px_rgba(69,104,255,0.6)] disabled:opacity-50 dark:border-white/[0.16] dark:bg-[#252522] dark:text-stone-200 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_1px_2px_rgba(0,0,0,0.4)] dark:hover:bg-[#2A2A27] dark:focus-visible:border-[#93B0FF] dark:focus-visible:shadow-[0_10px_20px_-14px_rgba(147,176,255,0.5)] ${props.class ?? ""}`}
				style={"border-radius: 9px; touch-action: manipulation"}
			>
				<span aria-hidden="true" class="relative grid place-items-center">
					{faces().map((face: any) => {
						const anim = createMemo(() => {
							const active = statusState() === face.key
							return active
								? {opacity: 1, y: 0, filter: "blur(0px)"}
								: {opacity: 0, y: 3, filter: "blur(3px)"}
						})
						// The fork drops `initial`, so inactive faces would mount at
						// opacity:1 and stack (the red error face flashes on first
						// render). Hide them via CSS so only the active face shows
						// before/without Motion applying its animate target.
						const active = () => statusState() === face.key
						return (
							<Motion.span
								initial={() => anim()}
								animate={() => anim()}
								transition={fade}
								class={`col-start-1 row-start-1 flex items-center justify-center gap-1.5 whitespace-nowrap ${face.tone}`}
							>
								<span ref={(el: HTMLElement) => { if (el) faceEls[face.key] = el }}>
									{face.icon}
									{face.text}
								</span>
							</Motion.span>
						)
					})}
				</span>
			</Motion.button>

			<span role="status" aria-live="polite" class="sr-only">
				{status() === "success"
					? (props.successLabel ?? "Done")
					: status() === "error"
					? (props.errorLabel ?? "Try again")
					: ""}
			</span>
		</>
	)
}
