/**
 * canvas-ui — the Konva-based rendering framework that replaces DOM UI.
 * See docs/canvas-architecture.md for the deep dive and
 * docs/design-language.md for the widget/token catalog.
 */

// runtime
export { StageHost } from "./runtime/StageHost";
export { CanvasPage, type CanvasPageProps } from "./runtime/CanvasPage";
export { tw, resolveResponsive, type TwStyle, type TwDecl } from "./runtime/tw";
export {
  Box,
  type BoxProps,
  type BoxRef,
  type LayoutRect,
  resolveColor,
  useLayoutScheduler,
} from "./runtime/layout/LayoutTree";
export { useCanvasEnv } from "./runtime/env";

// theme
export { useTheme, getThemeTokens } from "./theme/useTheme";
export { THEME_TOKENS, TEXT_SIZES, FONT_WEIGHTS, type ThemeTokens } from "./theme/tokens";
export { resolveAccent, applyAccentToTokens } from "./theme/accents";
export { mixOklab, parseColor, withAlpha } from "./theme/color";

// text
export { CanvasText, type TextProps } from "./text/Text";

// widgets
export { Button, type ButtonProps } from "./widgets/Button";
export { CanvasLink, type CanvasLinkProps } from "./widgets/Link";
export { ScrollView, type ScrollViewProps } from "./widgets/ScrollView";
export { Card, Badge, Divider, Spinner, Skeleton } from "./widgets/primitives";
export { Icon, type IconNode, type IconProps } from "./widgets/Icon";

// mirror / a11y
export { useMirrorControl, MirrorOutlet } from "./mirror/MirrorControls";

// overlay
export { OverlaySlot, OverlayRoot } from "./overlay/OverlayManager";

// helpers
export { pickFiles } from "./helpers/filePicker";
export { copyText } from "./helpers/clipboard";
export { useInputProxyStore } from "./helpers/HelperRoot";

// motion
export { animate, prefersReducedMotion } from "./motion/animate";

// scene registry
export { useSceneRegistry, type SceneEntry, type ShellVariant } from "./scene/registry";
