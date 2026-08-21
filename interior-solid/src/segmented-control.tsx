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
			setInternal(props.defaultValue ?? options()[0]?.value ?? "");
		}
	});
	const [hovered, setHovered] = createSignal(-1);

	const buttons: (HTMLButtonElement | null)[] = [];

	const controlled = createMemo(() => unwrap(props.value) !== undefined);
	const current = createMemo(() => (controlled() ? (unwrap(props.value) as string) : internal()));
	// Read options() once in a tracked scope; calling options() in untracked
	// JSX/For bodies returns the cached array (no signal read -> no STRICT_READ).
	const options = createMemo(() => props.options);
	const labelText = createMemo(() => props.label);
	const cls = createMemo(() => props.class);
	const index = () => {
		const found = options().findIndex((o) => o.value === current());
		return found < 0 ? 0 : found;
	};
	const labelFor = (i: number) => options()[i]?.label ?? "";
	// `indexFor` reads `options` (a memo) directly. Called inside the tracked
	// `index()` memo or JSX expressions it does NOT trip STRICT_READ because
	// those run in a tracking scope; it must never be called inside the
	// untracked <For> mapper (which is where options().indexOf(option) did).
	const indexFor = (value: string) => {
		const opts = options();
		const found = opts.findIndex((o) => o.value === value);
		return found < 0 ? 0 : found;
	};

	const select = (next: string) => {
		const before = current();
		if (!controlled()) setInternal(next);
		if (next !== before) props.onValueChange?.(next);
	};

	const seek = (from: number, dir: number) => {
		const total = options().length;
		let i = from;
		for (let k = 0; k < total; k++) {
			i = (i + dir + total) % total;
			if (!options()[i]?.disabled) return i;
		}
		return from;
	};

	const go = (i: number) => {
		const option = options()[i];
		if (!option || option.disabled) return;
		buttons[i]?.focus();
		select(option.value);
	};

	const onKeyDown = (e: KeyboardEvent, i: number) => {
		if (e.key === "ArrowRight" || e.key === "ArrowDown") {
			e.preventDefault();
			go(seek(i, 1));
		} else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
			e.preventDefault();
			go(seek(i, -1));
		} else if (e.key === "Home") {
			e.preventDefault();
			go(seek(options().length - 1, 1));
		} else if (e.key === "End") {
			e.preventDefault();
			go(seek(0, -1));
		}
	};

	// Drive the sliding thumb imperatively from a render-effect. Solid 2.0 RC
	// does not re-apply declarative transforms bound to a memo on change, so we
	// move the pill via refs inside the effect that tracks `index()`.
	let thumbEl: HTMLDivElement | null = null;
	let thumbInnerEl: HTMLDivElement | null = null;
	effect(
		() => index(),
		(i) => {
			if (thumbEl) thumbEl.style.transform = `translateX(${i * 100}%)`;
			if (thumbInnerEl) thumbInnerEl.style.transform = `translateX(${i * -100}%)`;
			for (let bi = 0; bi < buttons.length; bi++) {
				const btn = buttons[bi];
				if (!btn) continue;
				btn.setAttribute("aria-checked", bi === i ? "true" : "false");
				btn.tabIndex = bi === i ? 0 : -1;
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
							aria-hidden="true"
							class={`${SEG} pointer-events-none ${
								option.disabled
									? "text-stone-300 dark:text-stone-600"
																	: hovered() === indexFor(option.value) && indexFor(option.value) !== index()
										? "text-stone-700 dark:text-stone-200"
										: "text-stone-500 dark:text-stone-400"
							}`}
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
						{(option, i) => {
							return (
								<button
									ref={(node) => {
										buttons[i()] = node;
									}}
									type="button"
									role="radio"
									aria-disabled={option.disabled ? "true" : undefined}
									onClick={() => !option.disabled && select(option.value)}
									onKeyDown={(e) => onKeyDown(e, i())}
									onPointerEnter={() => !option.disabled && setHovered(i())}
									class="cursor-default rounded-[6px] outline-none focus-visible:bg-[#4568FF]/[0.06] focus-visible:shadow-[inset_0_0_0_1px_#4568FF] dark:focus-visible:bg-[#93B0FF]/[0.08] dark:focus-visible:shadow-[inset_0_0_0_1px_#93B0FF]"
								>
									<span class="sr-only">{labelFor(i())}</span>
								</button>
							);
						}}
					</For>
				</div>
			</div>
		</div>
	);
}
