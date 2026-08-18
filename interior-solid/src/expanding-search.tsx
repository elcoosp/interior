import {
  createEffect,
  createSignal,
  onCleanup,
  onSettled,
  createMemo,
} from "solid-js";
import {useId} from "./use-id.js";
import { Motion } from "solid-motionone";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion.js";

const DISCLOSE = { type: "spring", stiffness: 380, damping: 38, mass: 0.7 } as const;
const CROSSFADE = { type: "spring", stiffness: 260, damping: 34, mass: 0.8 } as const;
const CELL = { type: "spring", stiffness: 520, damping: 34, mass: 0.45 } as const;
const INSTANT = { duration: 0 } as const;

const COLLAPSED = 40;
const TEXT_LEFT = 34;
const CLEAR_SLOT = 35;
const COUNT_SLOT = 38;
const ANNOUNCE_DELAY = 500;

export type UseExpandingSearchOptions = {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onSearch?: (value: string) => void;
  onSubmit?: (value: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  debounce?: number;
  collapseOnBlur?: boolean;
  disabled?: boolean;
};

export type UseExpandingSearchReturn = {
  open: () => boolean;
  focused: () => boolean;
  query: () => string;
  expand: () => void;
  collapse: (returnFocus?: boolean) => void;
  toggle: () => void;
  clear: () => void;
  inputRef: { current: HTMLInputElement | null };
  triggerRef: { current: HTMLButtonElement | null };
  onRootFocus: () => void;
  onRootBlur: (event: FocusEvent) => void;
  onInputChange: (event: InputEvent) => void;
  onInputKeyDown: (event: KeyboardEvent) => void;
  onInputFocus: () => void;
};

export function useExpandingSearch(
  props: UseExpandingSearchOptions = {},
): UseExpandingSearchReturn {
  const [ownValue, setOwnValue] = createSignal(props.defaultValue ?? "");
  const [ownOpen, setOwnOpen] = createSignal(props.defaultOpen ?? false);
  const [focused, setFocused] = createSignal(false);

  const query = () => props.value ?? ownValue();
  const isOpen = () => props.open ?? ownOpen();

  const inputRef = { current: null as HTMLInputElement | null };
  let triggerRef = { current: null as HTMLButtonElement | null };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let openRef = props.open ?? false;
  let openCompute = false;

  createEffect(() => { openCompute = isOpen() }, () => {
    openRef = openCompute;
  });

  onCleanup(() => {
    if (timer) clearTimeout(timer);
  });

  const setOpen = (next: boolean) => {
    if (openRef === next) return;
    openRef = next;
    setOwnOpen(next);
    props.onOpenChange?.(next);
  };

  const commit = (next: string) => {
    setOwnValue(next);
    props.onChange?.(next);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      props.onSearch?.(next);
    }, props.debounce ?? 220);
  };

  const flush = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    props.onSearch?.(query());
  };

  const expand = () => {
    if (props.disabled) return;
    setOpen(true);
    inputRef.current?.focus();
  };

  const collapse = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const toggle = () => {
    if (openRef) collapse(true);
    else expand();
  };

  const clear = () => {
    commit("");
    inputRef.current?.focus();
  };

  const onRootFocus = () => setFocused(true);

  const onRootBlur = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    const current = event.currentTarget as HTMLElement;
    if (next && current.contains(next)) return;
    setFocused(false);
    if (!props.collapseOnBlur) return;
    if (typeof document !== "undefined" && !document.hasFocus()) return;
    if (query().length > 0) return;
    setOpen(false);
  };

  const onInputKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (query().length > 0) {
        commit("");
        return;
      }
      collapse(true);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      flush();
      props.onSubmit?.(query());
    }
  };

  const onInputFocus = () => setOpen(true);

  const onInputChange = (event: InputEvent) => {
    const target = event.currentTarget as HTMLInputElement;
    commit(target.value);
  };

  return {
    open: isOpen,
    focused,
    query,
    expand,
    collapse,
    toggle,
    clear,
    inputRef,
    triggerRef,
    onRootFocus,
    onRootBlur,
    onInputChange,
    onInputKeyDown,
    onInputFocus,
  };
}

export type ExpandingSearchProps = UseExpandingSearchOptions & {
  label?: string;
  placeholder?: string;
  resultCount?: number;
  align?: "left" | "right";
  class?: string;
};

