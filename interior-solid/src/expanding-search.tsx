import {createMemo, createSignal, onCleanup, untrack} from "solid-js"
import {Motion} from "solid-motionone"
import {effect} from "./effect.js"
import {useId} from "./use-id.js"
import {usePrefersReducedMotion} from "./use-prefers-reduced-motion.js"
import {unwrap} from "./unwrap.js"

const DISCLOSE = {type: "spring", stiffness: 380, damping: 38, mass: 0.7} as const
const CROSSFADE = {type: "spring", stiffness: 260, damping: 34, mass: 0.8} as const
const CELL = {type: "spring", stiffness: 520, damping: 34, mass: 0.45} as const
const INSTANT = {duration: 0} as const

const COLLAPSED = 40
const TEXT_LEFT = 34
const CLEAR_SLOT = 35
const COUNT_SLOT = 38
const ANNOUNCE_DELAY = 500

export type UseExpandingSearchOptions = {
	value?: string | (() => string)
	defaultValue?: string
	onChange?: (value: string) => void
	onSearch?: (value: string) => void
	onSubmit?: (value: string) => void
	open?: boolean | (() => boolean)
	defaultOpen?: boolean
	onOpenChange?: (open: boolean) => void
	debounce?: number
	collapseOnBlur?: boolean
	disabled?: boolean
}

export type UseExpandingSearchReturn = {
	open: () => boolean
	focused: () => boolean
	query: () => string
	expand: () => void
	collapse: (returnFocus?: boolean) => void
	toggle: () => void
	clear: () => void
	inputRef: {current: HTMLInputElement | null}
	rootProps: {
		onFocus: (event: FocusEvent) => void
		onBlur: (event: FocusEvent) => void
	}
	triggerProps: {
		ref: (node: HTMLButtonElement | null) => void
		type: "button"
		disabled: boolean
		tabIndex: number
		"aria-expanded": boolean
		onClick: () => void
	}
	inputProps: {
		ref: (node: HTMLInputElement | null) => void
		value: string
		disabled: boolean
		tabIndex: number
		onChange: (event: InputEvent) => void
		onKeyDown: (event: KeyboardEvent) => void
		onFocus: () => void
	}
}

