/**
 * Athora — Profile / Passport Page
 *
 * Shows user's passport (rooms visited), interest tags, and links
 * to avatar customizer and business card editor.
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    async function load() {
      const session = await authClient.getSession();
      if (!session?.data?.user) {
        router.push("/auth/login");
        return;
      }
      setUser(session.data.user);
      // Tags and status would come from extended user data
      setLoading(false);
    }
    load();
  }, [router]);

  const handleAddTag = () => {
    const trimmed = newTag.trim();
    if (trimmed && tags.length < 10 && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setNewTag("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-pulse text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

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
          <h1 className="text-xl font-bold">Profile</h1>
        </div>

        {/* Profile header */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-4">
            {user?.image ? (
              <img src={user.image} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-indigo-500/30" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center border-2 border-indigo-500/30">
                <span className="text-white text-2xl font-bold">
                  {user?.name?.[0]?.toUpperCase() || "?"}
                </span>
              </div>
            )}
            <div>
              <h2 className="text-white font-bold text-lg">{user?.name}</h2>
              <p className="text-gray-400 text-xs">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Link
            href="/athora/settings/avatar"
            className="bg-gray-900 border border-gray-800 rounded-lg p-3 hover:border-indigo-500/30 transition-colors group"
          >
            <div className="text-indigo-400 text-sm font-medium group-hover:text-indigo-300">
              Customize Avatar
            </div>
            <p className="text-gray-500 text-[10px] mt-0.5">Body, color, accessories</p>
          </Link>
          <Link
            href="/athora/settings/card"
            className="bg-gray-900 border border-gray-800 rounded-lg p-3 hover:border-indigo-500/30 transition-colors group"
          >
            <div className="text-indigo-400 text-sm font-medium group-hover:text-indigo-300">
              Business Card
            </div>
            <p className="text-gray-500 text-[10px] mt-0.5">Bio, links, headline</p>
          </Link>
          <Link
            href="/athora/connections"
            className="bg-gray-900 border border-gray-800 rounded-lg p-3 hover:border-indigo-500/30 transition-colors group"
          >
            <div className="text-indigo-400 text-sm font-medium group-hover:text-indigo-300">
              Connections
            </div>
            <p className="text-gray-500 text-[10px] mt-0.5">Your network</p>
          </Link>
          <Link
            href="/athora/map"
            className="bg-gray-900 border border-gray-800 rounded-lg p-3 hover:border-indigo-500/30 transition-colors group"
          >
            <div className="text-indigo-400 text-sm font-medium group-hover:text-indigo-300">
              World Map
            </div>
            <p className="text-gray-500 text-[10px] mt-0.5">Explore rooms</p>
          </Link>
        </div>

        {/* Interest Tags */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Interest Tags</h3>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 text-[10px] bg-indigo-900/40 text-indigo-300 px-2 py-1 rounded-full"
              >
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="text-indigo-400 hover:text-indigo-200"
                >
                  x
                </button>
              </span>
            ))}
            {tags.length === 0 && (
              <span className="text-gray-500 text-[10px]">No tags yet</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
              maxLength={30}
              className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5
                         text-white text-xs focus:outline-none focus:border-indigo-500"
              placeholder="e.g. AI/ML, Design, Hiring..."
            />
            <button
              onClick={handleAddTag}
              disabled={!newTag.trim()}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50
                         text-white rounded-lg text-xs font-medium transition-colors"
            >
              Add
            </button>
          </div>
        </div>

        {/* Status message */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Status Message</h3>
          <input
            type="text"
            value={statusMessage}
            onChange={(e) => setStatusMessage(e.target.value)}
            maxLength={140}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2
                       text-white text-sm focus:outline-none focus:border-indigo-500"
            placeholder="What are you up to?"
          />
          <p className="text-gray-500 text-[10px] mt-1 text-right">
            {statusMessage.length}/140
          </p>
        </div>
      </div>
    </div>
  );
}
