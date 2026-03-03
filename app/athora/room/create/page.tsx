"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";
import type { AthoraRoomCategory, AthoraRoomTemplate } from "@/types/athora";

const CATEGORIES: { value: AthoraRoomCategory; label: string }[] = [
  { value: "GENERAL", label: "General" },
  { value: "TECH", label: "Tech" },
  { value: "DESIGN", label: "Design" },
  { value: "BUSINESS", label: "Business" },
  { value: "HIRING", label: "Hiring" },
  { value: "GAMING", label: "Gaming" },
  { value: "MUSIC", label: "Music" },
  { value: "ART", label: "Art" },
  { value: "EDUCATION", label: "Education" },
  { value: "LOCAL", label: "Local" },
  { value: "SOCIAL", label: "Social" },
];

const TEMPLATES: { value: AthoraRoomTemplate; label: string; desc: string }[] =
  [
    { value: "OPEN_FLOOR", label: "Open Floor", desc: "Free-form open space" },
    {
      value: "CONFERENCE",
      label: "Conference",
      desc: "Structured meeting layout",
    },
    {
      value: "TRADE_SHOW",
      label: "Trade Show",
      desc: "Booths and exhibitor stands",
    },
    { value: "LOUNGE", label: "Lounge", desc: "Casual hangout space" },
    {
      value: "CLASSROOM",
      label: "Classroom",
      desc: "Presentation-style layout",
    },
  ];

export default function CreateRoomPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  const [name, setName] = useState("");
  const [category, setCategory] = useState<AthoraRoomCategory>("GENERAL");
  const [template, setTemplate] = useState<AthoraRoomTemplate>("OPEN_FLOOR");
  const [isPublic, setIsPublic] = useState(true);
  const [capacity, setCapacity] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (!lat || !lng) {
      setError("No location selected. Go back to the map and click to place a marker first.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const session = await authClient.getSession();
      if (!session?.data?.session?.token) {
        router.push("/auth/login");
        return;
      }

      const res = await fetch("/api/athora/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + crypto.randomUUID().slice(0, 8),
          category,
          template,
          isPublic,
          capacity,
          ...(lat && lng ? { latitude: parseFloat(lat), longitude: parseFloat(lng) } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to create room");
      }

      const room = await res.json();
      router.push(`/athora/room/${room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <Link
          href="/athora/map"
          className="text-gray-400 hover:text-white text-sm mb-6 inline-block transition-colors"
        >
          &larr; Back to Map
        </Link>

        <h1 className="text-2xl font-bold text-white mb-6">Create Room</h1>

        {lat && lng ? (
          <div className="mb-5 bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-3 flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-indigo-500 shrink-0" />
            <div>
              <div className="text-sm text-gray-300">Map Location</div>
              <div className="text-xs text-gray-500">
                {parseFloat(lat).toFixed(4)}, {parseFloat(lng).toFixed(4)}
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-5 bg-amber-900/30 border border-amber-700/50 rounded-lg px-4 py-3 text-sm text-amber-300">
            No location selected.{" "}
            <Link href="/athora/map" className="underline hover:text-amber-200">
              Go to the map
            </Link>{" "}
            and click to place a marker first.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Room Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Room"
              maxLength={60}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5
                         text-white placeholder:text-gray-500 focus:outline-none
                         focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as AthoraRoomCategory)
              }
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5
                         text-white focus:outline-none focus:border-indigo-500 transition-colors"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Template */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Layout
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTemplate(t.value)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    template === t.value
                      ? "border-indigo-500 bg-indigo-500/10 text-white"
                      : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-xs mt-0.5 opacity-70">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Capacity */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Capacity: {capacity}
            </label>
            <input
              type="range"
              min={5}
              max={200}
              step={5}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>

          {/* Public toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="w-4 h-4 rounded accent-indigo-500"
            />
            <span className="text-sm text-gray-300">
              Show on public map
            </span>
          </label>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700
                       disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg
                       transition-colors"
          >
            {submitting ? "Creating..." : "Create Room"}
          </button>
        </form>
      </div>
    </div>
  );
}
