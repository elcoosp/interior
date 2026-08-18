import {createEffect, createSignal, onCleanup, onSettled, Show} from "solid-js"
import {Portal} from "@solidjs/web"
import {Motion} from "solid-motionone"
import {useId} from "./use-id.js"
import {usePrefersReducedMotion} from "./use-prefers-reduced-motion.js"

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
		el =>
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
	open: () => boolean
	onClose: () => void
	closeOnEscape?: () => boolean
	closeOnBackdrop?: () => boolean
	lockScroll?: () => boolean
	initialFocus?: () => HTMLElement | null | undefined
	container?: () => HTMLElement | null | undefined
}

export type UseModalResult = {
	target: () => HTMLElement | null
	titleId: string
	descriptionId: string
	overlayProps: {
		ref: (node: HTMLDivElement) => void
		onPointerDown: (event: PointerEvent) => void
		onClick: (event: MouseEvent) => void
	}
	panelProps: {
		ref: (node: HTMLDivElement) => void
		role: "dialog"
		"aria-modal": "true"
		"aria-labelledby": string
		tabIndex: -1
		onKeyDown: (event: KeyboardEvent) => void
	}
	close: () => void
}

export function useModal(options: UseModalOptions): UseModalResult {
	const open = () => options.open()
	const closeOnEscape = () => options.closeOnEscape?.() ?? true
	const closeOnBackdrop = () => options.closeOnBackdrop?.() ?? true
	const lockScroll = () => options.lockScroll?.() ?? true

	const [target, setTarget] = createSignal<HTMLElement | null>(null)

	let overlay: HTMLDivElement | undefined
	let panel: HTMLDivElement | undefined
	let downedOutside = false

	const baseId = useId()
	const titleId = `${baseId}-title`
	const descriptionId = `${baseId}-description`

	const close = () => options.onClose()

	createEffect(() => options.container?.(), () => {
		const requested = options.container?.()
		onSettled(() => {
			setTarget(requested === undefined ? document.body : (requested ?? null))
		})
	})

	let lockOpen = false
	let lockLocked = false
	createEffect(() => { lockOpen = open(); lockLocked = lockScroll() }, () => {
		const isOpen = lockOpen
		const locked = lockLocked
		if (!isOpen || !locked) return
		lockDocumentScroll()
		return (() => unlockDocumentScroll())
	})

	let inertOpen = false
	let inertMount: HTMLElement | null = null
	createEffect(() => { inertOpen = open(); inertMount = target() }, () => {
		const isOpen = inertOpen
		const mount = inertMount
		if (!isOpen || !mount) return
		const node = overlay
		const parent = node?.parentElement
		if (!node || !parent) return

		const changed: Array<[Element, string | null]> = []
		for (const child of Array.from(parent.children)) {
			if (child === node) continue
			changed.push([child, child.getAttribute("inert")])
			child.setAttribute("inert", "")
		}

		return (() => {
			for (const [child, previous] of changed) {
				if (previous === null) child.removeAttribute("inert")
				else child.setAttribute("inert", previous)
			}
		})
	})

	let escOpen = false
	createEffect(() => { escOpen = open() }, () => {
		const isOpen = escOpen
		if (!isOpen) return
		const token = {}
		stack.push(token)

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return
			if (stack[stack.length - 1] !== token) return
			if (!closeOnEscape()) return
			event.preventDefault()
			event.stopPropagation()
			options.onClose()
		}

		document.addEventListener("keydown", onKeyDown)
		return (() => {
			document.removeEventListener("keydown", onKeyDown)
			const index = stack.indexOf(token)
			if (index > -1) stack.splice(index, 1)
		})
	})

	let focusOpen = false
	let focusMount: HTMLElement | null = null
	createEffect(() => { focusOpen = open(); focusMount = target() }, () => {
		const isOpen = focusOpen
		const mount = focusMount
		if (!isOpen || !mount) return
		const node = panel
		const onFocusIn = (event: FocusEvent) => {
			const moved = event.target as Node | null
			if (!node || !moved || node.contains(moved)) return
			node.focus({preventScroll: true})
		}
		document.addEventListener("focusin", onFocusIn)
		return (() => document.removeEventListener("focusin", onFocusIn))
	})

	let initOpen = false
	let initMount: HTMLElement | null = null
	createEffect(() => { initOpen = open(); initMount = target() }, () => {
		const isOpen = initOpen
		const mount = initMount
		if (!isOpen || !mount) return
		const node = panel
		if (!node) return

		const previous =
			document.activeElement instanceof HTMLElement ? document.activeElement : null
		const preferred = options.initialFocus?.()
		;(preferred ?? focusableWithin(node)[0] ?? node).focus({preventScroll: true})

		return (() => {
			if (previous && previous.isConnected) previous.focus({preventScroll: true})
		})
	})

	const onKeyDown = (event: KeyboardEvent) => {
		if (event.key !== "Tab") return
		const node = panel
		if (!node) return

		const items = focusableWithin(node)
		if (items.length === 0) {
			event.preventDefault()
			node.focus({preventScroll: true})
			return
		}

		const first = items[0]
		const last = items[items.length - 1]
		const active = document.activeElement

		if (event.shiftKey && (active === first || active === node)) {
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
		downedOutside = !panel?.contains(event.target as Node)
	}

	const onClick = (event: MouseEvent) => {
		if (!closeOnBackdrop()) return
		if (panel?.contains(event.target as Node)) return
		if (!downedOutside) return
		downedOutside = false
		options.onClose()
	}

	return {
		target,
		titleId,
		descriptionId,
		overlayProps: {
			ref: (node: HTMLDivElement) => {
				overlay = node
			},
			onPointerDown,
			onClick,
		},
		panelProps: {
			ref: (node: HTMLDivElement) => {
				panel = node
			},
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": titleId,
			tabIndex: -1,
			onKeyDown,
		},
		close,
	}
}

