import {
	createMemo,
	createSignal,
	onCleanup,
	Show,
	untrack,
	type Accessor,
} from "solid-js"
import {effect} from "./effect.js"
import {Portal} from "@solidjs/web"
import {Motion} from "solid-motionone"
import {useId} from "./use-id.js"
import {usePrefersReducedMotion} from "./use-prefers-reduced-motion.js"
import {unwrap} from "./unwrap.js"

const EASE = [0.23, 1, 0.32, 1] as const
const LEAVE = [0.4, 0, 1, 1] as const
const SURFACE = {type: "spring", stiffness: 420, damping: 36, mass: 0.9} as const

const FOCUSABLE = [
	"a[href]",
	"area[href]",
	"button:not([disabled])",
	"input:not([disabled]):not([type='hidden'])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"iframe",
	"summary",
	"[contenteditable='true']",
	"[tabindex]:not([tabindex='-1'])",
].join(",")

function focusableWithin(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
		(el) =>
			el.tabIndex !== -1 &&
			!el.hasAttribute("inert") &&
			el.getAttribute("aria-hidden") !== "true" &&
			el.getClientRects().length > 0,
	)
}

let locks = 0
let releaseLock: (() => void) | null = null

function lockDocumentScroll() {
	locks += 1
	if (locks > 1) return

	const body = document.body
	const gap = window.innerWidth - document.documentElement.clientWidth
	const overflow = body.style.overflow
	const paddingRight = body.style.paddingRight
	const base = Number.parseFloat(window.getComputedStyle(body).paddingRight)

	body.style.overflow = "hidden"
	if (gap > 0) {
		body.style.paddingRight = `${(Number.isFinite(base) ? base : 0) + gap}px`
	}

	releaseLock = () => {
		body.style.overflow = overflow
		body.style.paddingRight = paddingRight
	}
}

function unlockDocumentScroll() {
	locks = Math.max(0, locks - 1)
	if (locks > 0) return
	releaseLock?.()
	releaseLock = null
}

const stack: object[] = []

export type UseModalOptions = {
	// `open` may be a reactive accessor or a plain boolean. It is read only
	// inside tracked effect computes (never in the untracked component body),
	// so passing a signal here does not trip Solid 2.0 RC STRICT_READ_UNTRACKED.
	open: boolean | (() => boolean)
	onClose: () => void
	closeOnEscape?: Accessor<boolean | undefined>
	closeOnBackdrop?: Accessor<boolean | undefined>
	lockScroll?: Accessor<boolean | undefined>
	initialFocusRef?: () => HTMLElement | null
	container?: HTMLElement | null
}

export type ModalOverlayProps = {
	ref: (el: HTMLDivElement) => void
	onPointerDown: (event: PointerEvent) => void
	onClick: (event: MouseEvent) => void
}

export type ModalPanelProps = {
	ref: (el: HTMLDivElement) => void
	role: "dialog"
	"aria-modal": true
	"aria-labelledby": string
	"aria-describedby"?: string
	tabIndex: -1
	onKeyDown: (event: KeyboardEvent) => void
}

export type UseModalResult = {
	target: () => HTMLElement | null
	titleId: string
	descriptionId: string
	overlayProps: ModalOverlayProps
	panelProps: ModalPanelProps
	close: () => void
}

