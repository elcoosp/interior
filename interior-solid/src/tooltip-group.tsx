import {
	createContext,
	createEffect,
	createSignal,
	onCleanup,
	onSettled,
	Show,
	useContext,
} from "solid-js"
import {Dynamic} from "@solidjs/web"
import {Motion} from "solid-motionone"
import {useId} from "./use-id.js"
import {usePrefersReducedMotion} from "./use-prefers-reduced-motion.js"

const RISE = {type: "spring", stiffness: 560, damping: 34, mass: 0.6} as const

const WARM = {type: "spring", stiffness: 900, damping: 48, mass: 0.5} as const

const SWAP = {type: "spring", stiffness: 700, damping: 44, mass: 0.5} as const

let groups = 0

type Timer = ReturnType<typeof setTimeout> | null

const stop = (t: Timer): Timer => {
	if (t !== null) clearTimeout(t)
	return null
}

export type TooltipTiming = {
	openDelay: number
	closeDelay: number
	skipDelay: number
}

export type TooltipStore = {
	seat: string
	subscribe: (fn: () => void) => () => void
	getActive: () => string | null
	getWarm: () => boolean
	getSkipped: () => boolean
	getTravel: () => number
	open: (id: string, immediate: boolean, x?: number) => void
	close: (id: string, immediate: boolean) => void
	dismiss: (id: string) => void
	unblock: (id: string) => void
	reset: () => void
	dispose: () => void
}

export function createTooltipStore(getTiming: () => TooltipTiming): TooltipStore {
	const listeners = new Set<() => void>()

	let active: string | null = null
	let pending: string | null = null
	let blocked: string | null = null
	let warm = false
	let skipped = false
	let lastX: number | null = null
	let travel = 0

	let openTimer: Timer = null
	let closeTimer: Timer = null
	let coolTimer: Timer = null

	const notify = () => {
		for (const fn of listeners) fn()
	}

	const setActive = (next: string | null) => {
		if (active === next) return
		if (next !== null) {
			skipped = warm
			warm = true
		}
		active = next
		notify()
	}

	const cool = () => {
		coolTimer = stop(coolTimer)
		const {skipDelay} = getTiming()
		if (skipDelay <= 0) {
			if (warm) {
				warm = false
				notify()
			}
			return
		}
		coolTimer = setTimeout(() => {
			coolTimer = null
			warm = false
			notify()
		}, skipDelay)
	}

	groups += 1
	const seat = `tooltip-seat-${groups}`

	return {
		seat,
		subscribe(fn) {
			listeners.add(fn)
			return () => {
				listeners.delete(fn)
			}
		},
		getActive: () => active,
		getWarm: () => warm,
		getSkipped: () => skipped,
		getTravel: () => travel,
		open(id, immediate, x) {
			if (blocked === id) return
			closeTimer = stop(closeTimer)
			coolTimer = stop(coolTimer)
			if (active === id) {
				openTimer = stop(openTimer)
				pending = null
				return
			}
			const arrive = () => {
				travel = lastX !== null && x !== undefined ? Math.sign(x - lastX) : 0
				lastX = x ?? null
				setActive(id)
			}
			if (immediate || warm) {
				openTimer = stop(openTimer)
				pending = null
				arrive()
				return
			}
			openTimer = stop(openTimer)
			pending = id
			openTimer = setTimeout(() => {
				openTimer = null
				pending = null
				arrive()
			}, getTiming().openDelay)
		},
		close(id, immediate) {
			if (pending === id) {
				openTimer = stop(openTimer)
				pending = null
			}
			if (active !== id) return
			closeTimer = stop(closeTimer)
			const finish = () => {
				closeTimer = null
				setActive(null)
				cool()
			}
			if (immediate || getTiming().closeDelay <= 0) {
				finish()
				return
			}
			closeTimer = setTimeout(finish, getTiming().closeDelay)
		},
		dismiss(id) {
			blocked = id
			openTimer = stop(openTimer)
			closeTimer = stop(closeTimer)
			coolTimer = stop(coolTimer)
			pending = null
			const wasWarm = warm
			warm = false
			if (active === id) setActive(null)
			else if (wasWarm) notify()
		},
		unblock(id) {
			if (blocked === id) blocked = null
		},
		reset() {
			openTimer = stop(openTimer)
			closeTimer = stop(closeTimer)
			coolTimer = stop(coolTimer)
			pending = null
			blocked = null
			lastX = null
			travel = 0
			const wasWarm = warm
			warm = false
			if (active !== null) setActive(null)
			else if (wasWarm) notify()
		},
		dispose() {
			openTimer = stop(openTimer)
			closeTimer = stop(closeTimer)
			coolTimer = stop(coolTimer)
			listeners.clear()
		},
	}
}

