/**
 * Athora — Business Card Editor Page
 *
 * Page for creating/editing your business card.
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

interface CardData {
  headline: string;
  bio: string;
  company: string;
  role: string;
  websiteUrl: string;
  linkedinUrl: string;
  twitterUrl: string;
  githubUrl: string;
}

export default function BusinessCardEditorPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [form, setForm] = useState<CardData>({
    headline: "",
    bio: "",
    company: "",
    role: "",
    websiteUrl: "",
    linkedinUrl: "",
    twitterUrl: "",
    githubUrl: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const session = await authClient.getSession();
      if (!session?.data?.user) {
        router.push("/auth/login");
        return;
      }
      const uid = session.data.user.id;
      setUserId(uid);

      try {
        const res = await fetch(`/api/athora/users/${uid}/card`);
        if (res.ok) {
          const card = await res.json();
          setForm({
            headline: card.headline || "",
            bio: card.bio || "",
            company: card.company || "",
            role: card.role || "",
            websiteUrl: card.websiteUrl || "",
            linkedinUrl: card.linkedinUrl || "",
            twitterUrl: card.twitterUrl || "",
            githubUrl: card.githubUrl || "",
          });
        }
      } catch {
        // No card yet, use defaults
      }
      setLoading(false);
    }
    load();
  }, [router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/athora/users/${userId}/card`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
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
          <h1 className="text-xl font-bold">Business Card</h1>
          {saved && (
            <span className="text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded-full">
              Saved!
            </span>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Headline *
            </label>
            <input
              type="text"
              value={form.headline}
              onChange={(e) => setForm({ ...form, headline: e.target.value })}
              maxLength={120}
              required
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2
                         text-white text-sm focus:outline-none focus:border-indigo-500"
              placeholder='e.g. "Senior Engineer @ Acme"'
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Company</label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2
                           text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Role</label>
              <input
                type="text"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2
                           text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Bio</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              maxLength={500}
              rows={3}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2
                         text-white text-sm focus:outline-none focus:border-indigo-500 resize-none"
              placeholder="Tell people about yourself..."
            />
          </div>

          <div className="border-t border-gray-800 pt-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Links</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Website</label>
                <input
                  type="url"
                  value={form.websiteUrl}
                  onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2
                             text-white text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">LinkedIn</label>
                <input
                  type="url"
                  value={form.linkedinUrl}
                  onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2
                             text-white text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="https://linkedin.com/in/..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Twitter / X</label>
                <input
                  type="url"
                  value={form.twitterUrl}
                  onChange={(e) => setForm({ ...form, twitterUrl: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2
                             text-white text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="https://x.com/..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">GitHub</label>
                <input
                  type="url"
                  value={form.githubUrl}
                  onChange={(e) => setForm({ ...form, githubUrl: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2
                             text-white text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="https://github.com/..."
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={!form.headline.trim() || saving}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50
                       text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? "Saving..." : "Save Card"}
          </button>
        </form>
      </div>
    </div>
  );
}
