import {createMemo} from "solid-js"
import {Motion} from "solid-motionone"
import {useId} from "./use-id.js"
import {usePrefersReducedMotion} from "./use-prefers-reduced-motion.js"
import {unwrap} from "./unwrap.js"

const FILL = {type: "spring", stiffness: 210, damping: 34, mass: 0.9} as const
const CROSSFADE = {type: "spring", stiffness: 260, damping: 34, mass: 0.8} as const
const INSTANT = {duration: 0} as const

export type ProgressBarProps = {
	value: number | null | (() => number | null)
	max?: number | (() => number)
	label?: string | (() => string)
	pendingLabel?: string | (() => string)
	completeLabel?: string | (() => string)
	class?: string
	fillClassName?: string
}

export function ProgressBar(props: ProgressBarProps) {
	const reduced = usePrefersReducedMotion()
	const labelId = useId()
	const barRef: {current: HTMLElement | null} = {current: null}

	const max = createMemo(() => unwrap(props.max) ?? 100)
	const value = createMemo(() => unwrap(props.value))
	const indeterminate = () => value() === null
	const fraction = () =>
		indeterminate() || max() <= 0
			? 0
			: Math.min(1, Math.max(0, value()! / max()))
	const percent = () => Math.round(fraction() * 100)
	const complete = () => !indeterminate() && fraction() >= 1

	const measured = () =>
		indeterminate()
			? {}
			: {
					"aria-valuenow": String(Math.round(fraction() * max() * 100) / 100),
					"aria-valuetext": `${percent()}%`,
				}

	const trans = () => (reduced() ? INSTANT : FILL)
	const crossTrans = () => (reduced() ? INSTANT : CROSSFADE)

	return (
		<div class={`w-full ${props.class ?? ""}`}>
			<div class="flex items-baseline justify-between gap-3">
				<span
					id={labelId}
					class="truncate text-[13px] font-medium text-stone-700 dark:text-stone-200"
				>
					{unwrap(props.label) ?? "Progress"}
				</span>

				<span
					aria-hidden="true"
					class="grid shrink-0 justify-items-end text-stone-500 dark:text-stone-400"
				>
					<span
						class="col-start-1 row-start-1 whitespace-nowrap text-[12px] font-medium leading-5 tabular-nums"
					>
						{indeterminate() ? (unwrap(props.pendingLabel) ?? "Working") : `${percent()}%`}
					</span>
				</span>
			</div>

			<div
				role="progressbar"
				aria-labelledby={labelId}
				aria-valuemin={0}
				aria-valuemax={max() ?? 100}
				ref={(el: HTMLElement) => { barRef.current = el }}
				{...measured()}
				class="mt-2 rounded-[4px] bg-stone-200/60 p-[2px] shadow-[inset_0_1px_2px_rgba(28,25,23,0.1),inset_0_0_0_1px_rgba(28,25,23,0.06)] dark:bg-[#1D1D1A] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]"
			>
				<div class="relative h-[8px] overflow-hidden rounded-[2px]">
					<span
						aria-hidden="true"
						class={`absolute inset-0 block origin-left rounded-[2px] ${props.fillClassName ?? 'bg-[#4568FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(28,25,23,0.2)] dark:bg-[#93B0FF] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(0,0,0,0.25)]'}`}
						style={{
							transform: `scaleX(${indeterminate() ? 0 : fraction()})`,
							"transform-origin": "left center",
							transition: reduced() ? "none" : "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
						}}
					/>

					{indeterminate() && !reduced() ? (
						<span
							aria-hidden="true"
							class={`is-indeterminate absolute inset-y-0 left-0 block w-2/5 rounded-[2px] ${props.fillClassName ?? 'bg-[#4568FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(28,25,23,0.2)] dark:bg-[#93B0FF] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(0,0,0,0.25)]'}`}
						/>
					) : null}
				</div>
			</div>

			<span aria-live="polite" class="sr-only">
				{complete()
					? (unwrap(props.completeLabel) ?? "Complete")
					: indeterminate()
					? (unwrap(props.pendingLabel) ?? "Working")
					: ""}
			</span>
		</div>
	)
}