const CloseIcon = () => (
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
	initialFocus?: HTMLElement | null
	container?: HTMLElement | null
	maxWidth?: number
	maxHeight?: string
	class?: string
}

export function Modal(props: ModalProps) {
	const reduced = usePrefersReducedMotion()

	const closeLabel = () => props.closeLabel ?? "Close dialog"
	const showClose = () => props.showClose ?? true
	const maxWidth = () => props.maxWidth ?? 440
	const maxHeight = () => props.maxHeight ?? "min(78vh, 620px)"

	const {target, titleId, descriptionId, overlayProps, panelProps} = useModal({
		open: () => props.open,
		onClose: () => props.onClose(),
		closeOnEscape: () => props.closeOnEscape ?? true,
		closeOnBackdrop: () => props.closeOnBackdrop ?? true,
		lockScroll: () => props.lockScroll ?? true,
		initialFocus: () => props.initialFocus,
		container: () => ("container" in props ? props.container : undefined),
	})

	const backdrop = () =>
		reduced()
			? {enter: {opacity: 1}, transition: {duration: 0}}
			: {enter: {opacity: 1}, transition: {duration: 0.2, ease: EASE}}

	const panel = () =>
		reduced()
			? {
					initial: {opacity: 0},
					enter: {opacity: 1},
					transition: {duration: 0},
				}
			: {
					initial: {opacity: 0, scale: 0.96, y: 12},
					enter: {opacity: 1, scale: 1, y: 0},
					transition: {...SURFACE, opacity: {duration: 0.16, ease: EASE}},
				}

	return (
		<Show when={target()}>
			{mount => (
				<Portal mount={mount()}>
					<Show when={props.open}>
						<div
							{...overlayProps}
							class="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6"
						>
							<Motion.div
								aria-hidden="true"
								initial={{opacity: 0}}
								animate={backdrop().enter}
								transition={backdrop().transition as any}
								style={{"touch-action": "none"}}
								class="absolute inset-0 bg-stone-900/40 dark:bg-black/65"
							/>
							<Motion.div
								{...panelProps}
								aria-describedby={props.description ? descriptionId : undefined}
								initial={panel().initial}
								animate={panel().enter}
								transition={panel().transition as any}
								style={{
									"max-width": `${maxWidth()}px`,
									"max-height": maxHeight(),
								}}
								class={`relative flex w-full flex-col overflow-hidden rounded-[14px] border border-stone-200 bg-white text-stone-700 shadow-[0_28px_56px_-24px_rgba(24,22,20,0.45)] outline-none dark:border-white/[0.16] dark:bg-[#1D1D1A] dark:text-stone-200 ${props.class ?? ""}`}
							>
								<div class="flex shrink-0 items-start gap-3 px-4 pb-3 pt-4">
									<div class="min-w-0 flex-1">
										<h2
											id={titleId}
											class="text-[15px] font-medium tracking-[-0.01em] text-stone-800 dark:text-stone-100"
										>
											{props.title}
										</h2>
										<Show when={props.description}>
											<p
												id={descriptionId}
												class="mt-1 text-[12.5px] leading-relaxed text-stone-500 dark:text-stone-400"
											>
												{props.description}
											</p>
										</Show>
									</div>

									<Show when={showClose()}>
										<button
											type="button"
											onClick={() => props.onClose()}
											aria-label={closeLabel()}
											class="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-[7px] text-stone-400 outline-none transition-colors duration-150 hover:bg-stone-100 hover:text-stone-700 focus-visible:bg-[#4568FF]/[0.06] focus-visible:text-stone-700 focus-visible:shadow-[inset_0_0_0_1px_#4568FF] dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-stone-100 dark:focus-visible:bg-[#93B0FF]/[0.1] dark:focus-visible:text-stone-100 dark:focus-visible:shadow-[inset_0_0_0_1px_#93B0FF]"
										>
											{CloseIcon()}
										</button>
									</Show>
								</div>

								<Show when={props.children}>
									<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 text-[13px] leading-relaxed">
										{props.children}
									</div>
								</Show>

								<Show when={props.footer}>
									<div class="flex shrink-0 items-center justify-end gap-2 border-t border-stone-200 px-4 py-3 dark:border-white/[0.16]">
										{props.footer}
									</div>
								</Show>
							</Motion.div>
						</div>
					</Show>
				</Portal>
			)}
		</Show>
	)
}