const TooltipGroupContext = createContext<TooltipStore | null>(null)

function useDismissOnBlur(store: TooltipStore, enabled: boolean) {
	createEffect(() => enabled, () => {
		if (!enabled) return
		const bail = () => store.reset()
		const onVisibility = () => {
			if (document.hidden) store.reset()
		}
		window.addEventListener("blur", bail)
		document.addEventListener("visibilitychange", onVisibility)
		onCleanup(() => {
			window.removeEventListener("blur", bail)
			document.removeEventListener("visibilitychange", onVisibility)
		})
	})
}

export type TooltipGroupProps = {
	children?: any
	openDelay?: number
	closeDelay?: number
	skipDelay?: number
	onWarmChange?: (warm: boolean) => void
	class?: string
}

export function TooltipGroup(props: TooltipGroupProps) {
	const timing = (): TooltipTiming => ({
		openDelay: props.openDelay ?? 200,
		closeDelay: props.closeDelay ?? 120,
		skipDelay: props.skipDelay ?? 400,
	})

	const store = createTooltipStore(timing)

	const [warm, setWarm] = createSignal(false)

	createEffect(
		() => true,
		() => {
			const unsubscribe = store.subscribe(() => { onSettled(() => { setWarm(store.getWarm()); }); })
			onSettled(() => { setWarm(store.getWarm()); })
			onCleanup(() => unsubscribe())
		},
	)

	let ttWarm = false
	createEffect(() => { ttWarm = warm() }, () => {
		props.onWarmChange?.(ttWarm)
	})

	onCleanup(() => store.dispose())
	useDismissOnBlur(store, true)

	return (
		<TooltipGroupContext value={store}>
			<Show when={props.class} fallback={props.children}>
				<div class={props.class}>{props.children}</div>
			</Show>
		</TooltipGroupContext>
	)
}

export type UseTooltipOptions = {
	disabled?: () => boolean
	openDelay?: () => number
	closeDelay?: () => number
	skipDelay?: () => number
}

export type TooltipTriggerProps = {
	onPointerEnter: (event: PointerEvent) => void
	onPointerLeave: (event: PointerEvent) => void
	onPointerDown: (event: PointerEvent) => void
	onPointerCancel: (event: PointerEvent) => void
	onFocus: (event: FocusEvent) => void
	onBlur: (event: FocusEvent) => void
	onKeyDown: (event: KeyboardEvent) => void
}

export type UseTooltipReturn = {
	open: () => boolean
	warm: () => boolean
	skipped: () => boolean
	travel: () => number
	tooltipId: string
	seat: string
	triggerProps: TooltipTriggerProps
}

function isKeyboardFocus(el: HTMLElement) {
	try {
		return el.matches(":focus-visible")
	} catch {
		return true
	}
}

export function useTooltip(options: UseTooltipOptions = {}): UseTooltipReturn {
	const disabled = () => options.disabled?.() ?? false
	const timing = (): TooltipTiming => ({
		openDelay: options.openDelay?.() ?? 200,
		closeDelay: options.closeDelay?.() ?? 120,
		skipDelay: options.skipDelay?.() ?? 400,
	})

	const tooltipId = `tt-${useId()}`
	// In Solid 2.0 RC, useContext throws when there is no matching provider
	// (older versions returned the context default). Standalone <Tooltip>
	// usages (no <TooltipGroup> wrapper) must fall back to a solo store, so
	// guard the lookup against the throw.
	let group: TooltipStore | null = null
	try {
		group = useContext(TooltipGroupContext)
	} catch {
		group = null
	}

	const solo = group === null ? createTooltipStore(timing) : null
	const store = group ?? (solo as TooltipStore)

	const [open, setOpen] = createSignal(false)
	const [warm, setWarm] = createSignal(false)
	const [skipped, setSkipped] = createSignal(false)
	const [travel, setTravel] = createSignal(0)

		const sync = () => {
			setOpen(store.getActive() === tooltipId)
			setWarm(store.getWarm())
			setSkipped(store.getSkipped())
			setTravel(store.getTravel())
		}

				let unsubscribe: (() => void) | undefined
				createEffect(
					() => tooltipId,
					() => {
						unsubscribe = store.subscribe(() => onSettled(sync))
						onSettled(sync)
						onCleanup(() => {
							unsubscribe?.()
							store.close(tooltipId, true)
							solo?.dispose()
						})
					},
				)

	useDismissOnBlur(store, group === null)

	let ttDisabled = false
	createEffect(() => { ttDisabled = disabled() }, () => {
		if (!ttDisabled) return
		store.close(tooltipId, true)
	})

	const triggerProps: TooltipTriggerProps = {
		onPointerEnter: event => {
			if (!disabled()) store.open(tooltipId, false, event.clientX)
		},
		onPointerLeave: () => {
			store.unblock(tooltipId)
			store.close(tooltipId, false)
		},
		onPointerDown: () => store.dismiss(tooltipId),
		onPointerCancel: () => {
			store.unblock(tooltipId)
			store.close(tooltipId, true)
		},
		onFocus: event => {
			if (disabled()) return
			const el = event.currentTarget
			if (!(el instanceof HTMLElement) || !isKeyboardFocus(el)) return
			store.open(tooltipId, true)
		},
		onBlur: () => {
			store.unblock(tooltipId)
			store.close(tooltipId, true)
		},
		onKeyDown: event => {
			if (event.key === "Escape") store.dismiss(tooltipId)
		},
	}

	return {open, warm, skipped, travel, tooltipId, seat: store.seat, triggerProps}
}

