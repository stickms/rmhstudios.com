/**
 * Athora — Conversation Join Request Modal
 *
 * Shown when someone requests to join your conversation
 * or when someone invites you to chat.
 */

"use client";

import type { JoinRequestPayload } from "@/types/athora";
import type { Socket } from "socket.io-client";

interface ConversationRequestModalProps {
  request: JoinRequestPayload;
  socket: Socket | null;
  onClose: () => void;
}

export function ConversationRequestModal({
  request,
  socket,
  onClose,
}: ConversationRequestModalProps) {
  const handleAccept = () => {
    socket?.emit("athora:conversation:respond", {
      requestId: request.requestId,
      accept: true,
    });
    onClose();
  };

  const handleDecline = () => {
    socket?.emit("athora:conversation:respond", {
      requestId: request.requestId,
      accept: false,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-80 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          {request.requester.image ? (
            <img
              src={request.requester.image}
              alt=""
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
              <span className="text-white font-bold">
                {(request.requester.name?.[0] || "?").toUpperCase()}
              </span>
            </div>
          )}
          <div>
            <h3 className="text-white font-semibold">
              {request.requester.name}
            </h3>
            <p className="text-gray-400 text-xs">wants to chat</p>
          </div>
        </div>

        {request.topic && (
          <div className="bg-gray-800 rounded-lg px-3 py-2 mb-3">
            <span className="text-xs text-gray-400">Topic:</span>
            <p className="text-sm text-white">{request.topic}</p>
          </div>
        )}

        {request.message && (
          <p className="text-sm text-gray-300 mb-4 italic">
            &ldquo;{request.message}&rdquo;
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleDecline}
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300
                       rounded-lg text-sm font-medium transition-colors"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white
                       rounded-lg text-sm font-medium transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
