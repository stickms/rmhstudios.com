/**
 * Athora — Connections Page
 *
 * Lists all connections: pending, accepted.
 * Accept/decline incoming requests.
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

interface Connection {
  id: string;
  senderId: string;
  receiverId: string;
  status: string;
  note: string | null;
  metInRoom: string | null;
  createdAt: string;
  sender: { id: string; name: string; image: string | null };
  receiver: { id: string; name: string; image: string | null };
}

type Tab = "all" | "pending" | "sent";

export default function ConnectionsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    async function load() {
      const session = await authClient.getSession();
      if (!session?.data?.user) {
        router.push("/auth/login");
        return;
      }
      setUserId(session.data.user.id);

      try {
        const res = await fetch("/api/athora/connections");
        if (res.ok) {
          setConnections(await res.json());
        }
      } catch {
        // silently fail
      }
      setLoading(false);
    }
    load();
  }, [router]);

  const handleRespond = async (connId: string, status: string) => {
    try {
      const res = await fetch(`/api/athora/connections/${connId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setConnections((prev) =>
          prev.map((c) => (c.id === connId ? { ...c, status } : c))
        );
      }
    } catch {
      // silently fail
    }
  };

  const filtered = connections.filter((c) => {
    if (tab === "pending") return c.status === "PENDING" && c.receiverId === userId;
    if (tab === "sent") return c.status === "PENDING" && c.senderId === userId;
    return c.status === "ACCEPTED";
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-pulse text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  const pendingCount = connections.filter(
    (c) => c.status === "PENDING" && c.receiverId === userId
  ).length;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold">Connections</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-gray-900 rounded-lg p-1">
          {([
            { key: "all", label: "Connected" },
            { key: "pending", label: `Incoming${pendingCount > 0 ? ` (${pendingCount})` : ""}` },
            { key: "sent", label: "Sent" },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === t.key
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">
              {tab === "all"
                ? "No connections yet. Start networking!"
                : tab === "pending"
                  ? "No pending requests"
                  : "No sent requests"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((conn) => {
              const other =
                conn.senderId === userId ? conn.receiver : conn.sender;
              const isPending = conn.status === "PENDING";
              const isIncoming = isPending && conn.receiverId === userId;

              return (
                <div
                  key={conn.id}
                  className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center gap-3"
                >
                  {other.image ? (
                    <img
                      src={other.image}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
                      <span className="text-white text-sm font-bold">
                        {other.name?.[0]?.toUpperCase() || "?"}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {other.name}
                    </p>
                    {conn.note && (
                      <p className="text-gray-500 text-[10px] truncate">
                        {conn.note}
                      </p>
                    )}
                  </div>

                  {isIncoming ? (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleRespond(conn.id, "ACCEPTED")}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white
                                   rounded-lg text-[10px] font-medium transition-colors"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleRespond(conn.id, "DECLINED")}
                        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300
                                   rounded-lg text-[10px] font-medium transition-colors"
                      >
                        Decline
                      </button>
                    </div>
                  ) : isPending ? (
                    <span className="text-[10px] text-gray-500">Pending</span>
                  ) : (
                    <span className="text-[10px] text-green-400">Connected</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
