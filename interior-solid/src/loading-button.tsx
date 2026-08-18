import {createEffect, createSignal, onCleanup} from "solid-js"
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
	const [status, setStatus] = createSignal<AsyncActionStatus>("idle")

	let phase: AsyncActionStatus = "idle"
	let runId = 0
	let timer: ReturnType<typeof setTimeout> | null = null
	let alive = true

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

	createEffect(() => undefined, () => {
		return () => {
			alive = false
			clear()
		}
	})

	return {
		status,
		run,
		reset,
		pending: () => status() === "pending",
	}
}

function Spinner(props: {still: boolean}) {
	return (
		<Motion.svg
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			class="shrink-0"
			animate={props.still ? undefined : {rotate: 360}}
			transition={
				props.still
					? undefined
					: ({duration: 0.85, repeat: Infinity, ease: "linear"} as any)
			}
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
		</Motion.svg>
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

	return (
		<>
			<Motion.button
				type="button"
				disabled={props.disabled}
				aria-label={label()}
				aria-busy={pending() ? "true" : undefined}
				aria-disabled={pending() ? "true" : undefined}
				press={props.disabled || pending() || reduced() ? undefined : {y: 1}}
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
					{faces().map((face) => (
						<Motion.span
							initial={false}
							animate={() =>
								face.key === status()
									? {opacity: 1, y: 0, filter: "blur(0px)"}
									: {opacity: 0, y: 3, filter: "blur(3px)"}
							}
							transition={() => fade()}
							class={`col-start-1 row-start-1 flex items-center justify-center gap-1.5 whitespace-nowrap ${face.tone}`}
						>
							{face.icon}
							{face.text}
						</Motion.span>
					))}
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
