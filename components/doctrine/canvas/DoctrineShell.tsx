/**
 * DoctrineShell — canvas equivalent of the /strategies (doctrine) layout
 * (app/routes/strategies.tsx + components/doctrine/layout/nav.tsx).
 *
 * A fixed dark doctrine palette (the --doctrine-* tokens are theme-independent
 * of the site themes), an orange-accented left rail with the RMH Strategies
 * nav, and a scrolling content column that hosts the converted leaf scene.
 * Active nav state derives from the canvas env pathname. The Sahur/incident
 * live badges are read from the doctrineStore (a zustand singleton that
 * crosses the reconciler boundary).
 *
 * Deferred vs the DOM layout: the BetaBanner and SahurOverlay effect. Core
 * navigation + content hosting are complete.
 */

import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Box } from "@/canvas-ui/runtime/layout/LayoutTree";
import { tw } from "@/canvas-ui/runtime/tw";
import { CanvasText } from "@/canvas-ui/text/Text";
import { CanvasLink } from "@/canvas-ui/widgets/Link";
import { Icon } from "@/canvas-ui/widgets/Icon";
import { icons, type IconName } from "@/canvas-ui/widgets/icons";
import { useCanvasEnv } from "@/canvas-ui/runtime/env";
import { useDoctrineStore } from "@/stores/doctrineStore";

// Fixed doctrine palette (globals.css --doctrine-*). Space-free for tw().
const D = {
  bg: "#0A0A0B",
  sidebar: "#141416",
  text: "#F5F5F5",
  textDim: "rgba(255,255,255,0.6)",
  accent: "#F97316",
  hairline: "rgba(255,255,255,0.1)",
  activeBg: "rgba(255,255,255,0.1)",
};

interface DoctrineNavItem {
  to: string;
  icon: IconName;
  labelKey: string;
  label: string;
}

const NAV: DoctrineNavItem[] = [
  { to: "/strategies", icon: "home", labelKey: "nav-dashboard", label: "Dashboard" },
  { to: "/strategies/puzzles", icon: "puzzle", labelKey: "nav-puzzles", label: "Puzzles" },
  { to: "/strategies/safehouse", icon: "shield", labelKey: "nav-safehouse", label: "Safehouse" },
  { to: "/strategies/incidents", icon: "alert-triangle", labelKey: "nav-incidents", label: "Incidents" },
  { to: "/strategies/sahur", icon: "moon", labelKey: "nav-sahur", label: "Sahur" },
  { to: "/strategies/puzzles/leaderboard", icon: "trophy", labelKey: "nav-leaderboard", label: "Leaderboard" },
  { to: "/strategies/profile", icon: "user", labelKey: "nav-profile", label: "Profile" },
];

function isActive(to: string, pathname: string): boolean {
  return pathname === to || (to !== "/strategies" && pathname.startsWith(to));
}

export function DoctrineShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation("c-doctrine");
  const env = useCanvasEnv();
  const { sahurActive, activeIncidentCount } = useDoctrineStore();

  return (
    <Box name="doctrine-shell" style={tw(`flex flex-row w-full h-full bg-[${D.bg}]`)}>
      {/* Sidebar */}
      <Box
        name="doctrine-rail"
        style={{
          ...tw(`flex flex-col h-full bg-[${D.sidebar}]`),
          layout: { ...tw("flex flex-col h-full").layout, width: 224, flexShrink: 0 },
        }}
      >
        <CanvasLink to="/strategies" label="RMH Strategies" style={tw(`flex flex-col w-full p-4 gap-1 border-b border-[${D.hairline}]`)}>
          <CanvasText style={`text-sm font-bold uppercase tracking-widest text-[${D.accent}]`}>RMH Strategies</CanvasText>
        </CanvasLink>

        <Box style={tw("flex flex-col w-full py-2")}>
          {NAV.map((item) => {
            const active = isActive(item.to, env.pathname);
            const label = t(item.labelKey, { defaultValue: item.label });
            const showLive = item.label === "Sahur" && sahurActive;
            const showCount = item.label === "Incidents" && activeIncidentCount > 0;
            return (
              <CanvasLink
                key={item.to}
                to={item.to}
                label={label}
                style={tw(`flex flex-row items-center gap-3 w-full px-4 py-2.5 ${active ? `bg-[${D.activeBg}]` : ""}`)}
              >
                <Icon node={icons[item.icon]} size={18} color={active ? D.text : D.textDim} />
                <CanvasText style={`text-sm text-[${active ? D.text : D.textDim}]`}>{label}</CanvasText>
                {showLive && (
                  <Box style={tw(`flex flex-row px-1.5 py-0.5 rounded-site-sm bg-[rgba(245,158,11,0.2)]`)}>
                    <CanvasText style="text-xs font-bold text-[#fbbf24]">{t("live-badge", { defaultValue: "LIVE" })}</CanvasText>
                  </Box>
                )}
                {showCount && (
                  <Box style={tw(`flex flex-row px-1.5 py-0.5 rounded-site-sm bg-[rgba(239,68,68,0.2)]`)}>
                    <CanvasText style="text-xs font-bold text-[#f87171]">{String(activeIncidentCount)}</CanvasText>
                  </Box>
                )}
              </CanvasLink>
            );
          })}
        </Box>
      </Box>

      {/* Content column */}
      <Box name="doctrine-content" style={tw("flex flex-col flex-1 min-w-0 h-full")}>
        {children}
      </Box>
    </Box>
  );
}

/** Doctrine palette export for leaf scenes (fixed, theme-independent). */
export const DOCTRINE = D;