export function useExpandingSearch({
	value,
	defaultValue = "",
	onChange,
	onSearch,
	onSubmit,
	open,
	defaultOpen = false,
	onOpenChange,
	debounce = 220,
	collapseOnBlur = true,
	disabled = false,
}: UseExpandingSearchOptions = {}): UseExpandingSearchReturn {
	const [ownValue, setOwnValue] = createSignal(defaultValue)
	const [ownOpen, setOwnOpen] = createSignal(defaultOpen)
	const [focused, setFocused] = createSignal(false)

	const query = createMemo(() => unwrap(value) ?? ownValue())
	const isOpen = createMemo(() => unwrap(open) ?? ownOpen())

	const inputRef: {current: HTMLInputElement | null} = {current: null}
	const triggerRef: {current: HTMLButtonElement | null} = {current: null}
	const timer: {current: ReturnType<typeof setTimeout> | null} = {current: null}
	// `isOpenRef`/`queryRef` are plain mutable holders updated by effects
	// (tracked) and READ by the untracked function-valued Motion arrows
	// (triggerProps/inputProps) and by debounced callbacks. Reading a plain
	// `.current` never trips STRICT_READ_UNTRACKED. The initial value is a safe
	// default — the effects below populate the real value on the first tracked
	// run, before any untracked arrow/callback fires.
	const isOpenRef = {current: false}
	const queryRef = {current: ""}
	effect(
		() => isOpen(),
		(v) => { isOpenRef.current = v },
	)
	effect(
		() => query(),
		(v) => { queryRef.current = v },
	)

	const latest = {
		onChange,
		onSearch,
		onSubmit,
		onOpenChange,
	}
	const latestRef = {current: latest}
	latestRef.current = latest

	// Plain holder for the open state, updated by the effect below (tracked).
	// Read by setOpen/toggle without touching a signal in untracked scopes.
	const openRef = {current: false}
	effect(
		() => isOpen(),
		(o) => {
			openRef.current = o
		},
	)

	onCleanup(() => {
		if (timer.current) clearTimeout(timer.current)
	})

	const setOpen = (next: boolean) => {
		if (openRef.current === next) return
		openRef.current = next
		setOwnOpen(next)
		latestRef.current.onOpenChange?.(next)
	}

	const commit = (next: string) => {
		setOwnValue(next)
		latestRef.current.onChange?.(next)
		if (timer.current) clearTimeout(timer.current)
		timer.current = setTimeout(() => {
			timer.current = null
			latestRef.current.onSearch?.(queryRef.current)
		}, debounce)
	}

	const flush = () => {
		if (!timer.current) return
		clearTimeout(timer.current)
		timer.current = null
		latestRef.current.onSearch?.(queryRef.current)
	}

	const expand = () => {
		if (disabled) return
		setOpen(true)
		inputRef.current?.focus()
	}

	const collapse = (returnFocus = false) => {
		setOpen(false)
		if (returnFocus) triggerRef.current?.focus()
	}

	const toggle = () => {
		if (openRef.current) collapse(true)
		else expand()
	}

	const clear = () => {
		commit("")
		inputRef.current?.focus()
	}

	const onRootFocus = () => setFocused(true)

	const onRootBlur = (event: FocusEvent) => {
		const next = event.relatedTarget as Node | null
		if (next && (event.currentTarget as HTMLElement).contains(next)) return
		setFocused(false)
		if (!collapseOnBlur) return
		if (!document.hasFocus()) return
		if (queryRef.current.length > 0) return
		setOpen(false)
	}

	const onInputKeyDown = (event: KeyboardEvent) => {
		if (event.key === "Escape") {
			event.preventDefault()
			event.stopPropagation()
			if (queryRef.current.length > 0) {
				commit("")
				return
			}
			collapse(true)
			return
		}
		if (event.key === "Enter") {
			event.preventDefault()
			flush()
			latestRef.current.onSubmit?.(queryRef.current)
		}
	}

	const onInputFocus = () => setOpen(true)

	const onInputChange = (event: InputEvent) =>
		commit((event.currentTarget as HTMLInputElement).value)

	return {
		open: isOpen,
		focused: focused,
		query: query,
		expand,
		collapse,
		toggle,
		clear,
		inputRef,
		rootProps: {onFocus: onRootFocus, onBlur: onRootBlur},
		triggerProps: {
			ref: (node: HTMLButtonElement | null) => {
				triggerRef.current = node
			},
			type: "button",
			disabled,
			// Function-valued attrs: Solid treats the arrow as a static value
			// (no reactive getter), and the fork's rAF attr loop calls it each
			// frame — reactive without tripping devComponent's ownKeys enumeration.
			"tabIndex": () => isOpenRef.current ? -1 : 0,
			"aria-expanded": () => isOpenRef.current,
			onClick: expand,
		} as any,
		inputProps: {
			ref: (node: HTMLInputElement | null) => {
				inputRef.current = node
			},
			// `value` stays a static initial snapshot read from the ref (no
			// signal read in this untracked attribute scope — avoids
			// STRICT_READ_UNTRACKED). The fork's rAF loop would otherwise fight
			// user keystrokes on this controlled input.
			value: queryRef.current,
			disabled,
			"tabIndex": () => isOpenRef.current ? 0 : -1,
			onChange: onInputChange,
			onKeyDown: onInputKeyDown,
			onFocus: onInputFocus,
		} as any,
	}
}

export type ExpandingSearchProps = UseExpandingSearchOptions & {
	label?: string
	placeholder?: string
	resultCount?: number
	align?: "left" | "right"
	class?: string
}

