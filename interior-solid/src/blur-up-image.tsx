import { createEffect, createSignal, onCleanup } from "solid-js";
import { Motion } from "solid-motionone";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion.js";

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

  createEffect(() => { ref.current; props.src; props.srcSet }, () => {
    const img = ref.current;
    const src = props.src;
    const srcSet = props.srcSet;

    const set = (status: BlurUpStatus, instant: boolean) =>
      setState((prev) =>
        prev.status === status && prev.instant === instant
          ? prev
          : { status, instant },
      );

    if (!img || !src) {
      set("loading", false);
      return;
    }

    let alive = true;

    const cached = img.complete && img.naturalWidth > 0;

    const reveal = () => {
      if (!alive) return;
      set("ready", cached);
      props.onReady?.();
    };

    const fail = () => {
      if (!alive) return;
      set("error", cached);
      props.onError?.();
    };

    if (img.complete) {
      if (cached) reveal();
      else fail();
      return (() => {
        alive = false;
      });
      return;
    }

    set("loading", false);

    const onLoad = () => {
      if (!alive) return;
      if (typeof img.decode === "function") {
        img.decode().then(reveal, fail);
        return;
      }
      reveal();
    };

    img.addEventListener("load", onLoad);
    img.addEventListener("error", fail);

    return (() => {
      alive = false;
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", fail);
    });
  });

  return {
    ref,
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
  const { ref, status, instant } = useBlurUpImage(props);

  const shown = () => status() === "ready";
  const still = () => reduced() || instant();
  const transition = () => (still() ? INSTANT : DEVELOP);

  return (
    <div
      aria-busy={status() === "loading" ? "true" : "false"}
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
        class="absolute inset-0 h-full w-full object-cover"
        initial={false}
        animate={
          still()
            ? { opacity: shown() ? 1 : 0 }
            : shown()
              ? {
                  opacity: 1,
                  filter: "blur(0px) saturate(1)",
                  scale: 1,
                }
              : {
                  opacity: 0,
                  filter: "blur(18px) saturate(0.6)",
                  scale: 1.06,
                }
        }
        transition={transition() as any}
      />

      {status() === "error" ? (
        <Motion.div
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={transition() as any}
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
