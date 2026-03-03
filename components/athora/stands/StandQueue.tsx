/**
 * Athora — Stand Queue
 *
 * Real-time queue display for stands with queue enabled.
 * Shows queue position, estimated wait, and queue controls.
 */

"use client";

import { useState, useEffect } from "react";
import type { Socket } from "socket.io-client";
import type { QueueEntry } from "@/types/athora";

interface StandQueueProps {
  standId: string;
  socket: Socket;
  currentUserId: string;
  isOwner: boolean;
}

export function StandQueue({
  standId,
  socket,
  currentUserId,
  isOwner,
}: StandQueueProps) {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [inQueue, setInQueue] = useState(false);
  const [myPosition, setMyPosition] = useState<number | null>(null);

  useEffect(() => {
    const handleQueueUpdate = (data: { standId: string; queue: QueueEntry[] }) => {
      if (data.standId !== standId) return;
      setQueue(data.queue);

      const myEntry = data.queue.find((e) => e.userId === currentUserId);
      if (myEntry) {
        setInQueue(true);
        setMyPosition(myEntry.position);
      } else {
        setInQueue(false);
        setMyPosition(null);
      }
    };

    socket.on("athora:stand:queue_update", handleQueueUpdate);
    return () => {
      socket.off("athora:stand:queue_update", handleQueueUpdate);
    };
  }, [socket, standId, currentUserId]);

  const handleJoin = () => {
    socket.emit("athora:stand:queue:join", { standId });
    setInQueue(true);
  };

  const handleLeave = () => {
    socket.emit("athora:stand:queue:leave", { standId });
    setInQueue(false);
    setMyPosition(null);
  };

  const waitingCount = queue.filter((e) => e.status === "WAITING").length;
  const activeEntry = queue.find((e) => e.status === "ACTIVE");

  return (
    <div className="space-y-2">
      {/* Queue status */}
      <div className="bg-gray-800/50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-300">Queue</span>
          <span className="text-[10px] text-gray-400">
            {waitingCount} waiting
          </span>
        </div>

        {activeEntry && (
          <div className="text-[10px] text-green-400 mb-2">
            Now serving: {activeEntry.name}
          </div>
        )}

        {/* Queue list (visible to owner) */}
        {isOwner && queue.length > 0 && (
          <div className="space-y-1 mb-2">
            {queue
              .filter((e) => e.status === "WAITING")
              .slice(0, 5)
              .map((entry) => (
                <div
                  key={entry.userId}
                  className="flex items-center justify-between text-[10px] py-1 px-2 bg-gray-900/50 rounded"
                >
                  <span className="text-gray-300">
                    #{entry.position} {entry.name}
                  </span>
                </div>
              ))}
            {waitingCount > 5 && (
              <span className="text-[10px] text-gray-500">
                +{waitingCount - 5} more
              </span>
            )}
          </div>
        )}

        {/* My position */}
        {inQueue && myPosition !== null && (
          <div className="text-xs text-indigo-400 mb-2">
            Your position: #{myPosition}
            {myPosition > 1 && (
              <span className="text-gray-500 ml-1">
                (~{myPosition * 3} min wait)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Action button */}
      {inQueue ? (
        <button
          onClick={handleLeave}
          className="w-full py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400
                     border border-red-600/30 rounded-lg text-xs font-medium transition-colors"
        >
          Leave Queue
        </button>
      ) : (
        <button
          onClick={handleJoin}
          className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white
                     rounded-lg text-xs font-medium transition-colors"
        >
          Join Queue ({waitingCount} waiting)
        </button>
      )}
    </div>
  );
}
