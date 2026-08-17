import { createMemo, createSignal, For, onCleanup, createEffect } from "solid-js";
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
};

export type TextRevealGroup = {
  key: string;
  units: TextRevealUnit[];
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

export function useTextReveal<T extends HTMLElement = HTMLSpanElement>(
  props: UseTextRevealOptions,
) {
  const ref = { current: null as T | null };
  const [inView, setInView] = createSignal(false);
  const reduced = usePrefersReducedMotion();

  const data = createMemo(() => {
    const words = props.text.trim().length ? props.text.trim().split(/\s+/) : [];

    let index = 0;
    const built: TextRevealGroup[] = words.map((word, w) => {
      if (props.by === "character") {
        return {
          key: `w${w}`,
          units: Array.from(word).map((char, c) => ({
            key: `w${w}c${c}`,
            text: char,
            index: index++,
          })),
        };
      }
      return {
        key: `w${w}`,
        units: [{ key: `w${w}`, text: word, index: index++ }],
      };
    });

    const total = index;
    const span = Math.max(0, (props.maxDuration ?? 1.6) - DURATION);

    return {
      groups: built,
      count: total,
      step: total > 1 ? Math.min(props.stagger ?? 0.055, span / (total - 1)) : 0,
    };
  });

  createEffect(() => undefined, () => {
    const el = ref.current;
    if (!el) return;

    const once = props.once ?? true;
    const amount = props.amount ?? 0.35;

    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold: amount },
    );
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  });

  const started = () => {
    const play = props.play ?? true;
    const startOnView = props.startOnView ?? true;
    return play && (!startOnView || inView());
  };

  return {
    ref,
    groups: () => data().groups,
    step: () => data().step,
    count: () => data().count,
    started,
    reduced: () => Boolean(reduced()),
    duration: () => {
      const count = data().count;
      return count > 1 ? (count - 1) * data().step + DURATION : DURATION;
    },
  };
}

export type TextRevealProps = UseTextRevealOptions & {
  class?: string;
};

export function TextReveal(props: TextRevealProps) {
  const { ref, groups, step, started, reduced } = useTextReveal<HTMLSpanElement>(
    props,
  );

  return (
    <span
      ref={(el: HTMLSpanElement) => {
        ref.current = el;
      }}
      class={`text-stone-700 dark:text-stone-200 ${props.class ?? ""}`}
    >
      <span class="sr-only">{props.text}</span>

      <span aria-hidden="true">
        <For each={groups()}>{(group, g) => (
          <>
            {g() > 0 ? " " : null}
            <span class="inline-block whitespace-nowrap align-baseline">
              <For each={group.units}>{(unit) => (
                <Motion.span
                  class="inline-block align-baseline"
                  initial={reduced() ? false : HIDDEN}
                  animate={started() ? SHOWN : HIDDEN}
                  transition={
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
              )}</For>
            </span>
          </>
        )}</For>
      </span>
    </span>
  );
}
