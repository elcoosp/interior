import { createMemo, For } from "solid-js";
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

// Resolve the per-unit step (seconds between units) from the text length.
// Computed directly from props.text (a plain string — never a signal), so the
// result can be read inside Motion's prop getters (which solid-motionone reads
// untracked during initial render) without tripping STRICT_READ_UNTRACKED.
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

  // groups/count are consumed by <For>, which reads them in a tracked scope
  // (For's internal memo), so this memo is safe to read from JSX.
  const data = createMemo(() => {
    const value = props.text;
    const words = value.trim().length ? value.trim().split(/\s+/) : [];

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

    return { groups: built, count: index };
  });

  return {
    ref,
    groups: () => data().groups,
    count: () => data().count,
    reduced: () => Boolean(reduced()),
    step: () => resolveStep(props.text, props.stagger, props.maxDuration),
  };
}

export type TextRevealProps = UseTextRevealOptions & {
  class?: string;
};

export function TextReveal(props: TextRevealProps) {
  const { ref, groups, reduced, step } = useTextReveal<HTMLSpanElement>(props);

  return (
    <span
      ref={(el: HTMLSpanElement) => {
        ref.current = el;
      }}
      class={`text-stone-700 dark:text-stone-200 ${props.class ?? ""}`}
    >
      <span class="sr-only">{props.text}</span>

      <span aria-hidden="true">
        <For each={groups as any}>
          {(group, g) => (
            <>
              {g() > 0 ? " " : null}
              <span class="inline-block whitespace-nowrap align-baseline">
                <For each={group.units}>
                  {(unit) => (
                    <Motion.span
                      class="inline-block align-baseline"
                      // reduced()/step() read plain values (no signals), so these
                      // getters are safe to read inside solid-motionone's untracked
                      // initial render.
                      initial={reduced() ? false : HIDDEN}
                      animate={SHOWN}
                      transition={
                        reduced()
                          ? { duration: 0 }
                          : {
                              duration: DURATION,
                              ease: EASE,
                              delay: unit.index * step(),
                            } as any
                      }
                    >
                      {unit.text}
                    </Motion.span>
                  )}
                </For>
              </span>
            </>
          )}
        </For>
      </span>
    </span>
  );
}
