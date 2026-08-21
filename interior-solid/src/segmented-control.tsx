import {createMemo, createSignal, onSettled, For} from "solid-js";
import {unwrap} from "./unwrap.js";
import {usePrefersReducedMotion} from "./use-prefers-reduced-motion.js";
import {effect} from "./effect.js";

const SEG =
	"px-3 py-[7px] text-center text-[13px] font-medium leading-[18px] tracking-[-0.01em] whitespace-nowrap";

export type SegmentedOption = {
	value: string;
	label: string;
	disabled?: boolean;
};

export type SegmentedControlProps = {
	options: SegmentedOption[];
	label: string;
	value?: string | (() => string);
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	class?: string;
};

export function SegmentedControl(props: SegmentedControlProps) {
	const reduced = usePrefersReducedMotion();

	// Seed the uncontrolled value after mount. Reading `options()` here runs
	// inside onSettled (a tracked scope), which avoids the STRICT_READ_UNTRACKED
	// warning that a bare read in createSignal's initializer would trigger.
	const [internal, setInternal] = createSignal<string>("");
	onSettled(() => {
		if (unwrap(props.value) === undefined) {
			setInternal(props.defaultValue ?? props.options[0]?.value ?? "");
		}
	});
	const [hovered, setHovered] = createSignal(-1);

	// Value-keyed refs. The <For> mappers below store into these with a PLAIN
	// string key (option.value) — NO signal read inside the mapper/ref, so no
	// STRICT_READ_UNTRACKED. All dynamic class/ARIA state is applied from the
	// tracked effects further down.
	const spans: Record<string, HTMLSpanElement | null> = {};
	const buttons: Record<string, HTMLButtonElement | null> = {};

	const controlled = createMemo(() => unwrap(props.value) !== undefined);
	const current = createMemo(() => (controlled() ? (unwrap(props.value) as string) : internal()));
	// Read options() once in a tracked scope; reading the memo's cached value
	// elsewhere (JSX attributes, effect computes) does not trip STRICT_READ.
	const options = createMemo(() => props.options);
	const labelText = createMemo(() => props.label);
	const cls = createMemo(() => props.class);

	const select = (next: string) => {
		const before = current();
		if (!controlled()) setInternal(next);
		if (next !== before) props.onValueChange?.(next);
	};

	const seek = (from: string, dir: number) => {
		const opts = options();
		const total = opts.length;
		let i = opts.findIndex((o) => o.value === from);
		if (i < 0) i = 0;
		for (let k = 0; k < total; k++) {
			i = (i + dir + total) % total;
			if (!opts[i]?.disabled) return opts[i].value;
		}
		return from;
	};

	const go = (value: string) => {
		const option = options().find((o) => o.value === value);
		if (!option || option.disabled) return;
		buttons[value]?.focus();
		select(value);
	};

	const onKeyDown = (e: KeyboardEvent, value: string) => {
		if (e.key === "ArrowRight" || e.key === "ArrowDown") {
			e.preventDefault();
			go(seek(value, 1));
		} else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
			e.preventDefault();
			go(seek(value, -1));
		} else if (e.key === "Home") {
			e.preventDefault();
			go(seek(options()[options().length - 1]?.value ?? "", 1));
		} else if (e.key === "End") {
			e.preventDefault();
			go(seek(options()[0]?.value ?? "", -1));
		}
	};

	// Imperative visual + ARIA updates. Computations below run in TRACKED scope
	// (so reading options()/hovered()/current() is allowed) and hand plain
	// values to the render, which runs in rAF (untracked) and must do NO signal
	// reads. This keeps every <For> mapper free of signal reads.
	let thumbEl: HTMLDivElement | null = null;
	let thumbInnerEl: HTMLDivElement | null = null;

	effect(
		() => {
			const idx = options().findIndex((o) => o.value === current());
			return {idx};
		},
		({idx}) => {
			if (thumbEl) thumbEl.style.transform = `translateX(${idx * 100}%)`;
			if (thumbInnerEl) thumbInnerEl.style.transform = `translateX(${idx * -100}%)`;
		},
	);

	effect(
		() => {
			const opts = options();
			const idx = opts.findIndex((o) => o.value === current());
			const h = hovered();
			const visual: Record<string, string> = {};
			const states: Record<string, {checked: boolean; tab: number}> = {};
			opts.forEach((o, i) => {
				const isCurrent = i === idx;
				visual[o.value] =
					`${SEG} pointer-events-none ` +
					(o.disabled
						? "text-stone-300 dark:text-stone-600"
						: i === h && !isCurrent
							? "text-stone-700 dark:text-stone-200"
							: "text-stone-500 dark:text-stone-400");
				states[o.value] = {checked: isCurrent, tab: isCurrent ? 0 : -1};
			});
			return {visual, states};
		},
		({visual, states}) => {
			for (const value of Object.keys(spans)) {
				const span = spans[value];
				if (span) span.className = visual[value] ?? `${SEG} pointer-events-none`;
			}
			for (const value of Object.keys(buttons)) {
				const btn = buttons[value];
				if (!btn) continue;
				const st = states[value];
				if (!st) continue;
				btn.setAttribute("aria-checked", st.checked ? "true" : "false");
				btn.tabIndex = st.tab;
			}
		},
	);

	return (
		<div
			role="radiogroup"
			aria-label={labelText()}
			class={`relative inline-block select-none rounded-[9px] border border-stone-200 bg-stone-100/70 p-[3px] shadow-[inset_0_1px_2px_rgba(28,25,23,0.07)] dark:border-white/[0.16] dark:bg-[#1D1D1A] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] ${cls() ?? ""}`}
		>
			<div
				class="relative grid"
				style={{
					"grid-template-columns": `repeat(${options().length}, minmax(0, 1fr))`,
					"touch-action": "manipulation",
				}}
			>
				<For each={options()}>
					{(option) => (
						<span
							ref={(el) => {
								spans[option.value] = el;
							}}
							aria-hidden="true"
							class={`${SEG} pointer-events-none`}
						>
							{option.label}
						</span>
					)}
				</For>

				<div
					ref={(el) => {
						thumbEl = el;
					}}
					aria-hidden="true"
					class="pointer-events-none absolute inset-y-0 left-0 overflow-hidden rounded-[6px] bg-stone-800 shadow-[0_1px_2px_rgba(28,25,23,0.28)] dark:bg-stone-100 dark:shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
					style={{width: `${100 / options().length}%`}}
				>
					<div
						ref={(el) => {
							thumbInnerEl = el;
						}}
						class="absolute inset-0"
					>
						<div
							class="absolute inset-y-0 left-0 grid"
							style={{
								width: `${options().length * 100}%`,
								"grid-template-columns": `repeat(${options().length}, minmax(0, 1fr))`,
							}}
						>
							<For each={options()}>
								{(option) => (
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
					style={{
						"grid-template-columns": `repeat(${options().length}, minmax(0, 1fr))`,
					}}
					onPointerLeave={() => setHovered(-1)}
				>
					<For each={options()}>
						{(option) => (
							<button
								ref={(el) => {
									buttons[option.value] = el;
								}}
								type="button"
								role="radio"
								aria-disabled={option.disabled ? "true" : undefined}
								onClick={() => !option.disabled && select(option.value)}
								onKeyDown={(e) => onKeyDown(e, option.value)}
								onPointerEnter={() => !option.disabled && setHovered(options().findIndex((o) => o.value === option.value))}
								class="cursor-default rounded-[6px] outline-none focus-visible:bg-[#4568FF]/[0.06] focus-visible:shadow-[inset_0_0_0_1px_#4568FF] dark:focus-visible:bg-[#93B0FF]/[0.08] dark:focus-visible:shadow-[inset_0_0_0_1px_#93B0FF]"
							>
								<span class="sr-only">{option.label}</span>
							</button>
						)}
					</For>
				</div>
			</div>
		</div>
	);
}