export function ExpandingSearch(props: ExpandingSearchProps) {
  const reduced = usePrefersReducedMotion();
  const auto = useId();
  const inputId = `${auto}-field`;

  const {
    open,
    focused,
    query,
    expand,
    clear,
    inputRef,
    triggerRef,
    onRootFocus,
    onRootBlur,
    onInputChange,
    onInputKeyDown,
    onInputFocus,
  } = useExpandingSearch(props);

  const focusedMemo = createMemo(() => focused());

  let trackRef!: HTMLDivElement;
  const [track, setTrack] = createSignal(0);

  createEffect(() => undefined, () => {
    const el = trackRef;
    if (!el) return;
    const read = (w: number) => {
      onSettled(() => {
        setTrack((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
      });
    };
    read(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0];
      if (box) read(box.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  });

  const [announced, setAnnounced] = createSignal("");
  let annOpen = false;
  let annQuery = "";
  createEffect(() => { annOpen = open(); annQuery = query() }, () => {
    const o = annOpen;
    const q = annQuery;
    const id = setTimeout(() => {
      if (!o || q.length === 0 || props.resultCount === undefined) {
        setAnnounced("");
        return;
      }
      setAnnounced(
        `${props.resultCount} ${props.resultCount === 1 ? "result" : "results"} for ${q}`,
      );
    }, ANNOUNCE_DELAY);
    return (() => clearTimeout(id));
  });

  const expanded = createMemo(() => Math.max(COLLAPSED, track()));
  const rightInset = () =>
    CLEAR_SLOT + (props.resultCount === undefined ? 0 : COUNT_SLOT);
  const inner = createMemo(() => Math.max(0, expanded() - TEXT_LEFT - rightInset()));
  const filled = createMemo(() => query().length > 0);
  // Motion configs as PLAIN arrows (not memos). `reduced()` is a non-reactive
  // value, so these read nothing live. Reading a memo in solid-motionone's
  // untracked prop getters would trip STRICT_READ_UNTRACKED, so we avoid memos
  // here entirely.
  const shellMotion = () => (reduced() ? INSTANT : DISCLOSE);
  const fadeMotion = () => (reduced() ? INSTANT : CROSSFADE);
  const cellMotion = () => (reduced() ? INSTANT : CELL);
  const triggerMotion = () => (reduced() ? INSTANT : { ...CROSSFADE, delay: 0.06 });

  return (
    <div
      ref={trackRef}
      role="search"
      class={`relative h-10 w-full ${props.class ?? ""}`}
      onFocus={onRootFocus}
      onBlur={onRootBlur}
    >
      <Motion.div
        initial={false}
        animate={() => ({ width: open() ? expanded() : COLLAPSED })}
        transition={() => shellMotion()}
        onMouseDown={(event: MouseEvent) => {
          if (event.target !== event.currentTarget) return;
          event.preventDefault();
          if (open()) inputRef.current?.focus();
        }}
        class={`absolute inset-y-0 ${props.align === "right" ? "right-0" : "left-0"} overflow-hidden rounded-[10px] border-2 transition-[background-color,border-color,box-shadow] duration-150 ${focusedMemo() ? "border-[#4568FF] bg-white dark:border-[#4568FF] dark:bg-[#252522]" : "border-stone-200 bg-stone-100/70 shadow-[inset_0_1px_2px_rgba(28,25,23,0.07)] dark:border-white/[0.08] dark:bg-[#1D1D1A] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]"}`}
      >
        <Motion.input
          ref={(el: HTMLInputElement) => {
            inputRef.current = el;
          }}
          id={inputId}
          type="search"
          placeholder={props.placeholder}
          aria-label={props.label}
          aria-describedby={`${auto}-live`}
          autocomplete="off"
          spellcheck={false}
          enterkeyhint="search"
          value={query()}
          disabled={props.disabled ?? false}
          tabindex={open() ? 0 : -1}
          onInput={onInputChange}
          onKeyDown={onInputKeyDown}
          onFocus={onInputFocus}
          style={`width: ${inner()}px; left: ${TEXT_LEFT}px`}
          initial={false}
          animate={() => ({ opacity: open() ? 1 : 0 })}
          transition={() => triggerMotion()}
          class="absolute inset-y-0 bg-transparent text-[13px] leading-9 text-stone-700 outline-none focus-visible:outline-none placeholder:text-stone-400 dark:text-stone-200 dark:placeholder:text-stone-500 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
        />

        <Motion.div
          initial={false}
          animate={() => ({ opacity: open() ? 1 : 0 })}
          transition={() => fadeMotion()}
          class="pointer-events-none absolute inset-y-0 right-[7px] flex items-center gap-1.5"
        >
          {props.resultCount === undefined ? null : (
            <span
              aria-hidden="true"
              class="w-8 truncate text-right font-mono text-[9.5px] tabular-nums text-stone-500 dark:text-stone-400"
            >
              {filled() ? props.resultCount : ""}
            </span>
          )}

          <Motion.button
            type="button"
            onClick={clear}
            tabindex={open() && filled() ? 0 : -1}
            aria-label="Clear search"
            aria-controls={inputId}
            initial={false}
            animate={() => ({ opacity: filled() ? 1 : 0, scale: filled() ? 1 : 0.86 })}
            transition={() => cellMotion()}
            class={`grid size-[22px] place-items-center rounded-[6px] text-stone-500 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#4568FF] dark:text-stone-400 dark:focus-visible:outline-[#4568FF] ${open() && filled() ? "pointer-events-auto" : ""}`}
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
        ref={(el: HTMLButtonElement) => {
          triggerRef.current = el;
        }}
        aria-label={props.label}
        aria-controls={inputId}
        type="button"
        disabled={props.disabled ?? false}
        tabindex={open() ? -1 : 0}
        aria-expanded={open() ? "true" : "false"}
        onClick={() => expand()}
        initial={false}
        animate={() => ({ x: props.align === "right" && open() ? -(expanded() - COLLAPSED) : 0 })}
        transition={() => shellMotion()}
        class={`absolute inset-y-0 z-10 grid w-10 place-items-center rounded-[8px] text-stone-500 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#4568FF] disabled:opacity-50 dark:text-stone-400 dark:focus-visible:outline-[#4568FF] ${props.align === "right" ? "right-0" : "left-0"} ${open() ? "pointer-events-none" : ""}`}
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
  );
}
