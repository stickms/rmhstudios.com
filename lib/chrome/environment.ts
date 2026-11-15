/**
 * The picture of the page the chrome reflects (Steel 4.3, V5 to V8).
 *
 * Painted from layout, not captured: each visible element's background and borders from
 * its rectangle and computed colours, each text node with `fillText` on its line boxes.
 * Half resolution. Chrome elements and anything invisible are left out (V6).
 *
 * It covers the whole page when that fits the cap, otherwise a window around the viewport
 * (V7); scrolling then moves an offset in the shader and repaints nothing until the
 * viewport leaves the window.
 */

/** Environment pixels per CSS pixel. */
export const ENV_SCALE = 0.5;
/** V7: the tallest environment, in environment pixels. */
export const ENV_MAX_PX = 8192;

export interface EnvWindow {
  /** Page CSS px of the top-left corner. */
  x: number;
  y: number;
  /** Page CSS px covered. */
  width: number;
  height: number;
}

export interface Viewport {
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
}

/**
 * The region to paint: the whole page if it fits the cap, else a window centred on the
 * viewport. `maxPx` is the environment's pixel cap (the GPU's texture limit can be lower
 * than ENV_MAX_PX).
 */
export function envWindowFor(
  v: Viewport,
  maxPx: number = ENV_MAX_PX,
): EnvWindow {
  const maxCss =
    Math.min(
      maxPx,
      ENV_MAX_PX,
    ) /
    ENV_SCALE;
  const width =
    Math.max(
      1,
      Math.min(
        v.pageWidth,
        maxCss,
      ),
    );
  if (
    v.pageHeight <=
    maxCss
  )
    return {
      x: 0,
      y: 0,
      width,
      height:
        Math.max(
          1,
          v.pageHeight,
        ),
    };
  const centre =
    v.scrollY +
    v.height /
      2;
  const y =
    Math.max(
      0,
      Math.min(
        v.pageHeight -
          maxCss,
        centre -
          maxCss /
            2,
      ),
    );
  return {
    x: 0,
    y,
    width,
    height:
      maxCss,
  };
}

/** True while the viewport, with one screen of margin where there is room, is inside the window. */
export function windowCovers(
  win: EnvWindow,
  v: Viewport,
): boolean {
  const top =
    Math.max(
      0,
      v.scrollY -
        v.height,
    );
  const bottom =
    Math.min(
      v.pageHeight,
      v.scrollY +
        2 *
          v.height,
    );
  return (
    top >=
      win.y -
        0.5 &&
    bottom <=
      win.y +
        win.height +
        0.5
  );
}

/** V6: subtrees that never appear in a reflection. */
export function isSkipped(
  el: Element,
  style: CSSStyleDeclaration,
): boolean {
  if (
    el.hasAttribute(
      'data-chrome',
    ) ||
    el.hasAttribute(
      'data-chrome-skip',
    )
  )
    return true;
  if (
    style.display ===
      'none' ||
    style.visibility ===
      'hidden'
  )
    return true;
  return (
    Number(
      style.opacity,
    ) ===
    0
  );
}

const TRANSPARENT =
  /^(transparent|rgba\(\s*0,\s*0,\s*0,\s*0\s*\))$/;
const visible =
  (
    colour: string,
  ) =>
    colour !==
      '' &&
    !TRANSPARENT.test(
      colour,
    );
const SKIP_TAGS =
  new Set(
    [
      'SCRIPT',
      'STYLE',
      'NOSCRIPT',
      'CANVAS',
      'VIDEO',
      'IFRAME',
      'TEMPLATE',
      'HEAD',
    ],
  );

type Ctx =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

