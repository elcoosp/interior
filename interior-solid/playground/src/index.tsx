/* interior-solid playground entry.
 * Imports the LIVE port source (alias "interior-solid" -> ../src/index.tsx)
 * so every demo tracks the components as you port them. Solid 2.0 RC toolchain.
 * The shell uses the interior.dev design system (bezel/panel/well materials,
 * Geist, ink/accent tokens) — see playground/style.css. */
import {render} from "@solidjs/web";
import {createSignal, createEffect, createRenderEffect, For, Show} from "solid-js";
import * as IS from "interior-solid";
import "../style.css";

type Demo = {slug: string; title: string; render: () => any};

const demos: Demo[] = [
	{
		slug: "ripple",
		title: "Ripple",
		render: () => <IS.Ripple onPress={() => console.log("pressed")}>Press me</IS.Ripple>,
	},
	{
		slug: "press-depth",
		title: "PressDepth",
		render: () => (
			<IS.PressDepth onClick={() => console.log("depth")} aria-label="Press depth">
				Press depth
			</IS.PressDepth>
		),
	},
	{
		slug: "loading-button",
		title: "LoadingButton",
		render: () => (
			<IS.LoadingButton
				onAction={() => new Promise((r) => setTimeout(r, 1200))}
				pendingLabel="Working…"
				successLabel="Saved"
				resetAfter={1500}
			>
				Save
			</IS.LoadingButton>
		),
	},
	{
		slug: "progress-bar",
		title: "ProgressBar",
		render: () => <ProgressBarDemo />,
	},
	{
		slug: "copy-button",
		title: "CopyButton",
		render: () => (
			<IS.CopyButton value="hello@interior.dev" copiedLabel="Copied!" label="Copy email" />
		),
	},
	{
		slug: "expanding-search",
		title: "ExpandingSearch",
		render: () => <ExpandingSearchDemo />,
	},
	{
		slug: "blur-up-image",
		title: "BlurUpImage",
		render: () => (
			<IS.BlurUpImage
				alt="Demo image"
				width={320}
				height={200}
				color="#e7e5e4"
				src="https://picsum.photos/seed/interior/320/200"
			/>
		),
	},
	{
		slug: "text-reveal",
		title: "TextReveal",
				render: () => (
					<IS.TextReveal class="text-2xl font-medium" text="Solid 2.0 micro-interactions, ported faithfully." />
				),
	},
	{
		slug: "modal",
		title: "Modal",
		render: () => <ModalDemo />,
	},
	{
		slug: "tooltip",
		title: "Tooltip + TooltipGroup",
		render: () => <TooltipDemo />,
	},
	{
		slug: "segmented-control",
		title: "SegmentedControl",
		render: () => <SegmentedDemo />,
	},
	{
		slug: "skeleton-swap",
		title: "SkeletonSwap",
		render: () => <SkeletonDemo />,
	},
];

function ProgressBarDemo() {
	const [value, setValue] = createSignal(0);
	setInterval(() => setValue((v) => (v >= 100 ? 0 : v + 10)), 900);
	return <IS.ProgressBar value={value} max={100} label="Upload" completeLabel="Done" />;
}

function ExpandingSearchDemo() {
	const [q, setQ] = createSignal("");
	return (
		<IS.ExpandingSearch
			value={q}
			onChange={setQ}
			onSubmit={(v) => console.log("search:", v)}
			placeholder="Search…"
			align="left"
		/>
	);
}

function ModalDemo() {
	const [open, setOpen] = createSignal(false);
	return (
		<>
			<button
				class="press mat-cap rounded-[9px] px-3.5 py-2 text-[13px] font-medium"
				onClick={() => setOpen(true)}
			>
				Open modal
			</button>
			<IS.Modal
				open={open}
				onClose={() => setOpen(false)}
				title="Example dialog"
				description="A faithful Solid 2.0 port of interior's modal."
			>
				<p class="text-[13px] text-ink-2">
					Body content goes here. Close via the button, backdrop, or Escape.
				</p>
			</IS.Modal>
		</>
	);
}

