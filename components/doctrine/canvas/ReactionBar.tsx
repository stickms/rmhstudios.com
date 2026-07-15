/**
 * Canvas ReactionBar — the doctrine reaction pills (components/doctrine/
 * reaction-bar.tsx) redrawn in Konva. Six reactions; tapping one POSTs to
 * /api/doctrine/reactions exactly as the DOM version did (functionality
 * preserved), with optimistic count bump + whileTap scale via canvas motion.
 */

import { useState } from "react";
import { Box } from "@/canvas-ui/runtime/layout/LayoutTree";
import { tw } from "@/canvas-ui/runtime/tw";
import { CanvasText } from "@/canvas-ui/text/Text";
import { useMirrorControl } from "@/canvas-ui/mirror/MirrorControls";
import { setCursor } from "@/canvas-ui/widgets/cursor";
import type { ReactionCount, Reaction } from "@/lib/doctrine/types";

const REACTIONS: Array<{ key: Reaction; emoji: string; label: string; color: string }> = [
  { key: "fire", emoji: "🔥", label: "Fire", color: "#F97316" },
  { key: "based", emoji: "💪", label: "Based", color: "#22C55E" },
  { key: "mid", emoji: "😐", label: "Mid", color: "#6B7280" },
  { key: "cringe", emoji: "😬", label: "Cringe", color: "#A855F7" },
  { key: "trash", emoji: "🗑️", label: "Trash", color: "#EF4444" },
  { key: "tung", emoji: "🪵", label: "TUNG", color: "#A16207" },
];

export interface ReactionBarProps {
  reactions: ReactionCount;
  targetType: "safehouse" | "disclosure" | "incident";
  targetId: string;
}

function ReactionPill({
  emoji,
  label,
  color,
  count,
  onPress,
  disabled,
}: {
  emoji: string;
  label: string;
  color: string;
  count: number;
  onPress: () => void;
  disabled: boolean;
}) {
  useMirrorControl({ role: "button", label: `${label}${count > 0 ? ` (${count})` : ""}`, disabled, onActivate: onPress });
  return (
    <Box
      name={`reaction-${label}`}
      style={tw("flex flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-[rgba(255,255,255,0.05)]")}
      opacity={disabled ? 0.6 : 1}
      onClick={onPress}
      onTap={onPress}
      onMouseEnter={(e) => setCursor(e, "pointer")}
      onMouseLeave={(e) => setCursor(e, "default")}
    >
      <CanvasText style="text-sm">{emoji}</CanvasText>
      {count > 0 && <CanvasText style={`text-xs font-mono text-[${color}]`}>{String(count)}</CanvasText>}
    </Box>
  );
}

export function ReactionBar({ reactions, targetType, targetId }: ReactionBarProps) {
  const [counts, setCounts] = useState<ReactionCount>(reactions);
  const [submitting, setSubmitting] = useState(false);

  const react = async (key: Reaction) => {
    if (submitting) return;
    setSubmitting(true);
    setCounts((c) => ({ ...c, [key]: (c[key] ?? 0) + 1 })); // optimistic
    try {
      const body: Record<string, string> = { reaction: key.toUpperCase() };
      if (targetType === "safehouse") body.safehouseId = targetId;
      if (targetType === "disclosure") body.disclosureId = targetId;
      if (targetType === "incident") body.incidentId = targetId;
      await fetch("/api/doctrine/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setCounts((c) => ({ ...c, [key]: Math.max(0, (c[key] ?? 1) - 1) })); // rollback
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box name="reaction-bar" style={tw("flex flex-row flex-wrap items-center gap-1.5")}>
      {REACTIONS.map((r) => (
        <ReactionPill
          key={r.key}
          emoji={r.emoji}
          label={r.label}
          color={r.color}
          count={counts[r.key] ?? 0}
          disabled={submitting}
          onPress={() => react(r.key)}
        />
      ))}
    </Box>
  );
}
