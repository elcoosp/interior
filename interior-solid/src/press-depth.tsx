import {createEffect, createSignal, onCleanup} from "solid-js"
import {Motion} from "solid-motionone"
import {usePrefersReducedMotion} from "./use-prefers-reduced-motion.js"

const PRESS = {type: "spring", stiffness: 520, damping: 34, mass: 0.45} as const

export type UsePressDepthOptions = {
	disabled?: boolean
	onPressStart?: () => void
	onPressEnd?: () => void
}

export type PressOrigin = {x: number; y: number}

export type UsePressDepthResult = {
	pressed: () => boolean
	origin: () => PressOrigin | null
	ref: (node: HTMLElement | null) => void
	bind: {
		onPointerDown: (event: PointerEvent) => void
		onKeyDown: (event: KeyboardEvent) => void
		onKeyUp: (event: KeyboardEvent) => void
		onBlur: () => void
	}
}

export function usePressDepth(options: UsePressDepthOptions = {}): UsePressDepthResult {
	const disabled = () => options.disabled ?? false
	const began = options.onPressStart
	const ended = options.onPressEnd

	const [pressed, setPressed] = createSignal(false)
	const [tracking, setTracking] = createSignal(false)
	const [origin, setOrigin] = createSignal<PressOrigin | null>(null)

	let nodeEl: HTMLElement | undefined
	let pointerId: number | null = null
	let down = false

	const setDown = (next: boolean) => {
		if (down === next) return
		down = next
		setPressed(next)
		if (next) began?.()
		else ended?.()
	}

	const stop = () => {
		pointerId = null
		setTracking(false)
		setOrigin(null)
		setDown(false)
	}

	createEffect(() => tracking(), () => {
		if (!tracking()) return

		const contains = (event: PointerEvent) => {
			const el = nodeEl
			if (!el) return false
			const r = el.getBoundingClientRect()
			return (
				event.clientX >= r.left &&
				event.clientX <= r.right &&
				event.clientY >= r.top &&
				event.clientY <= r.bottom
			)
		}

		const move = (event: PointerEvent) => {
			if (event.pointerId !== pointerId) return
			setDown(contains(event))
		}
		const lift = (event: PointerEvent) => {
			if (event.pointerId !== pointerId) return
			stop()
		}
		const bail = () => stop()
		const hidden = () => {
			if (document.hidden) stop()
		}

		window.addEventListener("pointermove", move)
		window.addEventListener("pointerup", lift)
		window.addEventListener("pointercancel", lift)
		window.addEventListener("blur", bail)
		document.addEventListener("visibilitychange", hidden)

		return (() => {
			window.removeEventListener("pointermove", move)
			window.removeEventListener("pointerup", lift)
			window.removeEventListener("pointercancel", lift)
			window.removeEventListener("blur", bail)
			document.removeEventListener("visibilitychange", hidden)
		})
	})

	createEffect(() => disabled(), () => {
		if (disabled()) stop()
	})

	const ref = (next: HTMLElement | null) => {
		nodeEl = next ?? undefined
	}

	const bind = {
		onPointerDown: (event: PointerEvent) => {
			if (disabled()) return
			if (event.pointerType === "mouse" && event.button !== 0) return
			const r = (event.currentTarget as HTMLElement).getBoundingClientRect()
			setOrigin({
				x: Math.max(-1, Math.min(1, ((event.clientX - r.left) / r.width) * 2 - 1)),
				y: Math.max(-1, Math.min(1, ((event.clientY - r.top) / r.height) * 2 - 1)),
			})
			pointerId = event.pointerId
			setTracking(true)
			setDown(true)
		},
		onKeyDown: (event: KeyboardEvent) => {
			if (disabled() || event.repeat) return
			if (event.key === " " || event.key === "Enter") setDown(true)
		},
		onKeyUp: (event: KeyboardEvent) => {
			if (event.key === " " || event.key === "Enter" || event.key === "Escape") {
				setDown(false)
			}
		},
		onBlur: () => stop(),
	}

	return {pressed, origin, ref, bind}
}

export type PressDepthProps = {
	children: any
	depth?: number
	tilt?: number
	disabled?: boolean
	type?: "button" | "submit" | "reset"
	onClick?: (event: MouseEvent) => void
	class?: string
	"aria-label"?: string
}

export function PressDepth(props: PressDepthProps) {
	const depth = () => props.depth ?? 4
	const tilt = () => props.tilt ?? 7
	const reduced = usePrefersReducedMotion()
	const {pressed, origin, ref, bind} = usePressDepth({disabled: props.disabled})

	const lean = () => (pressed() && origin() && !reduced() ? origin() : null)

	return (
		<button
			ref={ref}
			type={props.type ?? "button"}
			disabled={props.disabled}
			aria-label={props["aria-label"]}
			data-pressed={pressed() ? "" : undefined}
			onClick={props.onClick}
			style={`padding-bottom: ${depth()}; touch-action: manipulation; -webkit-tap-highlight-color: transparent`}
			class={`group relative inline-flex select-none rounded-[9px] align-middle outline-none disabled:opacity-50 ${props.class ?? ""}`}
			{...bind}
		>
			<span
				aria-hidden="true"
				style={{top: `${depth()}px`}}
				class="absolute inset-x-0 bottom-0 rounded-[9px] bg-stone-300 dark:bg-white/25"
			/>
			<Motion.span
				initial={false}
				animate={{
					y: pressed() ? depth() : 0,
					rotateX: lean() ? -lean()!.y * tilt() : 0,
					rotateY: lean() ? lean()!.x * tilt() : 0,
				}}
				transition={(reduced() ? {duration: 0} : PRESS) as any}
				style={"transform-perspective: 340px"}
				class={`relative inline-flex h-9 items-center justify-center gap-2 rounded-[9px] border border-stone-200 bg-white px-3.5 text-[13px] font-medium text-stone-700 group-focus-visible:ring-2 group-focus-visible:ring-stone-400 dark:border-white/[0.16] dark:bg-[#1D1D1A] dark:text-stone-200 dark:group-focus-visible:ring-stone-500 ${props.class ?? ""}`}
			>
				<Motion.span
					aria-hidden="true"
					initial={false}
					animate={{opacity: pressed() ? 0 : 1}}
					transition={(reduced() ? {duration: 0} : PRESS) as any}
					class="pointer-events-none absolute inset-0 rounded-[9px] shadow-[inset_0_1.5px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(28,25,23,0.06)] dark:shadow-[inset_0_1.5px_0_rgba(255,255,255,0.09)]"
				/>
				{props.children}
			</Motion.span>
		</button>
	)
}
