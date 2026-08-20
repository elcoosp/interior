import { createMemo, createSignal, onCleanup } from "solid-js";
import { Motion } from "solid-motionone";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion.js";

const EASE = [0.23, 1, 0.32, 1] as const;
const DURATION = 0.6;

const HIDDEN = { opacity: 0, y: 10, filter: "blur(8px)" } as const;
const SHOWN = { opacity: 1, y: 0, filter: "blur(0px)" } as const;

export type TextRevealSplit = "word" | "character";

export type TextRevealUnit = {
  key: string;
  text: string;
  index: number;
  spaceBefore: boolean;
};

export type UseTextRevealOptions = {
  text: string;
  by?: TextRevealSplit;
  stagger?: number;
  maxDuration?: number;
  startOnView?: boolean;
  play?: boolean;
  once?: boolean;
  amount?: number;
};

// Resolve the per-unit step (seconds between units) from the text length.
const resolveStep = (text: string, stagger?: number, maxDuration?: number) => {
  const words = text.trim().length ? text.trim().split(/\s+/) : [];
  const total = words.length;
  if (total <= 1) return 0;
  const span = Math.max(0, (maxDuration ?? 1.6) - DURATION);
  return Math.min(stagger ?? 0.055, span / (total - 1));
};

export function useTextReveal<T extends HTMLElement = HTMLSpanElement>(
  props: UseTextRevealOptions,
) {
  const ref = { current: null as T | null };
  const reduced = usePrefersReducedMotion();

  const startOnView = props.startOnView ?? true;
  const [inView, setInView] = createSignal(false);

  // Reveal trigger. Prefer an IntersectionObserver for true "start on view"
  // semantics, but ALSO guarantee a fallback reveal shortly after mount so the
  // animation always plays even if IO never reports an intersection (headless
  // layouts, zero-height-at-observe, etc.). Cleanup is registered in the
  // component-body scope (calling onCleanup inside a rAF callback throws
  // "NO_OWNER_CLEANUP" and aborts the setup).
  const once = props.once ?? true;
  const amount = props.amount ?? 0.35;
  let io: IntersectionObserver | undefined;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  requestAnimationFrame(() => {
    // Guaranteed reveal a moment after mount so the HIDDEN state paints first
    // (the fork applies `animate` at mount with initial={false}), then the
    // staggered reveal plays. Set this BEFORE attempting IO so a throwing
    // IntersectionObserver (some sandboxed / headless layouts) can never
    // prevent the reveal.
    fallbackTimer = setTimeout(() => setInView(true), 400);
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    try {
      io = new IntersectionObserver(
        (entries) => {
          const e = entries[0];
          if (e?.isIntersecting) {
            setInView(true);
            if (once) io?.disconnect();
          } else if (!once) {
            setInView(false);
          }
        },
        { threshold: amount },
      );
      io.observe(el);
    } catch {
      /* IO unavailable — the fallback timer still reveals */
    }
  });
  onCleanup(() => {
    clearTimeout(fallbackTimer);
    io?.disconnect();
  });

  // Flat list of units (stable identity, no <For>) so each Motion.span is a
  // stable element the fork can bind to.
  const units = createMemo(() => {
    const value = props.text;
    const words = value.trim().length ? value.trim().split(/\s+/) : [];

    let index = 0;
    const list: TextRevealUnit[] = [];
    words.forEach((word, w) => {
      if (props.by === "character") {
        Array.from(word).forEach((char, c) => {
          list.push({ key: `w${w}c${c}`, text: char, index: index++, spaceBefore: false });
        });
      } else {
        list.push({ key: `w${w}`, text: word, index: index++, spaceBefore: false });
      }
      if (w < words.length - 1) {
        // trailing space represented as its own non-animated spacer unit
        list.push({ key: `sp${w}`, text: " ", index: -1, spaceBefore: false });
      }
    });
    return list;
  });

  // `startOnView`/`inView()` are signals. Reading them directly inside the
  // `animate`/`transition` functions (which motion resolves in an untracked
  // callback) trips STRICT_READ_UNTRACKED. Compute the started flag in a memo
  // (tracked scope) and read the memo's cached value in those untracked paths.
  const started = createMemo(
    () => (props.play ?? true) && (!startOnView || inView()),
  );

  return {
    ref,
    units,
    count: () => units().filter((u) => u.index >= 0).length,
    started,
    reduced: () => Boolean(reduced()),
    step: () => resolveStep(props.text, props.stagger, props.maxDuration),
  };
}

export type TextRevealProps = UseTextRevealOptions & {
  class?: string;
};

export function TextReveal(props: TextRevealProps) {
  const { ref, units, reduced, step, started } = useTextReveal<HTMLSpanElement>(props);

  return (
    <span
      ref={(el: HTMLSpanElement) => {
        ref.current = el;
      }}
      class={`text-stone-700 dark:text-stone-200 ${props.class ?? ""}`}
    >
      <span class="sr-only">{props.text}</span>

      <span aria-hidden="true" class="inline">
        {units().map((unit) =>
          unit.index < 0 ? (
            <span class="inline-block whitespace-pre"> </span>
          ) : (
            <Motion.span
              class="inline-block align-baseline"
              initial={false}
              animate={() => (started() ? SHOWN : HIDDEN)}
              transition={() =>
                reduced()
                  ? { duration: 0 }
                  : {
                      duration: DURATION,
                      ease: EASE,
                      delay: started() ? unit.index * step() : 0,
                    } as any
              }
            >
              {unit.text}
            </Motion.span>
          ),
        )}
      </span>
    </span>
  );
}
