import {createSignal, For, onCleanup, createEffect} from "solid-js"
import {Motion} from "solid-motionone"
import {usePrefersReducedMotion} from "./use-prefers-reduced-motion.js"

const EASE = [0.23, 1, 0.32, 1] as const
const BLOOM = {duration: 0.5, ease: "linear"} as const
const BASE = 40

export type RippleSpec = {
	id: number
	x: number
	y: number
	scale: number
	released: boolean
}

export type UseRippleOptions = {
	disabled?: boolean
	max?: number
	minVisible?: number
	fade?: number
}

export function useRipple({
	disabled = false,
	max = 4,
	minVisible = 220,
	fade = 320,
}: UseRippleOptions = {}) {
	const [ripples, setRipples] = createSignal<RippleSpec[]>([])

	const list: RippleSpec[] = []
	let seq = 0
	const born = new Map<number, number>()
	const timers = new Map<number, ReturnType<typeof setTimeout>[]>()
	const pointers = new Map<number, number>()
	let keyed: number | null = null

	const commit = (next: RippleSpec[]) => {
		list.length = 0
		list.push(...next)
		setRipples(next)
	}

	const forget = (id: number) => {
		timers.get(id)?.forEach(clearTimeout)
		timers.delete(id)
		born.delete(id)
	}

	const spawn = (el: HTMLElement, clientX?: number, clientY?: number) => {
		const rect = el.getBoundingClientRect()
		const x = Math.round(clientX === undefined ? rect.width / 2 : clientX - rect.left)
		const y = Math.round(clientY === undefined ? rect.height / 2 : clientY - rect.top)
		const reach = Math.max(
			Math.hypot(x, y),
			Math.hypot(rect.width - x, y),
			Math.hypot(x, rect.height - y),
			Math.hypot(rect.width - x, rect.height - y),
		)

		let next = list.slice()
		while (next.length >= max) {
			forget(next[0].id)
			next = next.slice(1)
		}

		const id = (seq += 1)
		born.set(id, performance.now())
		commit([
			...next,
			{
				id,
				x,
				y,
				scale: Math.round((reach * 200) / BASE) / 100,
				released: false,
			},
		])
		return id
	}

	const release = (id: number) => {
		if (timers.has(id)) return
		if (!list.some(r => r.id === id)) return

		const wait = Math.max(0, minVisible - (performance.now() - (born.get(id) ?? 0)))

		const start = setTimeout(() => {
			commit(list.map(r => (r.id === id ? {...r, released: true} : r)))
		}, wait)

		const drop = setTimeout(() => {
			forget(id)
			commit(list.filter(r => r.id !== id))
		}, wait + fade)

		timers.set(id, [start, drop])
	}

	const releaseAll = () => {
		pointers.forEach(id => release(id))
		pointers.clear()
		if (keyed !== null) {
			release(keyed)
			keyed = null
		}
	}

	const endPointer = (pointerId: number) => {
		const id = pointers.get(pointerId)
		if (id === undefined) return
		pointers.delete(pointerId)
		release(id)
	}

	createEffect(() => undefined, () => {
		const bail = () => releaseAll()
		const onVisibility = () => document.hidden && releaseAll()
		window.addEventListener("blur", bail)
		document.addEventListener("visibilitychange", onVisibility)
		return () => {
			window.removeEventListener("blur", bail)
			document.removeEventListener("visibilitychange", onVisibility)
			timers.forEach(set => set.forEach(clearTimeout))
			timers.clear()
		}
	})

	const bind = {
		onPointerDown: (e: PointerEvent & {currentTarget: HTMLElement}) => {
			if (disabled) return
			if (e.pointerType === "mouse" && e.button !== 0) return
			if (pointers.has(e.pointerId)) return
			e.currentTarget.setPointerCapture?.(e.pointerId)
			pointers.set(e.pointerId, spawn(e.currentTarget, e.clientX, e.clientY))
		},
		onPointerUp: (e: PointerEvent) => endPointer(e.pointerId),
		onPointerCancel: (e: PointerEvent) => endPointer(e.pointerId),
		onLostPointerCapture: (e: PointerEvent) => endPointer(e.pointerId),
		onKeyDown: (e: KeyboardEvent & {currentTarget: HTMLElement}) => {
			if (disabled || e.repeat || keyed !== null) return
			if (e.key !== " " && e.key !== "Enter") return
			keyed = spawn(e.currentTarget)
		},
		onKeyUp: (e: KeyboardEvent) => {
			if (keyed === null) return
			if (e.key !== " " && e.key !== "Enter" && e.key !== "Escape") return
			release(keyed)
			keyed = null
		},
		onBlur: () => releaseAll(),
	}

	return {bind, ripples, fadeDuration: fade / 1000}
}

export type RippleProps = {
	children: any
	onPress?: () => void
	disabled?: boolean
	max?: number
	tintClassName?: string
	class?: string
}

export function Ripple(props: RippleProps) {
	const {bind, ripples, fadeDuration} = useRipple({disabled: props.disabled, max: props.max})
	const reduced = usePrefersReducedMotion()

	return (
		<button
			type="button"
			disabled={props.disabled}
			onClick={() => props.onPress?.()}
			style={"touch-action: manipulation; -webkit-tap-highlight-color: transparent"}
			class={`relative isolate inline-flex select-none items-center justify-center gap-2 rounded-[9px] border border-stone-200 bg-white px-3.5 py-2 text-[13px] font-medium text-stone-700 outline-none focus-visible:ring-2 focus-visible:ring-stone-400 disabled:opacity-50 dark:border-white/[0.16] dark:bg-[#1D1D1A] dark:text-stone-200 dark:focus-visible:ring-white/25 ${props.class ?? ""}`}
			{...bind}
		>
			<span
				aria-hidden="true"
				class="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
			>
				<For each={ripples()}>
					{r => (
						<Motion.span
							class={`absolute block rounded-full ${props.tintClassName ?? "bg-stone-800/15 dark:bg-white/20"}`}
							style={{
								left: `${r.x - BASE / 2}px`,
								top: `${r.y - BASE / 2}px`,
								width: `${BASE}px`,
								height: `${BASE}px`,
								"will-change": "transform, opacity",
							}}
							initial={{scale: reduced() ? r.scale : 0, opacity: 0}}
							animate={{scale: r.scale, opacity: r.released ? 0 : 1}}
							transition={{
								scale: reduced() ? {duration: 0} : BLOOM,
								opacity: {
									duration: r.released ? fadeDuration : 0.07,
									ease: r.released ? EASE : "linear",
								},
							} as any}
						/>
					)}
				</For>
			</span>

			<span class="relative">{props.children}</span>
		</button>
	)
}