export function ExpandingSearch({
	label = "Search",
	placeholder = "Search",
	align = "right",
	class: className = "",
	...options
}: ExpandingSearchProps) {
	const reduced = usePrefersReducedMotion()
	// Reactive memo so reading resultCount happens in a tracked scope.
	const resultCount = createMemo(() => options.resultCount)
	const auto = useId()
	const inputId = `${auto}-field`

	const {open, focused, query, clear, inputRef, rootProps, triggerProps, inputProps} =
		useExpandingSearch(options)

	// Plain refs mirroring the signals consumed inside *untracked*
	// function-valued Motion attributes (class/animate/tabIndex/aria-expanded
	// arrows). solid-motionone's rAF loop invokes those arrows in an untracked
	// scope every frame, so reading a raw signal — or even a memo that
	// recomputes a signal when dirty — trips STRICT_READ_UNTRACKED. Reading a
	// plain `.current` returns the last value with no signal read at all; the
	// effects below keep the refs live (tracked).
	const openRef = {current: open()}
	const focusedRef = {current: focused()}
	const queryRef = {current: query()}
	const filledRef = {current: query().length > 0}
	effect(() => open(), (v) => { openRef.current = v })
	effect(() => focused(), (v) => { focusedRef.current = v })
	effect(() => query(), (v) => { queryRef.current = v })
	effect(() => query().length > 0, (v) => { filledRef.current = v })
	const trackRef: {current: HTMLDivElement | null} = {current: null}
	const [track, setTrack] = createSignal(0)

	// Mount-time ResizeObserver setup. In Solid 2.0 RC the 2-arg
	// createRenderEffect(() => true, render) body does not run, so defer the
	// one-time DOM measurement to the next animation frame (refs are attached
	// by then) and disconnect on cleanup.
	let trackObserver: ResizeObserver | undefined
	requestAnimationFrame(() => {
		const el = trackRef.current
		if (!el || typeof ResizeObserver === "undefined") return
		const read = (w: number) =>
			setTrack((prev) => (Math.abs(prev - w) < 0.5 ? prev : w))
		read(el.getBoundingClientRect().width)
		const observer = new ResizeObserver((entries) => {
			const box = entries[0]
			if (box) read(box.contentRect.width)
		})
		observer.observe(el)
		trackObserver = observer
	})
	onCleanup(() => trackObserver?.disconnect())

	const [announced, setAnnounced] = createSignal("")
	effect(
		() => ({ o: open(), q: query(), rc: resultCount() }),
		({ o, q, rc }) => {
			const id = setTimeout(() => {
				if (!o || q.length === 0 || rc === undefined) {
					setAnnounced("")
					return
				}
				setAnnounced(
					`${rc} ${rc === 1 ? "result" : "results"} for ${q}`,
				)
			}, ANNOUNCE_DELAY)
			return () => clearTimeout(id)
		},
	)

	const expanded = createMemo(() => Math.max(COLLAPSED, track()))
	const rightInset = createMemo(() => CLEAR_SLOT + (resultCount() === undefined ? 0 : COUNT_SLOT))
	const inner = createMemo(() => Math.max(0, expanded() - TEXT_LEFT - rightInset()))

	// Refs mirroring the animation values consumed by the *untracked* Motion
	// `animate`/`initial` arrows (solid-motionone's rAF loop calls them every
	// frame). The memos above read signals (open/track/inner); reading a memo in
	// an untracked arrow recomputes it — and thus re-reads the signal — untracked,
	// tripping STRICT_READ_UNTRACKED. The effects below compute the same values
	// in a tracked scope and stash them in plain refs; the arrows read `.current`
	// with zero signal reads.
	const expandedRef = {current: COLLAPSED}
	const innerRef = {current: 0}
	const shellAnimRef = {current: {width: `${COLLAPSED}px`} as Record<string, string>}
	const inputAnimRef = {current: {opacity: 0, width: "0px"} as Record<string, unknown>}
	const triggerAnimRef = {current: {x: 0}}
	effect(() => expanded(), (v) => { expandedRef.current = v })
	effect(() => inner(), (v) => { innerRef.current = v })
	effect(() => open() ? `${expanded()}px` : `${COLLAPSED}px`, (v) => { shellAnimRef.current = {width: v} })
	effect(() => ({opacity: open() ? 1 : 0, width: `${inner()}px`}), (v) => { inputAnimRef.current = v })
	effect(() => align === "right" && open() ? -(expanded() - COLLAPSED) : 0, (v) => { triggerAnimRef.current = {x: v} })

	const shellEase = reduced() ? "0ms" : "200ms cubic-bezier(0.32,0.72,0,1)"
	const fadeEase = reduced() ? "0ms" : "150ms ease"

	const shellTrans = () => (reduced() ? {duration: 0} : {duration: 0.22, easing: [0.32, 0.72, 0, 1] as any})
	const inputTrans = () => (reduced() ? {duration: 0} : {duration: 0.16})
	const triggerTrans = () => (reduced() ? {duration: 0} : {duration: 0.22, easing: [0.32, 0.72, 0, 1] as any})

	return (
		<div
			ref={(el) => {
				trackRef.current = el
			}}
			role="search"
			class={`relative h-10 w-full ${className}`}
			{...rootProps}
		>
			<Motion.div
				onMouseDown={(event: MouseEvent) => {
					if (event.target !== event.currentTarget) return
					event.preventDefault()
					if (untrack(open)) inputRef.current?.focus()
				}}
				initial={{width: `${COLLAPSED}px`}}
				animate={() => shellAnimRef.current}
				transition={shellTrans}
				class={() => `absolute inset-y-0 ${
					align === "right" ? "right-0" : "left-0"
				} overflow-hidden rounded-[10px] border-2 transition-[background-color,border-color,box-shadow] duration-150 ${
					focusedRef.current
						? "border-[#4568FF] bg-white dark:border-[#93B0FF] dark:bg-[#252522]"
						: "border-stone-200 bg-stone-100/70 shadow-[inset_0_1px_2px_rgba(28,25,23,0.07)] dark:border-white/[0.08] dark:bg-[#1D1D1A] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]"
				}`}
			>
				<Motion.input
					{...(inputProps as any)}
					id={inputId}
					type="search"
					placeholder={placeholder}
					aria-label={label}
					aria-describedby={`${auto}-live`}
					autoComplete="off"
					spellCheck={false}
					enterKeyHint="search"
					initial={() => ({opacity: 0, width: `${innerRef.current}px`})}
					animate={() => inputAnimRef.current}
					transition={inputTrans}
					style={{left: `${TEXT_LEFT}px`}}
					class="absolute inset-y-0 bg-transparent text-[13px] leading-9 text-stone-700 outline-none focus-visible:outline-none placeholder:text-stone-400 dark:text-stone-200 dark:placeholder:text-stone-500 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
				/>

				<Motion.div
					initial={{opacity: 0}}
					animate={() => ({opacity: openRef.current ? 1 : 0})}
					transition={inputTrans}
					class="pointer-events-none absolute inset-y-0 right-[7px] flex items-center gap-1.5"
				>
					{resultCount() === undefined ? null : (
						<span
							aria-hidden="true"
							class="w-8 truncate text-right font-mono text-[9.5px] tabular-nums text-stone-500 dark:text-stone-400"
						>
							{filledRef.current ? resultCount() : ""}
						</span>
					)}

					<Motion.button
						type="button"
						onClick={clear}
						initial={{opacity: 0, scale: 0.86}}
						animate={() => ({opacity: filledRef.current ? 1 : 0, scale: filledRef.current ? 1 : 0.86})}
						transition={inputTrans}
						tabindex={() => openRef.current && filledRef.current ? 0 : -1}
						aria-label="Clear search"
						aria-controls={inputId}
						class={() => `grid size-[22px] place-items-center rounded-[6px] text-stone-500 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#4568FF] dark:text-stone-400 dark:focus-visible:outline-[#93B0FF] ${
							openRef.current && filledRef.current ? "pointer-events-auto" : "pointer-events-none"
						}`}
					>
						<svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
							<path
								d="M1.7 1.7 L9.3 9.3 M9.3 1.7 L1.7 9.3"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
					</Motion.button>
				</Motion.div>
			</Motion.div>

			<Motion.button
				{...(triggerProps as any)}
				aria-label={label}
				aria-controls={inputId}
				initial={{x: 0}}
				animate={() => triggerAnimRef.current}
				transition={triggerTrans}
				class={() => `absolute inset-y-0 z-10 grid w-10 place-items-center rounded-[8px] text-stone-500 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#4568FF] disabled:opacity-50 dark:text-stone-400 dark:focus-visible:outline-[#93B0FF] ${
					align === "right" ? "right-0" : "left-0"
				} ${openRef.current ? "pointer-events-none" : ""}`}
			>
				<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
					<circle cx="6.4" cy="6.4" r="4.5" stroke="currentColor" stroke-width="1.4" />
					<path
						d="M9.8 9.8 L13.2 13.2"
						stroke="currentColor"
						stroke-width="1.4"
						stroke-linecap="round"
					/>
				</svg>
			</Motion.button>

			<span id={`${auto}-live`} aria-live="polite" class="sr-only">
				{announced()}
			</span>
		</div>
		)
}
