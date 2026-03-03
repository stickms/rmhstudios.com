/**
 * Athora — Avatar Customizer Page
 *
 * Dedicated page for customizing avatar appearance.
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { AvatarCustomizer } from "@/components/athora/avatar/AvatarCustomizer";

export default function AvatarSettingsPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<{
    bodyVariant: string;
    bodyColor: string;
    accessoryIds: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const session = await authClient.getSession();
      if (!session?.data?.user) {
        router.push("/auth/login");
        return;
      }
      // Load current avatar config from user profile
      const config = (session.data.user as any).avatarConfig;
      if (config && typeof config === "object") {
        setCurrentConfig(config as any);
      }
      setLoading(false);
    }
    load();
  }, [router]);

  const handleSave = async (data: {
    bodyVariant: string;
    bodyColor: string;
    accessoryIds: string[];
  }) => {
    setSaving(true);
    try {
      const res = await fetch("/api/athora/users/me/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
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
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold">Customize Avatar</h1>
          {saved && (
            <span className="text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded-full">
              Saved!
            </span>
          )}
        </div>

        <AvatarCustomizer
          initialConfig={currentConfig || undefined}
          onSave={handleSave}
          saving={saving}
        />
      </div>
    </div>
  );
}
