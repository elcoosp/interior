import {createEffect, createMemo, createSignal, For, onCleanup, Show} from "solid-js"
import {Motion} from "solid-motionone"
import {effect} from "./effect.js"
import {unwrap} from "./unwrap.js"
import {usePrefersReducedMotion} from "./use-prefers-reduced-motion.js"

const CROSSFADE = {
	type: "spring",
	stiffness: 260,
	damping: 34,
	mass: 0.8,
} as const

const WIDTHS = [100, 93, 97, 88, 95, 91] as const

function widthFor(index: number, total: number) {
	if (total > 1 && index === total - 1) return 62
	return WIDTHS[(index * 7 + 3) % WIDTHS.length]
}

export type UseSkeletonSwapOptions = {
	ready: () => boolean
	delay?: number
	minVisible?: number
}

export function useSkeletonSwap(options: UseSkeletonSwapOptions) {
	const delay = () => options.delay ?? 120
	const minVisible = () => options.minVisible ?? 380

	const [visible, setVisible] = createSignal(false)
	let shownAt = 0

	let skReady = false
	let skVisible = false
	let skDelay = 0
	let skMin = 0
	effect(
		() => ({ ready: options.ready(), isVisible: visible(), d: delay(), min: minVisible() }),
		({ ready, isVisible, d, min }) => {
			if (!ready) {
				if (isVisible) return
				const t = setTimeout(() => {
					shownAt = performance.now()
					setVisible(true)
				}, d)
				onCleanup(() => clearTimeout(t))
				return
			}

			if (!isVisible) return
			const rest = Math.max(0, min - (performance.now() - shownAt))
			const t = setTimeout(() => { setVisible(false) }, rest)
			onCleanup(() => clearTimeout(t))
		},
	)

	return {showSkeleton: visible, busy: () => !options.ready()}
}

export type SkeletonSwapProps = {
	ready: boolean | (() => boolean)
	children?: any
	lines?: number
	lineHeight?: number
	barHeight?: number
	reserve?: number
	delay?: number
	minVisible?: number
	label?: string | (() => string)
	skeleton?: any
	class?: string
}

export function SkeletonSwap(props: SkeletonSwapProps) {
	// Static layout values — read props once (they don't change reactively
	// here) so the `style` attributes below never build reactive getters that
	// devComponent enumerates in untrack (no STRICT_READ_UNTRACKED).
	const linesVal = props.lines ?? 3
	const lineHeightVal = props.lineHeight ?? 21
	const barHeightVal = props.barHeight ?? 9
	const boxVal = props.reserve ?? linesVal * lineHeightVal

	const ready = createMemo(() => unwrap(props.ready))
	const {showSkeleton} = useSkeletonSwap({
		ready,
		delay: props.delay,
		minVisible: props.minVisible,
	})
	const reduced = usePrefersReducedMotion()

	// Reactive motion config so solid-motionone re-invokes `animate` on change
	// (the previous plain object froze at mount, leaving the body visible
	// behind the skeleton). Signal reads stay in a tracked scope → no
	// STRICT_READ_UNTRACKED.
	const bodyAnim = createMemo(() =>
		reduced()
			? {opacity: showSkeleton() ? 0 : 1}
			: {
					opacity: showSkeleton() ? 0 : 1,
					scale: showSkeleton() ? 0.99 : 1,
					filter: showSkeleton() ? "blur(4px)" : "blur(0px)",
				},
	)
	const bodyTrans = () => (reduced() ? {duration: 0} : CROSSFADE)
	const skelAnim = createMemo(() => ({opacity: 1}))
	const skelTrans = () => (reduced() ? {duration: 0} : CROSSFADE)

	let shell: HTMLDivElement | undefined
	let body: HTMLDivElement | undefined
	const [scrollable, setScrollable] = createSignal(false)
	// `tabindex` depends on `scrollable()`; set it via an effect (not a JSX
	// attribute) so the signal read stays tracked and never becomes a reactive
	// getter that devComponent enumerates in untrack (no STRICT_READ_UNTRACKED).
	createEffect(
		() => scrollable(),
		(sc) => {
			if (shell) shell.tabIndex = sc ? 0 : -1
		},
	)

	effect(
		() => true,
		() => {
			const el = shell
			const inner = body
			if (!el || typeof ResizeObserver === "undefined") return

			const check = () => setScrollable(el.scrollHeight - el.clientHeight > 1)
			check()

			const ro = new ResizeObserver(check)
			ro.observe(el)
			if (inner) ro.observe(inner)
			return () => ro.disconnect()
		},
	)

	return (
		<div
			ref={shell}
			aria-busy={ready() ? "false" : "true"}
			aria-label={unwrap(props.label)}
			style={{height: `${boxVal}px`}}
			class={`relative grid overflow-y-auto overscroll-contain text-stone-700 dark:text-stone-200 ${props.class ?? ""}`}
		>
			<Motion.div
				ref={body}
				class="col-start-1 row-start-1 min-w-0"
				initial={false}
				animate={() => bodyAnim()}
				transition={bodyTrans}
				style={{"transform-origin": "top left"}}
				{...{"pointer-events": () => showSkeleton() ? "none" : undefined}}
			>
				{props.children}
			</Motion.div>

			<Show when={showSkeleton()}>
				<Motion.div
					aria-hidden="true"
					class="pointer-events-none col-start-1 row-start-1 w-full self-start"
					initial={() => (reduced() ? {opacity: 1} : {opacity: 0})}
					animate={() => skelAnim()}
					transition={skelTrans}
				>
					<Show
						when={props.skeleton === undefined}
						fallback={props.skeleton}
					>
						<div class="w-full">
							<For each={Array.from({length: linesVal}, (_, i) => i)}>
								{i => (
									<div
										class="flex items-center"
										style={{height: `${lineHeightVal}px`}}
									>
										<div
											class="rounded-[5px] bg-stone-200 dark:bg-white/15"
											style={{
												height: `${barHeightVal}px`,
												width: `${widthFor(i, linesVal)}%`,
											}}
										/>
									</div>
								)}
							</For>
						</div>
					</Show>
				</Motion.div>
			</Show>

			<Show when={props.label}>
				<span role="status" class="sr-only">
					{unwrap(props.ready) ? `${unwrap(props.label)} loaded` : ""}
				</span>
			</Show>
		</div>
	)
}
