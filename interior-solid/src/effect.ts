import {createRenderEffect, onCleanup} from "solid-js";

/**
 * Solid 2.0 RC side-effect helper.
 *
 * In RC, writing to a signal inside an `effect`/`renderEffect` body (an OWNED
 * computation) throws `REACTIVE_WRITE_IN_OWNED_SCOPE` and can halt the reactive
 * system — even when the write is wrapped in `untrack()`. The only safe place
 * for a signal write is a NON-reactive callback (event handler, setTimeout, or
 * requestAnimationFrame). `untrack` only stops dependency tracking; it does not
 * change the computation/ownership context, so it does NOT lift the guard.
 *
 * This helper keeps dependency tracking on `compute` (so the effect re-fires on
 * change) but runs `render` inside a `requestAnimationFrame` callback, which
 * executes outside any reactive computation — so signal writes and DOM
 * side-effects are allowed. Returned cleanup functions are still honored:
 * the previous cleanup runs before the next render, and on unmount.
 */
export function effect<T>(
  compute: () => T,
  render: (value: T) => void | (() => void),
) {
  let lastCleanup: void | (() => void);
  // `createRenderEffect(compute, render)` already invokes `compute()` inside the
  // (tracked) reactive computation and passes the result to `render`. We must
  // NOT re-call `compute()` ourselves inside the callback — that would read
  // signals in an untracked (rAF) scope and trigger STRICT_READ_UNTRACKED, and
  // also defeat dependency tracking. The render body runs inside rAF so signal
  // writes and DOM side-effects are allowed (outside any owned scope).
  createRenderEffect(compute, (value) => {
    requestAnimationFrame(() => {
      if (lastCleanup) {
        lastCleanup();
        lastCleanup = undefined;
      }
      lastCleanup = render(value) ?? undefined;
    });
  });
  onCleanup(() => {
    if (lastCleanup) {
      lastCleanup();
      lastCleanup = undefined;
    }
  });
}
