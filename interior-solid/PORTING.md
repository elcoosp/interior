# interior-solid porting patterns (Solid 2.0 + solid-motionone)

This package ports interior.dev's React components (`components/interior/*.tsx` in the
sibling `../interior` repo) to SolidJS 2.0. The React source is the source of truth
for behavior; translate idioms mechanically. DO NOT invent behavior. DO NOT stub.

## Hard rules
- NO `any` for values; only use `as any` to cast `transition={...}` props (see below).
- Every component MUST typecheck and the package MUST build (`pnpm build` green).
- Keep the hook (headless behavior) + styled example component structure.
- Gate all motion behind `usePrefersReducedMotion()` (replaces `useReducedMotion`).
- `aria-hidden` must be a STRING attribute (`aria-hidden="true"` / `aria-hidden={open ? "false" : "true"}`),
  NOT a bare `aria-hidden`. Solid's JSX + motionone's global JSX augmentation rejects bare `aria-hidden`.
- `style` objects: use kebab-case keys as a STRING (`style="touch-action: manipulation"`) OR
  object with kebab keys. camelCase `WebkitTapHighlightColor` / `touchAction` are NOT in Solid's CSSProperties.
- `class` (not `className`). Tailwind classes pass through unchanged.

## Module / lifecycle mapping (React -> Solid 2.0)
- `useState(x)` -> `createSignal(x)`; read `s()` / write `s(v)`.
- `useRef(x)` for mutable, NON-reactive values -> plain `let x = x` in component scope, or a
  `const ref = {current: x}` object. (Solid has no useRef; closures keep the value alive for the
  component's lifetime.) For arrays/maps use plain `const list = []` etc.
- `useEffect(fn, deps)` -> `createEffect(on(deps, fn))` when deps matter, or `createEffect(fn)`
  (runs on every tracked dep). For mount-only with cleanup: `onSettled(() => { ...; onCleanup(() => ...) })`
  (onSettled is Solid 2.0's replacement for onMount).
- `useLayoutEffect` -> `onSettled` (acceptable; true layout effect not required here).
- `useCallback(fn, deps)` -> plain `const fn = (...) => {...}` (Solid functions are stable; just
  close over signals).
- `useMemo(fn, deps)` -> `createMemo(fn)` when reactive, else plain `const x = fn()` (computed once).
- `useId()` -> `useId()` from "solid-js" (exists).
- `useSyncExternalStore(subscribe, get, getServer)` -> `createStore`-backed signal, or simpler:
  wrap the store in a Solid `createSignal` + `createEffect` that calls `subscribe`/`getSnapshot`.
  SEE the Tooltip port for the exact pattern: keep the React store object, expose a Solid signal
  that re-reads `store.getActive()` on each `subscribe` notification.
- `cloneElement(child, props)` -> Solid has NO cloneElement. Instead accept the trigger as a
  render function OR merge handlers onto a child via `<Dynamic>`/spread. For Tooltip specifically,
  accept `children` as a single element and use `<Dynamic component={children} {...mergedProps} />`
  from "solid-js/web", or simpler: accept a `trigger` render prop.
- `createPortal(node, target)` -> `Portal` from "solid-js/web": `<Portal mount={target}>{...}</Portal>`.
- `document.body` portal target -> `<Portal>` with no mount defaults to body.

## Motion mapping (motion/react -> solid-motionone)
- `import {motion, useReducedMotion, AnimatePresence} from "motion/react"`
  ->
  `import {Motion} from "solid-motionone"`
  `import {usePrefersReducedMotion} from "./use-prefers-reduced-motion.js"`
- `motion.div` / `motion.span` / `motion.svg` / `motion.path` -> `Motion.div` / `Motion.span` /
  `Motion.svg` / `Motion.path` (all intrinsic tags supported via the proxy).
- Props translate 1:1: `initial`, `animate`, `transition`, `style`, `whileTap`, `exit` (NO exit —
  see below). Example:
  `<Motion.span initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.2} as any} />`
- `whileTap={{y:1}}` -> `press={{y:1}}` (motionone uses `press`, not `whileTap`).
- `hover={{...}}` -> `hover={{...}}` (supported).
- `transition` prop type: solid-motionone types `transition` as WAAPI `AnimationOptions` (no `ease`),
  a known upstream gap. ALWAYS cast: `transition={{...} as any}`. This is the ONLY accepted `as any`.
- `useMotionValue` / `useTransform` (segmented-control thumb `x`) -> use `@motionone/dom`'s
  `animate()` on a DOM node directly, OR a `createSignal` for the numeric position + bind to the
  element's `style={{x: ...}}` via Motion's `animate`/`style`. Simplest faithful port: keep a
  `createSignal<number>` for the index, and apply `style={{transform: `translateX(${index*100}%)`}}`
  with a `Motion.div` `animate` to the computed transform; under reduced motion set duration 0.

## AnimatePresence (enter/exit) replacement
solid-motionone has NO Presence (it was removed). Replace `AnimatePresence` + `exit` with Solid's
native `<Transition>` from "solid-js/web":
  `import {Transition} from "solid-js/web"`
  `<Transition name="fade">{(shown) => <Show when={shown()}><Motion.div initial={...} animate={...}>...</Motion.div></Show>}</Transition>`
For the common "mount/unmount with opacity" case, a simpler faithful approach:
  use `<Show when={open()}>` wrapping a `Motion.div` with `initial`/`animate` for the enter; for the
  exit, wrap in `<Transition>` so the element animates out before unmount. If exit animation is
  complex, it is acceptable to do enter-only (`<Show>`) + instant hide under reduced motion, BUT
  prefer `<Transition>` when the React used `exit`.

## Files already done (reference implementations — MIRROR their style)
- `src/use-prefers-reduced-motion.ts`  (exact file to import from)
- `src/ripple.tsx`  (Full reference: useRipple hook + Ripple component, Motion.span, For, onSettled,
  bind spread, transition cast, aria-hidden="true".)

When you write a component, also add its named exports to `src/index.tsx` (append an export line).
Each component is ONE file: `src/<slug>.tsx`. Match the React filename slug exactly
(ripple, press-depth, loading-button, skeleton-swap, progress-bar, modal, tooltip-group,
segmented-control, expanding-search, blur-up-image, text-reveal, copy-button).

## Build / verify (run from interior-solid/)
- `pnpm install` (already done once; re-run if you add deps)
- `pnpm build`  -> must emit dist/index.js, dist/index.jsx, index.d.ts with NO type errors.
- Fix all `error TS...` before finishing. Common fixes: `as any` on transition, `aria-hidden="true"`,
  string `style`, `class` not `className`, `onSettled` instead of `onMount`.