export function useModal({
	open,
	onClose,
	closeOnEscape = () => true,
	closeOnBackdrop = () => true,
	lockScroll = () => true,
	initialFocusRef,
	container,
}: UseModalOptions): UseModalResult {
	// Initialize to document.body so the Portal can mount immediately in the
	// browser; the container-aware effect below overrides it when needed.
	const [target, setTarget] = createSignal<HTMLElement | null>(
		typeof document !== "undefined" ? document.body : null,
	)

	const overlayRef: {el: HTMLElement | null} = {el: null}
	let panelEl: HTMLDivElement | null = null
	const downedOutside = {current: false}

	const baseId = useId()
	const titleId = `${baseId}-title`
	const descriptionId = `${baseId}-description`

	const close = () => latestRef.current.onClose()

	const openOn = createMemo(() => unwrap(open as any) as boolean)

	const resolveFlag = (v: boolean | (() => boolean | undefined) | undefined) =>
		v === undefined ? true : typeof v === "function" ? !!(v as () => boolean | undefined)() : !!v

	const closeOnEscapeOn = () => resolveFlag(closeOnEscape)
	const closeOnBackdropOn = () => resolveFlag(closeOnBackdrop)
	const lockScrollOn = () => resolveFlag(lockScroll)

	const latest = {
		onClose,
		closeOnEscape: closeOnEscapeOn,
		closeOnBackdrop: closeOnBackdropOn,
		initialFocusRef,
	}
	const latestRef = {current: latest}
	latestRef.current = latest

	effect(
		() => true,
		() => {
			setTarget(container === undefined ? document.body : container)
		},
	)
	effect(
		() => ({ o: openOn(), lock: lockScrollOn() }),
		({ o, lock }) => {
			if (!o || !lock) return
			lockDocumentScroll()
			return () => unlockDocumentScroll()
		},
	)

	// Mark sibling subtrees inert while open
	effect(
		() => ({ o: openOn(), t: target() }),
		({ o, t }) => {
			if (!o || !t) return
			const overlay = overlayRef.el
			const parent = overlay?.parentElement
			if (!overlay || !parent) return

			const changed: Array<[Element, string | null]> = []
			for (const child of Array.from(parent.children)) {
				if (child === overlay) continue
				changed.push([child, child.getAttribute("inert")])
				child.setAttribute("inert", "")
			}

			return () => {
				for (const [child, previous] of changed) {
					if (previous === null) child.removeAttribute("inert")
					else child.setAttribute("inert", previous)
				}
			}
		},
	)

	// Escape stack
	effect(
		() => openOn(),
		(o) => {
			if (!o) return
			const token = {}
			stack.push(token)

			const onKeyDown = (event: KeyboardEvent) => {
				if (event.key !== "Escape") return
				if (stack[stack.length - 1] !== token) return
				if (!latestRef.current.closeOnEscape?.()) return
				event.preventDefault()
				event.stopPropagation()
				latestRef.current.onClose()
			}

			document.addEventListener("keydown", onKeyDown)
			return () => {
				document.removeEventListener("keydown", onKeyDown)
				const index = stack.indexOf(token)
				if (index > -1) stack.splice(index, 1)
			}
		},
	)

	// Focus containment
	effect(
		() => ({ o: openOn(), t: target() }),
		({ o, t }) => {
			if (!o || !t) return
			const onFocusIn = (event: FocusEvent) => {
				const panel = panelEl
				const node = event.target as Node | null
				if (!panel || !node || panel.contains(node)) return
				panel.focus({preventScroll: true})
			}
			document.addEventListener("focusin", onFocusIn)
			return () => document.removeEventListener("focusin", onFocusIn)
		},
	)

	// Initial focus
	effect(
		() => ({ o: openOn(), t: target() }),
		({ o, t }) => {
			if (!o || !t) return
			const panel = panelEl
			if (!panel) return

			const previous =
				document.activeElement instanceof HTMLElement ? document.activeElement : null
			const preferred = latestRef.current.initialFocusRef?.()
			;(preferred ?? focusableWithin(panel)[0] ?? panel).focus({preventScroll: true})

			return () => {
				if (previous && previous.isConnected) previous.focus({preventScroll: true})
			}
		},
	)

	const onKeyDown = (event: KeyboardEvent) => {
		if (event.key !== "Tab") return
		const panel = panelEl
		if (!panel) return

		const items = focusableWithin(panel)
		if (items.length === 0) {
			event.preventDefault()
			panel.focus({preventScroll: true})
			return
		}

		const first = items[0]
		const last = items[items.length - 1]
		const active = document.activeElement

		if (event.shiftKey && (active === first || active === panel)) {
			event.preventDefault()
			last.focus({preventScroll: true})
			return
		}
		if (!event.shiftKey && active === last) {
			event.preventDefault()
			first.focus({preventScroll: true})
		}
	}

	const onPointerDown = (event: PointerEvent) => {
		const panel = panelEl
		downedOutside.current = !panel?.contains(event.target as Node)
	}
	const onClick = (event: MouseEvent) => {
		const panel = panelEl
		if (!latestRef.current.closeOnBackdrop?.()) return
		if (panel?.contains(event.target as Node)) return
		if (!downedOutside.current) return
		downedOutside.current = false
		latestRef.current.onClose()
	}

	return {
		target,
		titleId,
		descriptionId,
		overlayProps: {
			ref: (el) => {
				overlayRef.el = el
			},
			onPointerDown,
			onClick,
		},
		panelProps: {
			ref: (el) => {
				panelEl = el
			},
			role: "dialog",
			"aria-modal": true,
			"aria-labelledby": titleId,
			"aria-describedby": descriptionId,
			tabIndex: -1,
			onKeyDown,
		},
		close,
	}
}

