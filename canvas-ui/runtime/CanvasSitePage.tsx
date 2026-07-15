/**
 * CanvasSitePage — the canvas equivalent of `components/feed/PageLayout.tsx`
 * for `_site` routes: a sticky frosted header (optional back arrow +
 * breadcrumbs + title + right slot) above a scrolling content column, with
 * the same width contract (`DEFAULT_WIDTH` / `WIDE_*` from lib/layout-width).
 *
 * Use inside a scene rendered by ShellScene (i.e. a CanvasPage with
 * shell="site"): the rail comes from ShellScene, this provides the page's
 * header + scroll region.
 */

import { type ReactNode } from "react";
import { Box } from "./layout/LayoutTree";
import { tw } from "./tw";
import { CanvasText } from "../text/Text";
import { CanvasLink } from "../widgets/Link";
import { ScrollView } from "../widgets/ScrollView";
import { Icon } from "../widgets/Icon";
import { icons } from "../widgets/icons";
import { DEFAULT_WIDTH, WIDE_WIDTH, WIDE_NO_RIGHT_SIDEBAR_WIDTH } from "@/lib/layout-width";

export interface CanvasSitePageProps {
  title: string;
  children: ReactNode;
  /** Right-aligned header content (filters, actions). */
  headerRight?: ReactNode;
  /** Optional right sidebar column (hidden under lg, matching the DOM). */
  rightSidebar?: ReactNode;
  /** Wider center column for grid-heavy pages. */
  wide?: boolean;
  /** Back-arrow target for nested pages. */
  backTo?: string;
  backLabel?: string;
}

export function CanvasSitePage({
  title,
  children,
  headerRight,
  rightSidebar,
  wide,
  backTo,
  backLabel,
}: CanvasSitePageProps) {
  const hasRight = Boolean(rightSidebar);
  const targetWidth = wide ? (hasRight ? WIDE_WIDTH : WIDE_NO_RIGHT_SIDEBAR_WIDTH) : DEFAULT_WIDTH;

  return (
    <Box name="site-page" style={tw("flex flex-row w-full h-full")}>
      {/* Center column (fixed target width, matching AnimatedMain). */}
      <Box
        name="site-page-center"
        style={{
          ...tw("flex flex-col h-full min-w-0 border-r border-site-border"),
          layout: { ...tw("flex flex-col h-full min-w-0").layout, width: targetWidth, maxWidth: "100%" },
        }}
      >
        {/* Sticky header — 72px frosted chrome. */}
        <Box
          name="site-page-header"
          style={tw("flex flex-row items-center justify-between w-full h-[72px] px-4 border-b border-site-border bg-site-bg")}
        >
          <Box style={tw("flex flex-row items-center gap-3 min-w-0")}>
            {backTo && (
              <CanvasLink to={backTo} label={backLabel ?? "Back"} style={tw("flex flex-row items-center p-1.5 rounded-full")}>
                <Icon node={icons["arrow-left"]} size={20} color={{ token: "text-muted" }} />
              </CanvasLink>
            )}
            <CanvasText style="text-2xl font-semibold font-display text-site-text" maxLines={1}>
              {title}
            </CanvasText>
          </Box>
          {headerRight}
        </Box>

        {/* Scrolling content. */}
        <ScrollView name="site-page-scroll" style={tw("flex flex-col flex-1 w-full overflow-hidden")}>
          {children}
        </ScrollView>
      </Box>

      {/* Right sidebar (optional) — hidden under lg to match the DOM. */}
      {hasRight && (
        <Box name="site-page-right" style={tw("hidden lg:flex flex-col w-80 shrink-0 h-full")}>
          {rightSidebar}
        </Box>
      )}
    </Box>
  );
}
