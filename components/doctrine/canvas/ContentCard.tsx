/**
 * Canvas ContentCard — components/doctrine/safehouse/content-card.tsx in
 * Konva: type + tier + DI badges, date, title, 3-line body, functional
 * ReactionBar (targetType "safehouse"). DI is precomputed by the route.
 */

import { Box } from "@/canvas-ui/runtime/layout/LayoutTree";
import { tw } from "@/canvas-ui/runtime/tw";
import { CanvasText } from "@/canvas-ui/text/Text";
import { ReactionBar } from "./ReactionBar";
import { TIERS } from "@/lib/doctrine/constants";
import type { ReactionCount } from "@/lib/doctrine/types";

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  DEV_LOG: { label: "Dev Log", color: "#3B82F6" },
  BUILD: { label: "Build", color: "#22C55E" },
  POSTMORTEM: { label: "Postmortem", color: "#EF4444" },
  DECISION: { label: "Decision", color: "#A855F7" },
  RAW_FOOTAGE: { label: "Raw Footage", color: "#F59E0B" },
  FINANCIAL: { label: "Financial", color: "#14B8A6" },
  VOTE: { label: "Vote", color: "#F97316" },
};

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export interface CanvasContent {
  id: string;
  type: string;
  title: string;
  body: string;
  minTier: string;
  dateLabel: string;
  di: number;
  diColor: string;
  reactions: ReactionCount;
}

function Pill({ text, color }: { text: string; color: string }) {
  return (
    <Box style={tw(`flex flex-row px-1.5 py-0.5 rounded-site-sm bg-[${hexA(color, 0.08)}]`)}>
      <CanvasText style={`text-xs font-mono text-[${color}]`}>{text}</CanvasText>
    </Box>
  );
}

export function ContentCard({ item }: { item: CanvasContent }) {
  const typeInfo = TYPE_LABELS[item.type] ?? { label: item.type, color: "#6B7280" };
  const tier = TIERS[item.minTier as keyof typeof TIERS] as { name?: string; color?: string } | undefined;

  return (
    <Box name="content-card" style={tw("flex flex-col w-full gap-3 p-4 rounded-site bg-[#141416] border border-[rgba(255,255,255,0.06)]")}>
      <Box style={tw("flex flex-row flex-wrap items-center gap-2")}>
        <Pill text={typeInfo.label} color={typeInfo.color} />
        {item.minTier !== "PUBLIC" && <Pill text={tier?.name ?? item.minTier} color={tier?.color ?? "#6B7280"} />}
        {item.di > 0 && <Pill text={`${item.di} DI`} color={item.diColor} />}
        {item.dateLabel && (
          <Box style={tw("flex flex-row flex-1 justify-end")}>
            <CanvasText style="text-xs text-[rgba(255,255,255,0.3)]">{item.dateLabel}</CanvasText>
          </Box>
        )}
      </Box>
      <CanvasText style="text-base font-semibold text-[rgba(255,255,255,0.9)]">{item.title}</CanvasText>
      <CanvasText style="text-sm text-[rgba(255,255,255,0.5)]" maxLines={3}>{item.body}</CanvasText>
      <ReactionBar reactions={item.reactions} targetType="safehouse" targetId={item.id} />
    </Box>
  );
}
