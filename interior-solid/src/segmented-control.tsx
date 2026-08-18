import {createMemo, createSignal, createRenderEffect, For} from "solid-js"
import {usePrefersReducedMotion} from "./use-prefers-reduced-motion.js"

const SEG =
	"px-3 py-[7px] text-center text-[13px] font-medium leading-[18px] tracking-[-0.01em] whitespace-nowrap"

export type SegmentedOption = {
	value: string
	label: string
	disabled?: boolean
}

export type SegmentedControlProps = {
	options: SegmentedOption[]
	label: string
	value?: string
	defaultValue?: string
	onValueChange?: (value: string) => void
	class?: string
}

export function SegmentedControl(props: SegmentedControlProps) {
	const count = createMemo(() => Math.max(1, props.options.length))
	const template = createMemo(() => `repeat(${count()}, minmax(0, 1fr))`)

	const [internal, setInternal] = createSignal(
		props.defaultValue ?? props.options[0]?.value ?? "",
	)
	const [hovered, setHovered] = createSignal(-1)

	const controlled = () => props.value !== undefined
	const current = () => (controlled() ? (props.value as string) : internal())
	const index = createMemo(() => {
		const found = props.options.findIndex(o => o.value === current())
		return found < 0 ? 0 : found
	})

	const buttons: (HTMLButtonElement | null)[] = []

	const reduced = usePrefersReducedMotion()

	// The sliding thumb transform must track `index()` (a memo). `Motion`'s
	// `animate` prop is read non-reactively at mount, so it never re-applies
	// after the first paint and the pill stays on segment 0. Drive it from a
	// reactive render-effect instead — refs + effect is the robust fix.
	let thumbEl: HTMLDivElement | null = null
	let thumbInnerEl: HTMLDivElement | null = null
	createRenderEffect(
		() => {
			// track the active index so the effect re-runs on selection change
			index()
		},
		() => {
			const i = index()
			if (thumbEl) thumbEl.style.transform = `translateX(${i * 100}%)`
			if (thumbInnerEl) thumbInnerEl.style.transform = `translateX(${i * -100}%)`
			// Drive the radio aria-state imperatively: in Solid 2.0 RC the
			// declarative `aria-checked`/`tabindex` bindings to `index()` are
			// not re-evaluated on change, so set them here alongside the thumb.
			for (let bi = 0; bi < buttons.length; bi++) {
				const btn = buttons[bi]
				if (!btn) continue
				btn.setAttribute("aria-checked", bi === i ? "true" : "false")
				btn.tabIndex = bi === i ? 0 : -1
			}
		},
	)

	const select = (next: string) => {
		const before = current()
		if (!controlled()) setInternal(next)
		if (next !== before) props.onValueChange?.(next)
	}

	const seek = (from: number, dir: number) => {
		const options = props.options
		const total = options.length
		let i = from
		for (let k = 0; k < total; k++) {
			i = (i + dir + total) % total
			if (!options[i]?.disabled) return i
		}
		return from
	}

	const go = (i: number) => {
		const option = props.options[i]
		if (!option || option.disabled) return
		buttons[i]?.focus()
		select(option.value)
	}

	const onKeyDown = (e: KeyboardEvent, i: number) => {
		if (e.key === "ArrowRight" || e.key === "ArrowDown") {
			e.preventDefault()
			go(seek(i, 1))
		} else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
			e.preventDefault()
			go(seek(i, -1))
		} else if (e.key === "Home") {
			e.preventDefault()
			go(seek(optionsLength() - 1, 1))
		} else if (e.key === "End") {
			e.preventDefault()
			go(seek(0, -1))
		}
	}

	const optionsLength = () => props.options.length

	return (
		<div
			role="radiogroup"
			aria-label={props.label}
			class={`relative inline-block select-none rounded-[9px] border border-stone-200 bg-stone-100/70 p-[3px] shadow-[inset_0_1px_2px_rgba(28,25,23,0.07)] dark:border-white/[0.16] dark:bg-[#1D1D1A] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] ${props.class ?? ""}`}
		>
			<div
				class="relative grid"
				style={{"grid-template-columns": template(), "touch-action": "manipulation"}}
			>
				<For each={props.options}>
					{(option, i) => (
						<span
							aria-hidden="true"
							class={`${SEG} pointer-events-none ${
								option.disabled
									? "text-stone-300 dark:text-stone-600"
									: hovered() === i() && i() !== index()
									? "text-stone-700 dark:text-stone-200"
									: "text-stone-500 dark:text-stone-400"
							}`}
						>
							{option.label}
						</span>
					)}
				</For>

				<div
					ref={el => {
						thumbEl = el
					}}
					aria-hidden="true"
					class="pointer-events-none absolute inset-y-0 left-0 overflow-hidden rounded-[6px] bg-stone-800 shadow-[0_1px_2px_rgba(28,25,23,0.28)] dark:bg-stone-100 dark:shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
					style={{width: `${100 / count()}%`}}
				>
					<div
						ref={el => {
							thumbInnerEl = el
						}}
						class="absolute inset-0"
					>
						<div
							class="absolute inset-y-0 left-0 grid"
							style={{
								width: `${count() * 100}%`,
								"grid-template-columns": template(),
							}}
						>
							<For each={props.options}>
								{option => (
									<span class={`${SEG} text-stone-50 dark:text-stone-900`}>
										{option.label}
									</span>
								)}
							</For>
						</div>
					</div>
				</div>

				<div
					class="absolute inset-0 grid"
					style={{"grid-template-columns": template()}}
					onPointerLeave={() => setHovered(-1)}
				>
					<For each={props.options}>
						{(option, i) => (
							<button
								ref={node => {
									buttons[i()] = node
								}}
								type="button"
								role="radio"
								aria-checked={i() === index() ? "true" : "false"}
								aria-disabled={option.disabled ? "true" : undefined}
								tabindex={i() === index() ? 0 : -1}
								onClick={() => !option.disabled && select(option.value)}
								onKeyDown={e => onKeyDown(e, i())}
								onPointerEnter={() => !option.disabled && setHovered(i())}
								class="cursor-default rounded-[6px] outline-none focus-visible:bg-[#4568FF]/[0.06] focus-visible:shadow-[inset_0_0_0_1px_#4568FF] dark:focus-visible:bg-[#93B0FF]/[0.08] dark:focus-visible:shadow-[inset_0_0_0_1px_#93B0FF]"
							>
								<span class="sr-only">{option.label}</span>
							</button>
						)}
					</For>
				</div>
			</div>
		</div>
	)
}
