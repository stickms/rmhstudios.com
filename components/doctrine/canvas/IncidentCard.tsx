/**
 * Canvas IncidentCard — components/doctrine/incidents/incident-card.tsx in
 * Konva: severity/status badges, divisiveness badge, report count + date,
 * title, 2-line narrative, and the functional canvas ReactionBar.
 */

import { Box } from "@/canvas-ui/runtime/layout/LayoutTree";
import { tw } from "@/canvas-ui/runtime/tw";
import { CanvasText } from "@/canvas-ui/text/Text";
import { ReactionBar } from "./ReactionBar";
import type { ReactionCount } from "@/lib/doctrine/types";

const SEVERITY_COLORS: Record<string, string> = {
  COSMETIC: "#6B7280",
  DEGRADED: "#F59E0B",
  CRITICAL: "#EF4444",
  CATASTROPHIC: "#DC2626",
};
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: "ACTIVE", color: "#EF4444" },
  MITIGATED: { label: "MITIGATED", color: "#F59E0B" },
  RESOLVED: { label: "RESOLVED", color: "#22C55E" },
  LEGENDARY: { label: "LEGENDARY", color: "#A855F7" },
};

export interface CanvasIncident {
  id: string;
  codename: string;
  severity: string;
  title: string;
  narrative: string;
  status: string;
  reportCount: number;
  dateLabel: string;
  di: number;
  diColor: string;
  reactions: ReactionCount;
}

function Pill({ text, color }: { text: string; color: string }) {
  return (
    <Box style={tw(`flex flex-row px-1.5 py-0.5 rounded-site-sm bg-[${hexA(color, 0.08)}]`)}>
      <CanvasText style={`text-xs font-mono uppercase text-[${color}]`}>{text}</CanvasText>
    </Box>
  );
}

/** color + alpha → rgba() (tw arbitrary values must be space-free). */
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function IncidentCard({ incident }: { incident: CanvasIncident }) {
  const sev = SEVERITY_COLORS[incident.severity] ?? "#EF4444";
  const status = STATUS_LABELS[incident.status] ?? { label: incident.status, color: "#6B7280" };

  return (
    <Box
      name="incident-card"
      style={tw(`flex flex-col w-full gap-3 p-4 rounded-site bg-[#141416] border border-[${incident.status === "ACTIVE" ? hexA(sev, 0.19) : "rgba(255,255,255,0.06)"}]`)}
    >
      {/* Header badges */}
      <Box style={tw("flex flex-row flex-wrap items-center gap-2")}>
        <CanvasText style={`text-xs font-mono text-[${sev}]`}>{incident.codename}</CanvasText>
        <Pill text={incident.severity} color={sev} />
        <Pill text={status.label} color={status.color} />
        {incident.di > 0 && <Pill text={`${incident.di} DI`} color={incident.diColor} />}
        <Box style={tw("flex flex-row flex-1 justify-end items-center gap-2")}>
          <CanvasText style="text-xs text-[rgba(255,255,255,0.3)]">{`💬 ${incident.reportCount}`}</CanvasText>
          <CanvasText style="text-xs text-[rgba(255,255,255,0.3)]">{`🕐 ${incident.dateLabel}`}</CanvasText>
        </Box>
      </Box>

      {/* Content */}
      <CanvasText style="text-base font-semibold text-[rgba(255,255,255,0.9)]">{incident.title}</CanvasText>
      <CanvasText style="text-sm text-[rgba(255,255,255,0.5)]" maxLines={2}>{incident.narrative}</CanvasText>

      {/* Reactions */}
      <ReactionBar reactions={incident.reactions} targetType="incident" targetId={incident.id} />
    </Box>
  );
}