export type TooltipProps = {
	label: any
	children: any
	side?: "top" | "bottom"
	disabled?: boolean
	openDelay?: number
	closeDelay?: number
	skipDelay?: number
	describedBy?: string
	class?: string
	contentClass?: string
	surfaceClassName?: string
}

export function Tooltip(props: TooltipProps) {
	const side = () => props.side ?? "top"

	const {open, skipped, travel, tooltipId, triggerProps} = useTooltip({
		disabled: () => props.disabled ?? false,
		openDelay: () => props.openDelay ?? 200,
		closeDelay: () => props.closeDelay ?? 120,
		skipDelay: () => props.skipDelay ?? 400,
	})
	const reduced = usePrefersReducedMotion()

	const described = () => {
		const parts = [props.describedBy, open() ? tooltipId : null].filter(Boolean)
		return parts.length > 0 ? parts.join(" ") : undefined
	}

	const lift = () => (side() === "top" ? 7 : -7)

	return (
		<span class={`relative inline-flex ${props.class ?? ""}`}>
			<Dynamic
				component={props.children}
				aria-describedby={described()}
				{...triggerProps}
			/>

			<span
				aria-hidden={open() ? "false" : "true"}
				class="pointer-events-none absolute left-1/2 z-50 flex w-0 justify-center"
				style={
					side() === "top"
						? {bottom: "calc(100% + 7px)"}
						: {top: "calc(100% + 7px)"}
				}
			>
				<Show when={open()}>
					<Motion.span
						role="tooltip"
						id={tooltipId}
						initial={
							reduced()
								? false
								: skipped()
									? {opacity: 0, scale: 1, y: 0, filter: "blur(0px)"}
									: {opacity: 0, scale: 0.9, y: lift(), filter: "blur(4px)"}
						}
						animate={{opacity: 1, scale: 1, y: 0, filter: "blur(0px)"}}
						transition={(reduced() ? {duration: 0} : skipped() ? WARM : RISE) as any}
						style={{
							"transform-origin": side() === "top" ? "50% 100%" : "50% 0%",
						}}
						class={`relative w-max max-w-[220px] shrink-0 overflow-hidden rounded-[8px] px-2 py-1 text-[11.5px] font-medium leading-snug text-stone-700 dark:text-stone-100 ${props.contentClass ?? ""}`}
					>
						<span
							aria-hidden="true"
							class={`absolute inset-0 rounded-[8px] border border-stone-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.06),0_6px_16px_-12px_rgba(28,25,23,0.35)] dark:border-white/[0.16] dark:bg-[#1D1D1A] dark:shadow-[0_2px_8px_rgba(0,0,0,0.45)] ${props.surfaceClassName ?? ""}`}
						/>
						<Motion.span
							initial={
								reduced()
									? false
									: skipped()
										? {opacity: 0, x: travel() * 14, y: 0}
										: {opacity: 0, x: 0, y: 9}
							}
							animate={{opacity: 1, x: 0, y: 0}}
							transition={(reduced() ? {duration: 0} : SWAP) as any}
							class="relative block whitespace-nowrap"
						>
							{props.label}
						</Motion.span>
					</Motion.span>
				</Show>
			</span>
		</span>
	)
}
