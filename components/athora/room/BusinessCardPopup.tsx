/**
 * Athora — Business Card Popup
 *
 * Floating card shown when clicking another user's avatar.
 * Fetches their business card, shows profile info, and provides
 * actions: Start Conversation, Connect, Report.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import type { Socket } from "socket.io-client";
import type { AthoraAvailability } from "@/types/athora";
import { useAthoraStore } from "@/stores/athoraStore";

interface BusinessCard {
  id: string;
  userId: string;
  headline: string;
  bio: string | null;
  company: string | null;
  role: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  githubUrl: string | null;
  customLinks: { label: string; url: string }[] | null;
  user: { name: string; image: string | null };
}

interface BusinessCardPopupProps {
  userId: string;
  socket: Socket;
  roomId: string;
  onClose: () => void;
  onReport: (userId: string) => void;
}

const AVAILABILITY_LABELS: Record<string, { label: string; color: string }> = {
  OPEN_TO_CHAT: { label: "Open to Chat", color: "bg-green-500" },
  BROWSING: { label: "Browsing", color: "bg-blue-500" },
  IN_MEETING: { label: "In Meeting", color: "bg-red-500" },
  PITCHING: { label: "Pitching", color: "bg-amber-500" },
  DO_NOT_DISTURB: { label: "Do Not Disturb", color: "bg-red-500" },
  AFK: { label: "AFK", color: "bg-gray-500" },
};

export function BusinessCardPopup({
  userId,
  socket,
  roomId,
  onClose,
  onReport,
}: BusinessCardPopupProps) {
  const [card, setCard] = useState<BusinessCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<
    "none" | "pending" | "accepted" | "sending"
  >("none");
  const [startingConvo, setStartingConvo] = useState(false);

  const user = useAthoraStore((s) => s.users.get(userId));

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Fetch card and connection status in parallel
        const [cardRes, connRes] = await Promise.all([
          fetch(`/api/athora/users/${userId}/card`),
          fetch(`/api/athora/connections?check=${userId}`),
        ]);

        if (cancelled) return;

        if (cardRes.ok) {
          setCard(await cardRes.json());
        }

        if (connRes.ok) {
          const connData = await connRes.json();
          if (connData.status) {
            setConnectionStatus(
              connData.status === "ACCEPTED" ? "accepted" : "pending"
            );
          }
        }
      } catch {
        // Card may not exist — that's fine
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleStartConversation = useCallback(() => {
    setStartingConvo(true);
    socket.emit("athora:conversation:create", {
      roomId,
      targetUserId: userId,
    });
    // Close after a beat to let the conversation create
    setTimeout(() => onClose(), 500);
  }, [socket, roomId, userId, onClose]);

  const handleConnect = useCallback(async () => {
    setConnectionStatus("sending");
    try {
      const res = await fetch("/api/athora/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverId: userId, metInRoom: roomId }),
      });
      if (res.ok) {
        setConnectionStatus("pending");
      } else {
        setConnectionStatus("none");
      }
    } catch {
      setConnectionStatus("none");
    }
  }, [userId, roomId]);

  const availability = user?.availability || "OPEN_TO_CHAT";
  const availInfo = AVAILABILITY_LABELS[availability] || AVAILABILITY_LABELS.OPEN_TO_CHAT;
  const userName = card?.user?.name || user?.name || "Unknown";
  const userImage = card?.user?.image || user?.image || null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-900/50 to-purple-900/50 p-4 pb-6 relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="flex items-center gap-3">
            {userImage ? (
              <img
                src={userImage}
                alt=""
                className="w-14 h-14 rounded-full border-2 border-indigo-400/50 object-cover"
              />
            ) : (
              <div className="w-14 h-14 rounded-full border-2 border-indigo-400/50 bg-indigo-600 flex items-center justify-center">
                <span className="text-white text-xl font-bold">
                  {userName[0]?.toUpperCase() || "?"}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-bold text-base truncate">{userName}</h3>
              {card?.headline && (
                <p className="text-gray-300 text-xs truncate">{card.headline}</p>
              )}
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`w-2 h-2 rounded-full ${availInfo.color}`} />
                <span className="text-gray-400 text-[10px]">{availInfo.label}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {loading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-3 bg-gray-800 rounded w-3/4" />
              <div className="h-3 bg-gray-800 rounded w-1/2" />
            </div>
          ) : (
            <>
              {card?.company && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span>{card.role ? `${card.role} at ${card.company}` : card.company}</span>
                </div>
              )}

              {card?.bio && (
                <p className="text-gray-300 text-xs leading-relaxed">{card.bio}</p>
              )}

              {/* Interest tags */}
              {user?.interestTags && user.interestTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {user.interestTags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] bg-indigo-900/40 text-indigo-300 px-2 py-0.5 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Social links */}
              {card && (card.websiteUrl || card.linkedinUrl || card.twitterUrl || card.githubUrl) && (
                <div className="flex items-center gap-2 pt-1">
                  {card.websiteUrl && (
                    <a href={card.websiteUrl} target="_blank" rel="noopener noreferrer"
                       className="text-gray-400 hover:text-indigo-400 transition-colors" title="Website">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                    </a>
                  )}
                  {card.linkedinUrl && (
                    <a href={card.linkedinUrl} target="_blank" rel="noopener noreferrer"
                       className="text-gray-400 hover:text-blue-400 transition-colors" title="LinkedIn">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                      </svg>
                    </a>
                  )}
                  {card.twitterUrl && (
                    <a href={card.twitterUrl} target="_blank" rel="noopener noreferrer"
                       className="text-gray-400 hover:text-sky-400 transition-colors" title="Twitter/X">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                    </a>
                  )}
                  {card.githubUrl && (
                    <a href={card.githubUrl} target="_blank" rel="noopener noreferrer"
                       className="text-gray-400 hover:text-white transition-colors" title="GitHub">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                      </svg>
                    </a>
                  )}
                </div>
              )}

              {/* Custom links */}
              {card?.customLinks && Array.isArray(card.customLinks) && card.customLinks.length > 0 && (
                <div className="space-y-1">
                  {card.customLinks.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-indigo-400 hover:text-indigo-300 transition-colors truncate"
                    >
                      {link.label || link.url}
                    </a>
                  ))}
                </div>
              )}

              {!card && !loading && (
                <p className="text-gray-500 text-xs italic">No business card set up yet</p>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-gray-800 space-y-2">
          <button
            onClick={handleStartConversation}
            disabled={startingConvo}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50
                       text-white rounded-lg text-xs font-medium transition-colors"
          >
            {startingConvo ? "Starting..." : "Start Conversation"}
          </button>

          <div className="flex gap-2">
            <button
              onClick={handleConnect}
              disabled={connectionStatus !== "none"}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                connectionStatus === "accepted"
                  ? "bg-green-600/20 text-green-400 border border-green-600/30"
                  : connectionStatus === "pending" || connectionStatus === "sending"
                    ? "bg-gray-700 text-gray-400"
                    : "bg-gray-700 hover:bg-gray-600 text-gray-300"
              }`}
            >
              {connectionStatus === "accepted"
                ? "Connected"
                : connectionStatus === "pending"
                  ? "Request Sent"
                  : connectionStatus === "sending"
                    ? "Sending..."
                    : "Connect"}
            </button>

            <button
              onClick={() => {
                onClose();
                onReport(userId);
              }}
              className="px-3 py-2 bg-gray-800 hover:bg-red-900/30 text-gray-400 hover:text-red-400
                         rounded-lg text-xs font-medium transition-colors"
            >
              Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
