/**
 * ShellScene — the canvas equivalent of the `_site` sidebar shell
 * (`app/routes/_site.tsx` + `components/feed/LeftSidebar.tsx`).
 *
 * Rendered by StageHost around any scene whose CanvasPage declared
 * shell="site": a left nav rail (logo, gated nav items, expandable "More"
 * group, active highlighting, router navigation, sign-in/profile footer)
 * plus a flex-1 content column that hosts the route scene. Session state is
 * read by StageHostInner (which runs under Providers in the DOM tree) and
 * passed in as props, respecting the Konva reconciler boundary.
 *
 * Deferred vs. the DOM rail (enhancements, tracked for later waves): pinned
 * "More" items, notification/inbox badges, streak, the user dropdown menu,
 * and the Compose modal. Core navigation + auth affordance are complete.
 */

import { useState } from "react";
import { Box } from "@/canvas-ui/runtime/layout/LayoutTree";
import { tw } from "@/canvas-ui/runtime/tw";
import { CanvasText } from "@/canvas-ui/text/Text";
import { CanvasLink } from "@/canvas-ui/widgets/Link";
import { Button } from "@/canvas-ui/widgets/Button";
import { useCanvasEnv } from "@/canvas-ui/runtime/env";
import { Icon } from "@/canvas-ui/widgets/Icon";
import { icons } from "@/canvas-ui/widgets/icons";
import { useTranslation } from "react-i18next";
import { SHELL_NAV, isNavGroup, isNavActive, type NavLeaf } from "./nav-model";

export interface ShellSession {
  authed: boolean;
  isAdmin: boolean;
  name?: string | null;
  handle?: string | null;
  userId?: string | null;
}

const RAIL_WIDTH = 260;

function NavRow({
  leaf,
  pathname,
  nested,
  label,
}: {
  leaf: NavLeaf;
  pathname: string;
  nested?: boolean;
  label: string;
}) {
  const active = isNavActive(leaf.href, pathname);
  return (
    <CanvasLink
      to={leaf.href}
      external={leaf.external}
      label={label}
      name={`nav-${leaf.href}`}
      style={tw(
        `flex flex-row items-center gap-3 w-full px-3.5 py-3 ${nested ? "pl-10" : ""} rounded-full ${
          active ? "bg-site-accent-dim" : ""
        }`
      )}
    >
      <Icon node={icons[leaf.icon]} size={20} color={{ token: active ? "accent" : "text-muted" }} />
      <CanvasText style={active ? "text-sm font-medium text-site-accent" : "text-sm font-medium text-site-text-muted"}>
        {label}
      </CanvasText>
    </CanvasLink>
  );
}

interface ShellSceneProps {
  session: ShellSession;
  pathname: string;
  children: React.ReactNode;
}

export function ShellScene({ session, pathname, children }: ShellSceneProps) {
  const { t } = useTranslation("feed");
  const env = useCanvasEnv();
  const [openMore, setOpenMore] = useState(() =>
    SHELL_NAV.some((i) => isNavGroup(i) && i.children.some((c) => isNavActive(c.href, pathname)))
  );

  return (
    <Box name="site-shell" style={tw("flex flex-row w-full h-full bg-site-bg")}>
      {/* Left rail */}
      <Box
        name="site-rail"
        style={{
          ...tw("flex flex-col h-full p-4 gap-1 border-r border-site-border bg-site-bg"),
          layout: { ...tw("flex flex-col h-full p-4 gap-1 border-r border-site-border").layout, width: RAIL_WIDTH, flexShrink: 0 },
        }}
      >
        <CanvasLink to="/" label="RMH Studios" style={tw("flex flex-row items-center mb-6")}>
          <CanvasText style="text-xl font-bold font-display text-site-text">RMHStudios</CanvasText>
        </CanvasLink>

        {SHELL_NAV.map((item) => {
          if (!isNavGroup(item)) {
            if (item.requiresAuth && !session.authed) return null;
            if (item.requiresAdmin && !session.isAdmin) return null;
            return <NavRow key={item.href} leaf={item} pathname={pathname} label={t(item.tKey, { defaultValue: item.label })} />;
          }
          const groupLabel = t(item.tKey, { defaultValue: item.label });
          return (
            <Box key={item.group} style={tw("flex flex-col w-full gap-1")}>
              <Box
                name="nav-more-toggle"
                style={tw("flex flex-row items-center gap-3 w-full px-3.5 py-3 rounded-full")}
                onClick={() => setOpenMore((v) => !v)}
                onTap={() => setOpenMore((v) => !v)}
              >
                <Icon node={icons[item.icon]} size={20} color={{ token: "text-muted" }} />
                <CanvasText style="text-sm font-medium text-site-text-muted">{groupLabel}</CanvasText>
                <Box style={tw("flex flex-row flex-1 justify-end")}>
                  <Icon node={icons["chevron-down"]} size={16} color={{ token: "text-dim" }} />
                </Box>
              </Box>
              {openMore &&
                item.children.map((c) => (
                  <NavRow key={c.href} leaf={c} pathname={pathname} nested label={t(c.tKey, { defaultValue: c.label })} />
                ))}
            </Box>
          );
        })}

        {/* Footer: sign-in or profile link */}
        <Box style={tw("flex flex-col w-full mt-4 pt-3 border-t border-site-border")}>
          {session.authed ? (
            <CanvasLink
              to={`/u/${session.handle || session.userId || ""}`}
              label={session.name ?? "Profile"}
              style={tw("flex flex-row items-center gap-2 px-2 py-2 rounded-full")}
            >
              <Icon node={icons.user} size={20} color={{ token: "text" }} />
              <CanvasText style="text-sm text-site-text">{session.name ?? t("profile", { defaultValue: "Profile" })}</CanvasText>
            </CanvasLink>
          ) : (
            <Button
              onPress={() => env.navigate("/login")}
              variant="default"
              before={<Icon node={icons.user} size={16} color={{ token: "accent-fg" }} />}
              label={t("sign-in", { defaultValue: "Sign In" })}
              mirror={false}
              style={tw("w-full")}
            >
              {t("sign-in", { defaultValue: "Sign In" })}
            </Button>
          )}
        </Box>
      </Box>

      {/* Content column — hosts the route scene */}
      <Box name="site-content" style={tw("flex flex-col flex-1 min-w-0 h-full")}>
        {children}
      </Box>
    </Box>
  );
}
