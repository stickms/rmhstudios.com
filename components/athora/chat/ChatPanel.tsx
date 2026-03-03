/**
 * Athora — Chat Panel
 *
 * Right sidebar for proximity and conversation messages.
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { useAthoraStore } from "@/stores/athoraStore";
import { ChatMessage } from "./ChatMessage";
import type { Socket } from "socket.io-client";

type ChatTab = "proximity" | "conversation";

interface ChatPanelProps {
  socket: Socket | null;
  roomId: string;
}

export function ChatPanel({ socket, roomId }: ChatPanelProps) {
  const [activeTab, setActiveTab] = useState<ChatTab>("proximity");
  const [message, setMessage] = useState("");
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const proximityMessages = useAthoraStore((s) => s.proximityMessages);
  const conversationMessages = useAthoraStore((s) => s.conversationMessages);
  const activeConversationId = useAthoraStore((s) => s.activeConversationId);

  const currentMessages =
    activeTab === "proximity"
      ? proximityMessages
      : activeConversationId
        ? conversationMessages.get(activeConversationId) ?? []
        : [];

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages.length]);

  const handleSend = () => {
    if (!message.trim() || !socket) return;

    if (activeTab === "proximity") {
      socket.emit("athora:chat:proximity", {
        roomId,
        content: message.trim(),
      });
    } else if (activeConversationId) {
      socket.emit("athora:chat:conversation", {
        conversationId: activeConversationId,
        content: message.trim(),
      });
    }

    setMessage("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="absolute bottom-4 right-4 z-20 bg-gray-900/90 backdrop-blur-sm
                   border border-gray-700 rounded-full px-4 py-2 text-white text-sm
                   hover:bg-gray-800 transition-colors flex items-center gap-2"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        Chat
        {proximityMessages.length > 0 && (
          <span className="bg-indigo-500 rounded-full w-2 h-2" />
        )}
      </button>
    );
  }

  return (
    <div
      className="absolute bottom-0 right-0 z-20 w-80 h-96
                    bg-gray-900/95 backdrop-blur-sm border-l border-t
                    border-gray-700 flex flex-col"
    >
      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab("proximity")}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === "proximity"
              ? "text-white border-b-2 border-indigo-500"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Proximity
        </button>
        <button
          onClick={() => setActiveTab("conversation")}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === "conversation"
              ? "text-white border-b-2 border-indigo-500"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Conversation
        </button>
        <button
          onClick={() => setIsMinimized(true)}
          className="px-2 text-gray-500 hover:text-gray-300"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {currentMessages.length === 0 && (
          <div className="text-gray-500 text-xs text-center mt-8">
            {activeTab === "proximity"
              ? "Move near someone to chat!"
              : "Join a conversation to see messages"}
          </div>
        )}
        {currentMessages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeTab === "proximity"
                ? "Say something nearby..."
                : "Type a message..."
            }
            maxLength={500}
            className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5
                       text-white text-sm placeholder:text-gray-500
                       focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleSend}
            disabled={!message.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700
                       disabled:cursor-not-allowed text-white rounded-lg px-3
                       transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
