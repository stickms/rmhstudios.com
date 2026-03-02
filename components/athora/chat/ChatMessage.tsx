/**
 * Athora — Chat Message Component
 */

"use client";

import type { ProximityMsgPayload, ConversationMsgPayload } from "@/types/athora";

interface ChatMessageProps {
  message: ProximityMsgPayload | ConversationMsgPayload;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex gap-2 group">
      {/* Avatar */}
      <div className="flex-shrink-0">
        {message.senderImage ? (
          <img
            src={message.senderImage}
            alt=""
            className="w-6 h-6 rounded-full object-cover"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">
              {(message.senderName?.[0] || "?").toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs font-semibold text-indigo-300 truncate">
            {message.senderName}
          </span>
          <span className="text-[10px] text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
            {time}
          </span>
        </div>
        <p className="text-sm text-gray-200 break-words leading-relaxed">
          {message.content}
        </p>
      </div>
    </div>
  );
}
