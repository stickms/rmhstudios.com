/**
 * Screen: the `div > (div + canvas)` structure v86 requires, scaled to fit by CSS. A click gives
 * the box keyboard focus; while it has focus, keys go to the guest (the page turns v86's keyboard
 * on at focus and off at blur, because v86 listens on `window`). Ctrl+Alt+Shift+Escape gives the
 * focus back to the page, so the screen is never a keyboard trap.
 */
import type {
  KeyboardEvent,
  PointerEvent,
} from 'react';

interface Props {
  label: string;
  /** How to release the keyboard; read as the screen's description. */
  hint: string;
  hintId: string;
  /**
   * False while a boot, failure or signed-out panel is over the screen (see screen-state.ts):
   * the screen is then inert: not focusable, not clickable, not in the tab order.
   */
  interactive: boolean;
  onCapture: (
    on: boolean,
  ) => void;
  onRelease: () => void;
  /** The guest was used: the home folder may have changed. */
  onInput: () => void;
}

const Screen =
  function Screen({
    label,
    hint,
    hintId,
    interactive,
    onCapture,
    onRelease,
    onInput,
    ref,
  }: Props & {
    ref?: React.Ref<HTMLDivElement>;
  }) {
    const keyDown =
      (
        e: KeyboardEvent<HTMLDivElement>,
      ) => {
        if (
          e.ctrlKey &&
          e.altKey &&
          e.shiftKey &&
          e.key ===
            'Escape'
        ) {
          e.preventDefault();
          e.stopPropagation();
          onRelease();
          e.currentTarget.blur();
          return;
        }
        onInput();
      };
    // A press focuses the screen. In fullscreen it also captures the pointer; Escape (the browser's
    // own) releases it and leaves fullscreen. Outside fullscreen the pointer is never locked.
    const press =
      (
        e: PointerEvent<HTMLDivElement>,
      ) => {
        const el =
          e.currentTarget;
        el.focus();
        onInput();
        // Fullscreen is on the app container (toolbar, dialogs and the screen together).
        if (
          document.fullscreenElement?.contains(
            el,
          ) &&
          !document.pointerLockElement
        )
          void Promise.resolve(
            el.requestPointerLock?.(),
          ).catch(
            () => {},
          );
      };
    return (
      <>
        <div
          ref={
            ref
          }
          className="rmhos-screen"
          // The guest's own text mode draws left to right whatever the page language is.
          dir="ltr"
          tabIndex={
            interactive
              ? 0
              : -1
          }
          inert={
            !interactive
          }
          role="application"
          aria-label={
            label
          }
          aria-describedby={
            hintId
          }
          onFocus={() =>
            interactive &&
            onCapture(
              true,
            )
          }
          onBlur={(
            e,
          ) => {
            // Leaving the screen gives the pointer back too.
            if (
              document.pointerLockElement ===
              e.currentTarget
            )
              document.exitPointerLock?.();
            onCapture(
              false,
            );
          }}
          onKeyDownCapture={
            keyDown
          }
          onPointerDown={
            press
          }
        >
          <div />
          <canvas />
        </div>
        <span
          id={
            hintId
          }
          className="sr-only"
        >
          {
            hint
          }
        </span>
      </>
    );
  };

export default Screen;