function paintBox(
  ctx: Ctx,
  rect: DOMRect,
  style: CSSStyleDeclaration,
  ox: number,
  oy: number,
): void {
  const x =
    rect.left +
    ox;
  const y =
    rect.top +
    oy;
  const radius =
    Math.min(
      parseFloat(
        style.borderTopLeftRadius,
      ) ||
        0,
      rect.width /
        2,
      rect.height /
        2,
    );
  if (
    visible(
      style.backgroundColor,
    )
  ) {
    ctx.fillStyle =
      style.backgroundColor;
    if (
      radius >
        0.5 &&
      'roundRect' in
        ctx
    ) {
      ctx.beginPath();
      ctx.roundRect(
        x,
        y,
        rect.width,
        rect.height,
        radius,
      );
      ctx.fill();
    } else {
      ctx.fillRect(
        x,
        y,
        rect.width,
        rect.height,
      );
    }
  }
  const sides: Array<
    [
      string,
      string,
      number,
      number,
      number,
      number,
    ]
  > =
    [
      [
        style.borderTopWidth,
        style.borderTopColor,
        x,
        y,
        rect.width,
        0,
      ],
      [
        style.borderBottomWidth,
        style.borderBottomColor,
        x,
        y +
          rect.height,
        rect.width,
        0,
      ],
      [
        style.borderLeftWidth,
        style.borderLeftColor,
        x,
        y,
        0,
        rect.height,
      ],
      [
        style.borderRightWidth,
        style.borderRightColor,
        x +
          rect.width,
        y,
        0,
        rect.height,
      ],
    ];
  for (const [
    w,
    colour,
    sx,
    sy,
    sw,
    sh,
  ] of sides) {
    const width =
      parseFloat(
        w,
      ) ||
      0;
    if (
      width <=
        0 ||
      !visible(
        colour,
      )
    )
      continue;
    ctx.fillStyle =
      colour;
    // A 1px rule is half an environment pixel: draw it at least 2 CSS px so it survives.
    const t =
      Math.max(
        width,
        1 /
          ENV_SCALE,
      );
    if (
      sh ===
      0
    )
      ctx.fillRect(
        sx,
        sy ===
          y
          ? sy
          : sy -
              t,
        sw,
        t,
      );
    else
      ctx.fillRect(
        sx ===
          x
          ? sx
          : sx -
              t,
        sy,
        t,
        sh,
      );
  }
}

function paintText(
  ctx: Ctx,
  node: Text,
  style: CSSStyleDeclaration,
  ox: number,
  oy: number,
  range: Range,
): void {
  const text =
    node.data;
  if (
    !text.trim()
  )
    return;
  ctx.fillStyle =
    style.color;
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  ctx.textBaseline =
    'middle';
  range.selectNodeContents(
    node,
  );
  const rects =
    range.getClientRects();
  if (
    rects.length ===
    0
  )
    return;
  if (
    rects.length ===
    1
  ) {
    const r =
      rects[0];
    ctx.fillText(
      text.trim(),
      r.left +
        ox,
      r.top +
        oy +
        r.height /
          2,
      r.width +
        2,
    );
    return;
  }
  // Several line boxes: place each word on the line it landed on.
  const word =
    /\S+/g;
  let m: RegExpExecArray | null;
  while (
    (m =
      word.exec(
        text,
      ))
  ) {
    range.setStart(
      node,
      m.index,
    );
    range.setEnd(
      node,
      m.index +
        m[0]
          .length,
    );
    const r =
      range.getBoundingClientRect();
    if (
      r.width >
      0
    )
      ctx.fillText(
        m[0],
        r.left +
          ox,
        r.top +
          oy +
          r.height /
            2,
        r.width +
          2,
      );
  }
}

function fieldText(
  el: Element,
):
  | string
  | null {
  // Tag names, not `instanceof`: cheaper, and the same in every realm.
  if (
    el.tagName !==
      'INPUT' &&
    el.tagName !==
      'TEXTAREA'
  )
    return null;
  const field =
    el as HTMLInputElement;
  if (
    el.tagName ===
      'INPUT' &&
    [
      'password',
      'hidden',
      'checkbox',
      'radio',
      'range',
      'file',
    ].includes(
      field.type,
    )
  )
    return null;
  return (
    field.value ||
    field.placeholder ||
    null
  );
}

export interface EnvironmentPainter {
  /** Paint for at most `budgetMs`; true when the whole tree has been painted. */
  step(
    budgetMs: number,
  ): boolean;
  /** Elements painted so far. */
  readonly painted: number;
}

