/**
 * Athora — Avatar Customizer
 *
 * Allows users to pick body variant, color, and accessories
 * for their spatial networking avatar.
 */

"use client";

import { useState } from "react";
import { SpritePreview } from "./SpritePreview";

const BODY_VARIANTS = [
  { id: "default", label: "Default" },
  { id: "suit", label: "Suit" },
  { id: "casual", label: "Casual" },
  { id: "hoodie", label: "Hoodie" },
];

const BODY_COLORS = [
  "#6366f1", // Indigo
  "#ef4444", // Red
  "#22c55e", // Green
  "#3b82f6", // Blue
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#8b5cf6", // Violet
  "#14b8a6", // Teal
  "#f97316", // Orange
  "#64748b", // Slate
];

const ACCESSORIES = [
  { id: "hat-beanie", label: "Beanie" },
  { id: "hat-cap", label: "Cap" },
  { id: "glasses-round", label: "Round Glasses" },
  { id: "glasses-shades", label: "Shades" },
  { id: "headphones", label: "Headphones" },
];

interface AvatarConfig {
  bodyVariant: string;
  bodyColor: string;
  accessoryIds: string[];
}

interface AvatarCustomizerProps {
  profileImageUrl: string | null;
  initialConfig?: AvatarConfig;
  onSave: (config: AvatarConfig) => void;
}

export function AvatarCustomizer({
  profileImageUrl,
  initialConfig,
  onSave,
}: AvatarCustomizerProps) {
  const [config, setConfig] = useState<AvatarConfig>({
    bodyVariant: initialConfig?.bodyVariant || "default",
    bodyColor: initialConfig?.bodyColor || "#6366f1",
    accessoryIds: initialConfig?.accessoryIds || [],
  });

  const toggleAccessory = (accId: string) => {
    const accessories = config.accessoryIds.includes(accId)
      ? config.accessoryIds.filter((id) => id !== accId)
      : [...config.accessoryIds, accId];
    setConfig({ ...config, accessoryIds: accessories });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Preview */}
        <div className="flex flex-col items-center">
          <div className="bg-gray-800 rounded-xl p-8 w-full aspect-square flex items-center justify-center">
            <SpritePreview
              profileImageUrl={profileImageUrl}
              config={config}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-6">
          {/* Body Variant */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-2">
              Body Style
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {BODY_VARIANTS.map((variant) => (
                <button
                  key={variant.id}
                  onClick={() =>
                    setConfig({ ...config, bodyVariant: variant.id })
                  }
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    config.bodyVariant === variant.id
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  }`}
                >
                  {variant.label}
                </button>
              ))}
            </div>
          </div>

          {/* Body Color */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-2">
              Color
            </h3>
            <div className="flex flex-wrap gap-2">
              {BODY_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setConfig({ ...config, bodyColor: color })}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    config.bodyColor === color
                      ? "border-white scale-110"
                      : "border-transparent hover:border-gray-500"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Accessories */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-2">
              Accessories
            </h3>
            <div className="space-y-1.5">
              {ACCESSORIES.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => toggleAccessory(acc.id)}
                  className={`w-full px-3 py-2 rounded-lg text-sm text-left font-medium transition-colors ${
                    config.accessoryIds.includes(acc.id)
                      ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/50"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700 border border-transparent"
                  }`}
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>

          {/* Save */}
          <button
            onClick={() => onSave(config)}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white
                       rounded-lg font-medium transition-colors"
          >
            Save Avatar
          </button>
        </div>
      </div>
    </div>
  );
}
