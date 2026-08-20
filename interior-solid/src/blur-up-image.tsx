import {createEffect, createSignal} from "solid-js";
import {Motion} from "solid-motionone";
import {usePrefersReducedMotion} from "./use-prefers-reduced-motion.js"

const DEVELOP = { duration: 0.65, ease: [0.23, 1, 0.32, 1] } as const;

const INSTANT = { duration: 0 } as const;

export type BlurUpStatus = "loading" | "ready" | "error";

export type UseBlurUpImageOptions = {
  src?: string;
  srcSet?: string;
  onReady?: () => void;
  onError?: () => void;
};

export function useBlurUpImage(props: UseBlurUpImageOptions) {
  const ref = { current: null as HTMLImageElement | null };
  const [state, setState] = createSignal<{
    status: BlurUpStatus;
    instant: boolean;
  }>({ status: "loading", instant: false });

  const set = (status: BlurUpStatus, instant: boolean) => {
    setState((prev) =>
      prev.status === status && prev.instant === instant
        ? prev
        : { status, instant },
    );
  };

  // Solid 2.0 RC: the 2-arg createRenderEffect render body does not run, so we
  // drive image load detection from the element's own onLoad/onError events
  // (wired to <Motion.img> by the caller) plus a one-time mount check for an
  // already-complete (cached) image.
  const onLoad = () => {
    const img = ref.current;
    const cached = !!img && img.complete && img.naturalWidth > 0;
    set("ready", cached);
    props.onReady?.();
  };
  const onError = () => {
    const img = ref.current;
    const cached = !!img && img.complete && img.naturalWidth > 0;
    set("error", cached);
    props.onError?.();
  };

  requestAnimationFrame(() => {
    const img = ref.current;
    if (!img) return;
    if (img.complete) {
      if (img.naturalWidth > 0) onLoad();
      else onError();
    }
  });

  return {
    ref,
    onLoad,
    onError,
    status: () => state().status,
    instant: () => state().instant,
    loaded: () => state().status === "ready",
  };
}

export type BlurUpImageProps = {
  src?: string;
  alt: string;
  width: number;
  height: number;
  placeholder?: string;
  color?: string;
  blur?: number;
  radius?: 5 | 6 | 9 | 11 | 14;
  srcSet?: string;
  sizes?: string;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
  onReady?: () => void;
  onError?: () => void;
  class?: string;
};

export function BlurUpImage(props: BlurUpImageProps) {
	const reduced = usePrefersReducedMotion();
	const {ref, status, instant, onLoad, onError} = useBlurUpImage(props);
	const divRef: {current: HTMLElement | null} = {current: null};
	// `aria-busy` depends on `status()`; set it via an effect rather than a JSX
	// attribute so the signal read stays tracked and never becomes a reactive
	// getter that devComponent enumerates in untrack (no STRICT_READ_UNTRACKED).
	createEffect(
		() => status(),
		(s) => {
			if (divRef.current) divRef.current.setAttribute("aria-busy", s === "loading" ? "true" : "false");
		},
	);

	// Reactive motion config. `initial={false}` skips the enter animation and
	// applies `animate` immediately; we pass `animate` as an ACCESSOR so
	// solid-motionone re-reads it when `status` flips to ready and fades the
	// image in (Solid components don't re-render, so a value would freeze).
	const transition = () => (reduced() || instant() ? INSTANT : DEVELOP);
	const revealAnim = () => {
		const shown = status() === "ready";
		const still = reduced() || instant();
		return still
			? {opacity: shown ? 1 : 0}
			: shown
				? {opacity: 1, filter: "blur(0px) saturate(1)", scale: 1}
				: {opacity: 0, filter: "blur(18px) saturate(0.6)", scale: 1.06};
	};

	return (
		<div
			ref={(el: HTMLElement) => { divRef.current = el }}
			style={`aspect-ratio: ${props.width} / ${props.height}; border-radius: ${props.radius ?? 11}${props.color ? `; background-color: ${props.color}` : ""}`}
			class={`relative w-full overflow-hidden bg-stone-200 dark:bg-white/15 ${props.class ?? ""}`}
		>
			{props.placeholder ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img
					src={props.placeholder}
					alt=""
					aria-hidden="true"
					draggable={false}
					class="absolute inset-0 h-full w-full object-cover"
					style={`filter: blur(${props.blur ?? 14}px); transform: scale(1.08)`}
				/>
			) : null}

			<Motion.img
				ref={(el: HTMLImageElement) => {
					ref.current = el;
				}}
				src={props.src}
				srcset={props.srcSet}
				sizes={props.sizes}
				alt={props.alt}
				width={props.width}
				height={props.height}
				loading={props.loading}
				fetchpriority={props.fetchPriority}
				decoding="async"
				draggable={false}
				onLoad={onLoad}
				onError={onError}
				class="absolute inset-0 h-full w-full object-cover"
				initial={false}
				animate={revealAnim}
				transition={transition}
			/>

			{status() === "error" ? (
				<Motion.div
					aria-hidden="true"
					initial={{opacity: 0}}
					animate={{opacity: 1}}
					transition={transition}
					class="absolute inset-0 grid place-items-center bg-white text-stone-400 dark:bg-[#1D1D1A] dark:text-stone-500"
				>
					<svg width="22" height="22" viewBox="0 0 256 256" fill="currentColor">
						<path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16h64a8,8,0,0,0,7.59-5.47l14.83-44.48L163,151.43a8.07,8.07,0,0,0,4.46-4.46l14.62-36.55,44.48-14.83A8,8,0,0,0,232,88V56A16,16,0,0,0,216,40ZM112.41,157.47,98.23,200H40V172l52-52,30.42,30.42L117,152.57A8,8,0,0,0,112.41,157.47ZM216,82.23,173.47,96.41a8,8,0,0,0-4.9,4.62l-14.72,36.82L138.58,144l-35.27-35.27a16,16,0,0,0-22.62,0L40,149.37V56H216Zm12.68,33a8,8,0,0,0-7.21-1.1l-23.8,7.94a8,8,0,0,0-4.9,4.61l-14.31,35.77-35.77,14.31a8,8,0,0,0-4.61,4.9l-7.94,23.8A8,8,0,0,0,137.73,216H216a16,16,0,0,0,16-16V121.73A8,8,0,0,0,228.68,115.24ZM216,200H148.83l3.25-9.75,35.51-14.2a8.07,8.07,0,0,0,4.46-4.46l14.2-35.51,9.75-3.25Z" />
					</svg>
				</Motion.div>
			) : null}
		</div>
	);
}
