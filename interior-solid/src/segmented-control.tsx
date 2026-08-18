import {createMemo, createSignal, createRenderEffect, For, onSettled} from "solid-js"
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

function OptionRow(props: {
	option: SegmentedOption
	activeValue: () => string
	hoveredValue: () => string
}) {
	const opt = createMemo(() => props.option)
	const cls = createMemo(() => {
		if (opt().disabled)
			return `${SEG} pointer-events-none text-stone-300 dark:text-stone-600`
		if (opt().value !== props.activeValue() && opt().value === props.hoveredValue())
			return `${SEG} pointer-events-none text-stone-700 dark:text-stone-200`
		return `${SEG} pointer-events-none text-stone-500 dark:text-stone-400`
	})
	return (
		<span aria-hidden="true" class={cls()}>
			{opt().label}
		</span>
	)
}

export function SegmentedControl(props: SegmentedControlProps) {
	// Reactively derive options so the control updates when the parent passes a
	// new `options` array (e.g. on a locale switch). Solid components run once,
	// so a bare `props.options` read in <For> does not re-track across prop
	// updates; wrapping it in a memo makes <For> re-render with fresh labels.
	const options = createMemo(() => props.options)
	const optionsLength = () => options().length

	const [internal, setInternal] = createSignal(
		props.defaultValue ?? options()[0]?.value ?? "",
	)
	const [hovered, setHovered] = createSignal(-1)

	const controlled = () => props.value !== undefined
	const current = () => (controlled() ? (props.value as string) : internal())
	const index = createMemo(() => {
		const found = options().findIndex(o => o.value === current())
		return found < 0 ? 0 : found
	})
	const activeValue = () => options()[index()]?.value ?? ""
	const hoveredValue = () => options()[hovered()]?.value ?? ""

	const buttons: (HTMLButtonElement | null)[] = []

	const reduced = usePrefersReducedMotion()

	// The sliding thumb transform must track `index()` (a memo). `Motion`'s
	// `animate` prop is read non-reactively at mount, so it never re-applies
	// after the first paint and the pill stays on segment 0. Drive it from a
	// reactive render-effect instead — refs + effect is the robust fix.
	let thumbEl: HTMLDivElement | null = null
	let thumbInnerEl: HTMLDivElement | null = null
	createRenderEffect(
		() => index(),
		(i) => {
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
		const opts = options()
		const total = opts.length
		let i = from
		for (let k = 0; k < total; k++) {
			i = (i + dir + total) % total
			if (!opts[i]?.disabled) return i
		}
		return from
	}

	const go = (i: number) => {
		const option = options()[i]
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

	function SegmentedOptionButton(props: {
		option: SegmentedOption
		indexValue: number
		activeValue: () => string
		onSelect: () => void
		onHover: () => void
		onKey: (e: KeyboardEvent) => void
	}) {
		const opt = createMemo(() => props.option)
		const idx = props.indexValue
		return (
			<button
				ref={node => {
					buttons[idx] = node
				}}
				type="button"
				role="radio"
				aria-checked={opt().value === activeValue() ? "true" : "false"}
				aria-disabled={opt().disabled ? "true" : undefined}
				tabindex={opt().value === activeValue() ? 0 : -1}
				onClick={props.onSelect}
				onKeyDown={props.onKey}
				onPointerEnter={props.onHover}
				class="cursor-default rounded-[6px] outline-none focus-visible:bg-[#4568FF]/[0.06] focus-visible:shadow-[inset_0_0_0_1px_#4568FF] dark:focus-visible:bg-[#93B0FF]/[0.08] dark:focus-visible:shadow-[inset_0_0_0_1px_#93B0FF]"
			>
				<span class="sr-only">{opt().label}</span>
			</button>
		)
	}

	return (
		<div
			role="radiogroup"
			aria-label={props.label}
			class={`relative inline-block select-none rounded-[9px] border border-stone-200 bg-stone-100/70 p-[3px] shadow-[inset_0_1px_2px_rgba(28,25,23,0.07)] dark:border-white/[0.16] dark:bg-[#1D1D1A] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] ${props.class ?? ""}`}
		>
			<div
				class="relative grid"
				style={{"grid-template-columns": `repeat(${optionsLength()}, minmax(0, 1fr))`, "touch-action": "manipulation"}}
			>
				<For each={options()}>
					{(option) => (
						<OptionRow
							option={option}
							activeValue={activeValue}
							hoveredValue={hoveredValue}
						/>
					)}
				</For>

				<div
					ref={el => {
						thumbEl = el
					}}
					aria-hidden="true"
					class="pointer-events-none absolute inset-y-0 left-0 overflow-hidden rounded-[6px] bg-stone-800 shadow-[0_1px_2px_rgba(28,25,23,0.28)] dark:bg-stone-100 dark:shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
					style={{width: `${100 / optionsLength()}%`}}
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
								width: `${optionsLength() * 100}%`,
								"grid-template-columns": `repeat(${optionsLength()}, minmax(0, 1fr))`,
							}}
						>
							<For each={options()}>
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
					style={{"grid-template-columns": `repeat(${optionsLength()}, minmax(0, 1fr))`}}
					onPointerLeave={() => setHovered(-1)}
				>
					<For each={options()}>
						{(option) => (
							<SegmentedOptionButton
								option={option}
								indexValue={options().indexOf(option)}
								activeValue={activeValue}
								onSelect={() => !option.disabled && select(option.value)}
								onHover={() => !option.disabled && setHovered(options().indexOf(option))}
								onKey={(e: KeyboardEvent) => onKeyDown(e, options().indexOf(option))}
							/>
						)}
					</For>
				</div>
			</div>
		</div>
	)
}
