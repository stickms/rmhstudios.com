/**
 * Athora — Sprite Preview
 *
 * Live preview of the composited avatar sprite.
 * Shows a circular avatar preview with the body color tint.
 */

"use client";

interface SpritePreviewProps {
  profileImageUrl: string | null;
  config: {
    bodyVariant: string;
    bodyColor: string;
    accessoryIds: string[];
  };
}

export function SpritePreview({ profileImageUrl, config }: SpritePreviewProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      {/* Avatar circle */}
      <div
        className="relative w-32 h-32 rounded-full border-4 overflow-hidden shadow-lg"
        style={{ borderColor: config.bodyColor }}
      >
        {profileImageUrl ? (
          <img
            src={profileImageUrl}
            alt="Avatar preview"
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: config.bodyColor }}
          >
            <svg
              className="w-16 h-16 text-white/60"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </div>
        )}

        {/* Color overlay ring */}
        <div
          className="absolute inset-0 rounded-full border-4 pointer-events-none"
          style={{ borderColor: `${config.bodyColor}40` }}
        />
      </div>

      {/* Info */}
      <div className="text-center">
        <p className="text-sm text-gray-300">
          {config.bodyVariant.charAt(0).toUpperCase() +
            config.bodyVariant.slice(1)}{" "}
          style
        </p>
        {config.accessoryIds.length > 0 && (
          <p className="text-xs text-gray-500 mt-1">
            {config.accessoryIds.length} accessori
            {config.accessoryIds.length === 1 ? "e" : "es"}
          </p>
        )}
      </div>

      {/* Walking indicator dots */}
      <div className="flex gap-1">
        {["S", "W", "N", "E"].map((dir) => (
          <div
            key={dir}
            className="w-6 h-6 rounded bg-gray-700 flex items-center justify-center"
          >
            <span className="text-[9px] text-gray-400 font-mono">{dir}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
