/**
 * Athora — Stand Viewer Panel
 *
 * Slide-out panel that displays stand details, media carousel,
 * and action buttons (queue, lead capture, message).
 */

"use client";

import { useState, useEffect } from "react";
import { StandQueue } from "./StandQueue";
import { LeadCaptureForm } from "./LeadCaptureForm";
import type { Socket } from "socket.io-client";
import type { StandPayload, StandMediaPayload } from "@/types/athora";

interface StandViewerProps {
  standId: string;
  socket: Socket;
  currentUserId: string;
  roomId: string;
  onClose: () => void;
  onEdit?: (standData: {
    id: string;
    title: string;
    tagline?: string;
    description?: string;
    websiteUrl?: string;
    logoUrl?: string;
    queueEnabled?: boolean;
    leadCaptureEnabled?: boolean;
    leadCaptureFields?: { field: string; required: boolean; type?: string }[] | null;
    mediaUrls?: { url: string; type: string }[];
    posX?: number;
    posY?: number;
  }) => void;
  onMove?: (standId: string) => void;
}

interface StandDetails extends StandPayload {
  owner: { id: string; name: string; image: string | null };
  leadCaptureFields: { field: string; required: boolean; type?: string }[] | null;
}

export function StandViewer({ standId, socket, currentUserId, roomId, onClose, onEdit, onMove }: StandViewerProps) {
  const [stand, setStand] = useState<StandDetails | null>(null);
  const [activeMediaIdx, setActiveMediaIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showLeadForm, setShowLeadForm] = useState(false);

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

  const handleMessageOwner = () => {
    if (!stand) return;
    socket.emit("athora:conversation:create", {
      roomId,
      targetUserId: stand.owner.id,
      topic: `Re: ${stand.title}`,
    });
    onClose();
  };

  if (loading) {
    return (
      <div className="fixed right-0 top-0 h-full w-105 bg-gray-900 border-l border-gray-700 z-50 p-4">
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

  const isOwner = stand.owner.id === currentUserId;

  return (
    <>
      <div
        className="fixed right-0 top-0 h-full w-105 bg-gray-900 border-l
                    border-gray-700 z-50 flex flex-col overflow-hidden shadow-2xl"
        onKeyDown={(e) => e.stopPropagation()}
        onKeyUp={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            {stand.logoUrl && (
              <img src={stand.logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
            )}
            <div>
              <h2 className="text-white font-bold text-lg">{stand.title}</h2>
              {stand.tagline && <p className="text-gray-400 text-sm">{stand.tagline}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Media Carousel */}
        {stand.media.length > 0 && (
          <div className="relative bg-black aspect-video shrink-0">
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

        {/* Content */}
        <div className="p-4 flex-1 overflow-y-auto">
          {stand.owner && (
            <div className="flex items-center gap-2 mb-3">
              {stand.owner.image ? (
                <img src={stand.owner.image} alt="" className="w-6 h-6 rounded-full" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center">
                  <span className="text-white text-[10px] font-bold">
                    {(stand.owner.name?.[0] || "?").toUpperCase()}
                  </span>
                </div>
              )}
              <span className="text-sm text-gray-400">{stand.owner.name}</span>
              {isOwner && (
                <span className="text-[10px] bg-indigo-600/30 text-indigo-300 px-1.5 py-0.5 rounded-full">
                  Your Stand
                </span>
              )}
            </div>
          )}

          {/* Owner actions */}
          {isOwner && (
            <div className="flex gap-2 mb-4">
              <button
                onClick={() =>
                  onEdit?.({
                    id: stand.id,
                    title: stand.title,
                    tagline: stand.tagline || undefined,
                    description: stand.description || undefined,
                    websiteUrl: stand.websiteUrl || undefined,
                    logoUrl: stand.logoUrl || undefined,
                    queueEnabled: stand.queueEnabled,
                    leadCaptureEnabled: stand.leadCaptureEnabled,
                    leadCaptureFields: stand.leadCaptureFields,
                    mediaUrls: stand.media.map((m) => ({ url: m.url, type: m.type })),
                    posX: stand.posX,
                    posY: stand.posY,
                  })
                }
                className="flex-1 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300
                           rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
              <button
                onClick={() => onMove?.(stand.id)}
                className="flex-1 py-1.5 bg-gray-700/50 hover:bg-gray-700 text-gray-300
                           rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                Move
              </button>
            </div>
          )}

          {stand.description && (
            <p className="text-gray-300 text-sm leading-relaxed mb-4">{stand.description}</p>
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
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}

          {/* Queue section */}
          {stand.queueEnabled && (
            <div className="mt-4">
              <StandQueue
                standId={standId}
                socket={socket}
                currentUserId={currentUserId}
                isOwner={isOwner}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-gray-800 space-y-2">
          {stand.leadCaptureEnabled && (
            <button
              onClick={() => setShowLeadForm(true)}
              className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-white
                         rounded-lg text-sm font-medium transition-colors"
            >
              Leave Your Info
            </button>
          )}
          {!isOwner && (
            <button
              onClick={handleMessageOwner}
              className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300
                         rounded-lg text-sm font-medium transition-colors"
            >
              Message Stand Owner
            </button>
          )}
        </div>
      </div>

      {/* Lead Capture Form Modal */}
      {showLeadForm && (
        <LeadCaptureForm
          standId={standId}
          standTitle={stand.title}
          fields={stand.leadCaptureFields || []}
          onClose={() => setShowLeadForm(false)}
        />
      )}
    </>
  );
}

function StandMediaRenderer({ media }: { media: StandMediaPayload }) {
  switch (media.type) {
    case "IMAGE":
      return <img src={media.url} alt={media.caption || ""} className="w-full h-full object-contain" />;
    case "VIDEO":
      return <video src={media.url} controls className="w-full h-full" />;
    case "IFRAME":
      return <iframe src={media.url} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin" />;
    default:
      return <div className="flex items-center justify-center h-full text-gray-500 text-sm">Unsupported media</div>;
  }
}