function TooltipDemo() {
	return (
		<IS.TooltipGroup>
			<div class="flex gap-4">
				<IS.Tooltip label="Top tooltip">
					<button class="press mat-cap rounded-[9px] px-3 py-2 text-[13px]">
						Hover (top)
					</button>
				</IS.Tooltip>
				<IS.Tooltip label="Bottom tooltip" side="bottom">
					<button class="press mat-cap rounded-[9px] px-3 py-2 text-[13px]">
						Hover (bottom)
					</button>
				</IS.Tooltip>
			</div>
		</IS.TooltipGroup>
	);
}

function SegmentedDemo() {
	const [value, setValue] = createSignal("day");
	return (
		<IS.SegmentedControl
			label="View"
			value={value}
			onValueChange={setValue}
			options={[
				{value: "day", label: "Day"},
				{value: "week", label: "Week"},
				{value: "month", label: "Month", disabled: true},
			]}
		/>
	);
}

function SkeletonDemo() {
	const [ready, setReady] = createSignal(false);
	return (
		<div class="flex flex-col items-start gap-3">
			<button
				class="press mat-cap rounded-[9px] px-3 py-2 text-[13px]"
				onClick={() => setReady((r) => !r)}
			>
				Toggle ready ({ready() ? "on" : "off"})
			</button>
			<IS.SkeletonSwap ready={ready} lines={3}>
				<p class="text-[13px] text-ink-2">
					Loaded content. This replaces the skeleton lines once <code>ready</code> is true.
				</p>
			</IS.SkeletonSwap>
		</div>
	);
}

function App() {
	const [active, setActive] = createSignal("ripple");
	const [dark, setDark] = createSignal(false);
	const current = () => demos.find((d) => d.slug === active()) ?? demos[0];

	// Drive the .dark class on <html> from the toggle. Solid 2.0 RC: the
	// 2-arg form (compute + render) is createRenderEffect, not createEffect.
	createRenderEffect(
		() => dark(),
		(d) => {
			const root = document.documentElement;
			if (d) root.classList.add("dark");
			else root.classList.remove("dark");
		},
	);

	return (
		<div class="min-h-screen">
			<div class="mx-auto flex max-w-5xl flex-col gap-3 p-3 sm:flex-row sm:gap-4 sm:p-5">
				{/* sidebar — a recessed well holding the nav */}
				<nav class="mat-well shrink-0 rounded-[14px] p-2 sm:w-56">
					<div class="flex items-center justify-between px-2 pb-3 pt-1">
						<h1 class="meta text-ink-3">interior-solid</h1>
						<button
							class="press mat-cap h-7 w-7 rounded-[7px] text-[13px] text-ink-2"
							onClick={() => setDark((d) => !d)}
							aria-label="Toggle dark mode"
							title="Toggle dark mode"
						>
							{dark() ? "☾" : "☀"}
						</button>
					</div>
					<ul class="flex flex-col gap-0.5">
						<For each={demos}>
							{(d) => (
								<li>
									<button
										class={`press w-full rounded-[8px] px-3 py-1.5 text-left text-[13px] ${
											active() === d.slug
												? "bg-ink text-[var(--panel)]"
												: "text-ink-2 hover:bg-[var(--hairline)]"
										}`}
										onClick={() => setActive(d.slug)}
									>
										{d.title}
									</button>
								</li>
							)}
						</For>
					</ul>
				</nav>

				{/* content — a lifted panel floating on the bezel */}
				<main class="mat-panel min-h-[60vh] flex-1 rounded-[20px] p-8">
					<h2 class="mb-6 text-lg font-semibold text-ink">{current().title}</h2>
					<Show when={current()}>{current().render()}</Show>
				</main>
			</div>
		</div>
	);
}

render(() => <App />, document.getElementById("root")!);