/**
 * A resumable paint of `root` into `ctx`, whose canvas covers `win` at ENV_SCALE.
 *
 * Resumable because one pass over a long page costs tens of milliseconds of style and
 * layout reads: the renderer runs it in idle slices so it is never one long task and never
 * shares a frame with scrolling (V7, V13). Coordinates are page CSS px.
 */
export function createEnvironmentPainter(
  ctx: Ctx,
  root: Element,
  win: EnvWindow,
  background: string,
  scroll: {
    x: number;
    y: number;
  },
  now: () => number = () =>
    performance.now(),
): EnvironmentPainter {
  const doc =
    root.ownerDocument;
  const view =
    doc.defaultView;
  // Client rects are viewport-relative: add the scroll offset to get page coordinates.
  const ox =
    scroll.x;
  const oy =
    scroll.y;
  const range =
    view
      ? doc.createRange()
      : null;
  // Depth-first, document order: each frame is an element's style and the next child to visit.
  const stack: Array<{
    style: CSSStyleDeclaration;
    next: ChildNode | null;
    outside: boolean;
  }> =
    [];
  let started = false;
  let painted = 0;

  const transform =
    () =>
      ctx.setTransform(
        ENV_SCALE,
        0,
        0,
        ENV_SCALE,
        -win.x *
          ENV_SCALE,
        -win.y *
          ENV_SCALE,
      );

  const enter =
    (
      el: Element,
    ): void => {
      if (
        !view ||
        SKIP_TAGS.has(
          el.tagName,
        )
      )
        return;
      const style =
        view.getComputedStyle(
          el,
        );
      if (
        isSkipped(
          el,
          style,
        )
      )
        return;
      const rect =
        el.getBoundingClientRect();
      const top =
        rect.top +
        oy;
      const empty =
        rect.width ===
          0 &&
        rect.height ===
          0;
      const outside =
        !empty &&
        (top >
          win.y +
            win.height ||
          top +
            rect.height <
            win.y);
      if (
        !outside &&
        rect.width >
          0 &&
        rect.height >
          0
      ) {
        paintBox(
          ctx,
          rect,
          style,
          ox,
          oy,
        );
        painted++;
        const value =
          fieldText(
            el,
          );
        if (
          value
        ) {
          ctx.fillStyle =
            style.color;
          ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          ctx.textBaseline =
            'middle';
          const pad =
            parseFloat(
              style.paddingLeft,
            ) ||
            0;
          ctx.fillText(
            value,
            rect.left +
              ox +
              pad,
            top +
              rect.height /
                2,
            Math.max(
              0,
              rect.width -
                2 *
                  pad,
            ),
          );
        }
      }
      // An element outside the window can still have children inside it (a tall column), so
      // prune only when it clips them.
      if (
        outside &&
        style.overflow !==
          'visible'
      )
        return;
      stack.push(
        {
          style,
          next: el.firstChild,
          outside,
        },
      );
    };

  return {
    get painted() {
      return painted;
    },
    step(
      budgetMs,
    ) {
      const deadline =
        now() +
        budgetMs;
      transform();
      if (
        !started
      ) {
        started = true;
        ctx.fillStyle =
          background;
        ctx.fillRect(
          win.x,
          win.y,
          win.width,
          win.height,
        );
        enter(
          root,
        );
      }
      let sinceCheck = 0;
      while (
        stack.length
      ) {
        const top =
          stack[
            stack.length -
              1
          ];
        const child =
          top.next;
        if (
          !child
        ) {
          stack.pop();
          continue;
        }
        top.next =
          child.nextSibling;
        if (
          child.nodeType ===
          1
        )
          enter(
            child as Element,
          );
        else if (
          child.nodeType ===
            3 &&
          !top.outside &&
          range
        )
          paintText(
            ctx,
            child as Text,
            top.style,
            ox,
            oy,
            range,
          );
        if (
          ++sinceCheck >=
          16
        ) {
          sinceCheck = 0;
          if (
            now() >=
            deadline
          )
            break;
        }
      }
      ctx.setTransform(
        1,
        0,
        0,
        1,
        0,
        0,
      );
      return (
        stack.length ===
        0
      );
    },
  };
}