const CLOSE_ICON = (
	<svg width="14" height="14" viewBox="0 0 256 256" fill="none" aria-hidden="true">
		<line
			x1="200"
			y1="56"
			x2="56"
			y2="200"
			stroke="currentColor"
			stroke-width="16"
			stroke-linecap="round"
		/>
		<line
			x1="200"
			y1="200"
			x2="56"
			y2="56"
			stroke="currentColor"
			stroke-width="16"
			stroke-linecap="round"
		/>
	</svg>
)

export type ModalProps = {
	open: boolean
	onClose: () => void
	title: any
	description?: any
	children?: any
	footer?: any
	closeLabel?: string
	showClose?: boolean
	closeOnEscape?: boolean
	closeOnBackdrop?: boolean
	lockScroll?: boolean
	initialFocusRef?: () => HTMLElement | null
	container?: HTMLElement | null
	maxWidth?: number
	maxHeight?: string
	class?: string
}

export function Modal(props: ModalProps) {
	const reduced = usePrefersReducedMotion()
	// `isReduced` must be a function-accessor (not a value read at this untracked
	// component-body scope) so the `reduced()` signal read stays in a tracked
	// scope and never becomes a reactive getter that devComponent enumerates
	// in untrack (no STRICT_READ_UNTRACKED).
	const isReduced = () => reduced()

	const {target, titleId, descriptionId, overlayProps, panelProps} = useModal({
		// `target()` is read ONCE here (component setup, a tracked scope — not a
		// JSX attribute) and stored, so the Portal `mount` prop is a plain value
		// and never becomes a reactive getter that devComponent enumerates in
		// untrack (no STRICT_READ_UNTRACKED).
		open: () => unwrap(props.open),
		onClose: props.onClose,
		closeOnEscape: () => unwrap(props.closeOnEscape) ?? true,
		closeOnBackdrop: () => unwrap(props.closeOnBackdrop) ?? true,
		lockScroll: () => unwrap(props.lockScroll) ?? true,
		initialFocusRef: props.initialFocusRef,
		container: props.container,
	})
	// Read the portal target once in an explicit `untrack` scope (component
	// setup runs in Solid's untracked devComponent wrapper) so the `target()`
	// signal read never becomes a reactive getter enumerated in untrack
	// (no STRICT_READ_UNTRACKED).
	const portalMount = untrack(target) ?? document.body

	const variants = () => {
		if (isReduced()) {
			return {
				backdrop: {
					closed: {opacity: 0},
					open: {opacity: 1, transition: {duration: 0}},
					gone: {opacity: 0, transition: {duration: 0}},
				},
				panel: {
					closed: {opacity: 0},
					open: {opacity: 1, transition: {duration: 0}},
					gone: {opacity: 0, transition: {duration: 0}},
				},
			}
		}
		return {
			backdrop: {
				closed: {opacity: 0},
				open: {opacity: 1, transition: {duration: 0.2, ease: EASE}},
				gone: {opacity: 0, transition: {duration: 0.15, ease: LEAVE}},
			},
			panel: {
				closed: {opacity: 0, scale: 0.96, y: 12},
				open: {
					opacity: 1,
					scale: 1,
					y: 0,
					transition: {...SURFACE, opacity: {duration: 0.16, ease: EASE}},
				},
				gone: {
					opacity: 0,
					scale: 0.98,
					y: 6,
					transition: {duration: 0.15, ease: LEAVE},
				},
			},
		}
	}

	// Render-mount management: stay mounted through the exit transition.
	const [render, setRender] = createSignal(false)
	const [phase, setPhase] = createSignal<"closed" | "open" | "gone">("closed")
	effect(
		() => ({ o: unwrap(props.open), r: render(), isReduced: isReduced() }),
		({ o, r, isReduced }) => {
			if (o) {
				setRender(true)
				setPhase("open")
			} else if (r) {
				setPhase("gone")
				const t = setTimeout(() => {
					setRender(false)
					setPhase("closed")
				}, isReduced ? 0 : 200)
				return () => clearTimeout(t)
			}
		},
	)

	// `variants()` reads `isReduced()` (a signal). Compute it once here; wrap in
	// `untrack` so the read happens in an explicit non-tracking scope and never
	// becomes a reactive getter that devComponent enumerates in untrack
	// (no STRICT_READ_UNTRACKED). Reduced-motion rarely changes at runtime, so
	// a one-shot snapshot is acceptable.
	const vv: any = untrack(variants)

	// Note: `target()` is read only inside JSX (mount={target()!}, a tracked
	// scope) to avoid STRICT_READ_UNTRACKED; it is always document.body in the
	// browser so no separate body guard is needed.

	// `animate`/`variants` are passed as JSX attributes (phase() read in the
	// tracked JSX scope) rather than in this untracked body object, to avoid
	// STRICT_READ_UNTRACKED. The fork reads its props untracked, so the value
	// is captured at render time; for phase changes the gate below re-renders.
	const backdropProps = {
		"aria-hidden": "true",
		variants: vv.backdrop,
		style: {"touch-action": "none"},
		class: "absolute inset-0 bg-stone-900/40 dark:bg-black/65",
	} as any
	const panelProps2 = {
		"aria-hidden": "true",
		variants: vv.panel,
		style: {maxWidth: props.maxWidth ?? 440, maxHeight: props.maxHeight ?? "min(78vh, 620px)"},
		class: `relative flex w-full flex-col overflow-hidden rounded-[14px] border border-stone-200 bg-white text-stone-700 shadow-[0_28px_56px_-24px_rgba(24,22,20,0.45)] outline-none dark:border-white/[0.16] dark:bg-[#1D1D1A] dark:text-stone-200 ${props.class ?? ""}`,
	} as any
	const outerMotionProps = {
		initial: "closed",
		variants: {closed: {}, open: {}, gone: {}},
		class: "fixed inset-0 z-50 grid place-items-center p-4 sm:p-6",
	} as any

	return (
		<Portal mount={portalMount}>
			<Show when={render}>
				<Motion.div
					{...(overlayProps as any)}
					{...outerMotionProps}
					animate={() => phase()}
				>
					<Motion.div {...backdropProps} />
					<Motion.div
						{...(panelProps as any)}
						aria-describedby={props.description ? descriptionId : undefined}
						{...panelProps2}
					>
						<div class="flex shrink-0 items-start gap-3 px-4 pb-3 pt-4">
							<div class="min-w-0 flex-1">
								<h2
									id={titleId}
									class="text-[15px] font-medium tracking-[-0.01em] text-stone-800 dark:text-stone-100"
								>
									{props.title}
								</h2>
								{props.description ? (
									<p
										id={descriptionId}
										class="mt-1 text-[12.5px] leading-relaxed text-stone-500 dark:text-stone-400"
									>
										{props.description}
									</p>
								) : null}
							</div>

							{props.showClose !== false ? (
								<button
									type="button"
									onClick={props.onClose}
									aria-label={props.closeLabel ?? "Close dialog"}
									class="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-[7px] text-stone-400 outline-none transition-colors duration-150 hover:bg-stone-100 hover:text-stone-700 focus-visible:bg-[#4568FF]/[0.06] focus-visible:text-stone-700 focus-visible:shadow-[inset_0_0_0_1px_#4568FF] dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-stone-100 dark:focus-visible:bg-[#93B0FF]/[0.1] dark:focus-visible:text-stone-100 dark:focus-visible:shadow-[inset_0_0_0_1px_#93B0FF]"
								>
									{CLOSE_ICON}
								</button>
							) : null}
						</div>

						{props.children ? (
							<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 text-[13px] leading-relaxed">
								{props.children}
							</div>
						) : null}

						{props.footer ? (
							<div class="flex shrink-0 items-center justify-end gap-2 border-t border-stone-200 px-4 py-3 dark:border-white/[0.16]">
								{props.footer}
							</div>
						) : null}
						</Motion.div>
						</Motion.div>
						</Show>
						</Portal>
						)
						}
