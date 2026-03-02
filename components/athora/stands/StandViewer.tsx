/**
 * Athora — Stand Viewer Panel
 *
 * Slide-out panel that displays stand details, media carousel,
 * and action buttons (queue, lead capture, message).
 */

"use client";

import { useState, useEffect } from "react";
import { useAthoraSocket } from "@/lib/athora/socket";
import type { StandPayload, StandMediaPayload } from "@/types/athora";

interface StandViewerProps {
  standId: string;
  onClose: () => void;
}

interface StandDetails extends StandPayload {
  owner: { id: string; name: string; image: string | null };
}

export function StandViewer({ standId, onClose }: StandViewerProps) {
  const [stand, setStand] = useState<StandDetails | null>(null);
  const [activeMediaIdx, setActiveMediaIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const socket = useAthoraSocket();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/athora/stands/${standId}`)
      .then((r) => r.json())
      .then((data) => {
        setStand(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Notify socket server
    socket?.emit("athora:stand:visit", { standId });

    return () => {
      socket?.emit("athora:stand:leave", { standId });
    };
  }, [standId, socket]);

  if (loading) {
    return (
      <div className="fixed right-0 top-0 h-full w-[420px] bg-gray-900 border-l border-gray-700 z-50 p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-800 rounded w-2/3" />
          <div className="aspect-video bg-gray-800 rounded" />
          <div className="h-4 bg-gray-800 rounded w-full" />
          <div className="h-4 bg-gray-800 rounded w-5/6" />
        </div>
      </div>
    );
  }

  if (!stand) return null;

  return (
    <div
      className="fixed right-0 top-0 h-full w-[420px] bg-gray-900 border-l
                    border-gray-700 z-50 flex flex-col overflow-hidden shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          {stand.logoUrl && (
            <img
              src={stand.logoUrl}
              alt=""
              className="w-10 h-10 rounded-lg object-cover"
            />
          )}
          <div>
            <h2 className="text-white font-bold text-lg">{stand.title}</h2>
            {stand.tagline && (
              <p className="text-gray-400 text-sm">{stand.tagline}</p>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white p-1 transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Media Carousel */}
      {stand.media.length > 0 && (
        <div className="relative bg-black aspect-video flex-shrink-0">
          <StandMediaRenderer media={stand.media[activeMediaIdx]} />
          {stand.media.length > 1 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
              {stand.media.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveMediaIdx(i)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === activeMediaIdx ? "bg-white" : "bg-white/40"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Description */}
      <div className="p-4 flex-1 overflow-y-auto">
        {stand.owner && (
          <div className="flex items-center gap-2 mb-3">
            {stand.owner.image ? (
              <img
                src={stand.owner.image}
                alt=""
                className="w-6 h-6 rounded-full"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center">
                <span className="text-white text-[10px] font-bold">
                  {(stand.owner.name?.[0] || "?").toUpperCase()}
                </span>
              </div>
            )}
            <span className="text-sm text-gray-400">{stand.owner.name}</span>
          </div>
        )}

        {stand.description && (
          <p className="text-gray-300 text-sm leading-relaxed mb-4">
            {stand.description}
          </p>
        )}

        {stand.websiteUrl && (
          <a
            href={stand.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300
                       text-sm font-medium mb-4"
          >
            Visit Website
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-gray-800 space-y-2">
        {stand.queueEnabled && (
          <button
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white
                       rounded-lg text-sm font-medium transition-colors"
          >
            Join Queue
          </button>
        )}
        {stand.leadCaptureEnabled && (
          <button
            className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-white
                       rounded-lg text-sm font-medium transition-colors"
          >
            Leave Your Info
          </button>
        )}
        <button
          className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300
                     rounded-lg text-sm font-medium transition-colors"
        >
          Message Stand Owner
        </button>
      </div>
    </div>
  );
}

function StandMediaRenderer({ media }: { media: StandMediaPayload }) {
  switch (media.type) {
    case "IMAGE":
      return (
        <img
          src={media.url}
          alt={media.caption || ""}
          className="w-full h-full object-contain"
        />
      );
    case "VIDEO":
      return <video src={media.url} controls className="w-full h-full" />;
    case "IFRAME":
      return (
        <iframe
          src={media.url}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin"
        />
      );
    default:
      return (
        <div className="flex items-center justify-center h-full text-gray-500 text-sm">
          Unsupported media
        </div>
      );
  }
}
