import {createEffect, createSignal, For, onCleanup, onSettled, Show} from "solid-js"
import {Motion} from "solid-motionone"
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

	createEffect(() => {
		const ready = options.ready()
		const isVisible = visible()
		if (!ready) {
			if (isVisible) return
			const t = setTimeout(() => {
				shownAt = performance.now()
				setVisible(true)
			}, delay())
			onCleanup(() => clearTimeout(t))
			return
		}

		if (!isVisible) return
		const rest = Math.max(0, minVisible() - (performance.now() - shownAt))
		const t = setTimeout(() => setVisible(false), rest)
		onCleanup(() => clearTimeout(t))
	})

	return {showSkeleton: visible, busy: () => !options.ready()}
}

export type SkeletonSwapProps = {
	ready: boolean
	children?: any
	lines?: number
	lineHeight?: number
	barHeight?: number
	reserve?: number
	delay?: number
	minVisible?: number
	label?: string
	skeleton?: any
	class?: string
}

export function SkeletonSwap(props: SkeletonSwapProps) {
	const lines = () => props.lines ?? 3
	const lineHeight = () => props.lineHeight ?? 21
	const barHeight = () => props.barHeight ?? 9

	const {showSkeleton} = useSkeletonSwap({
		ready: () => props.ready,
		delay: props.delay,
		minVisible: props.minVisible,
	})
	const reduced = usePrefersReducedMotion()

	let shell: HTMLDivElement | undefined
	let body: HTMLDivElement | undefined
	const [scrollable, setScrollable] = createSignal(false)

	const box = () => props.reserve ?? lines() * lineHeight()

	onSettled(() => {
		const el = shell
		const inner = body
		if (!el || typeof ResizeObserver === "undefined") return

		const check = () => setScrollable(el.scrollHeight - el.clientHeight > 1)
		check()

		const ro = new ResizeObserver(check)
		ro.observe(el)
		if (inner) ro.observe(inner)
		onCleanup(() => ro.disconnect())
	})

	return (
		<div
			ref={shell}
			aria-busy={props.ready ? "false" : "true"}
			aria-label={props.label}
			tabindex={scrollable() ? 0 : undefined}
			style={{height: `${box()}px`}}
			class={`relative grid overflow-y-auto overscroll-contain text-stone-700 dark:text-stone-200 ${props.class ?? ""}`}
		>
			<Motion.div
				ref={body}
				class="col-start-1 row-start-1 min-w-0"
				initial={false}
				animate={
					reduced()
						? {opacity: showSkeleton() ? 0 : 1}
						: {
								opacity: showSkeleton() ? 0 : 1,
								scale: showSkeleton() ? 0.99 : 1,
								filter: showSkeleton() ? "blur(4px)" : "blur(0px)",
							}
				}
				transition={(reduced() ? {duration: 0} : CROSSFADE) as any}
				style={{
					"transform-origin": "top left",
					"pointer-events": showSkeleton() ? "none" : undefined,
				}}
			>
				{props.children}
			</Motion.div>

			<Show when={showSkeleton()}>
				<Motion.div
					aria-hidden="true"
					class="pointer-events-none col-start-1 row-start-1 w-full self-start"
					initial={reduced() ? {opacity: 1} : {opacity: 0}}
					animate={{opacity: 1}}
					transition={(reduced() ? {duration: 0} : CROSSFADE) as any}
				>
					<Show
						when={props.skeleton === undefined}
						fallback={props.skeleton}
					>
						<div class="w-full">
							<For each={Array.from({length: lines()}, (_, i) => i)}>
								{i => (
									<div
										class="flex items-center"
										style={{height: `${lineHeight()}px`}}
									>
										<div
											class="rounded-[5px] bg-stone-200 dark:bg-white/15"
											style={{
												height: `${barHeight()}px`,
												width: `${widthFor(i, lines())}%`,
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
					{props.ready ? `${props.label} loaded` : ""}
				</span>
			</Show>
		</div>
	)
}
