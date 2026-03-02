/**
 * Athora — Stand Editor
 *
 * Modal form for creating or editing a stand within a room.
 */

"use client";

import { useState } from "react";

interface StandEditorProps {
  roomId: string;
  initialData?: {
    id?: string;
    title?: string;
    tagline?: string;
    description?: string;
    websiteUrl?: string;
    logoUrl?: string;
  };
  onSave: (data: StandFormData) => void;
  onClose: () => void;
}

interface StandFormData {
  roomId: string;
  title: string;
  tagline: string;
  description: string;
  websiteUrl: string;
  logoUrl: string;
}

export function StandEditor({
  roomId,
  initialData,
  onSave,
  onClose,
}: StandEditorProps) {
  const [form, setForm] = useState({
    title: initialData?.title || "",
    tagline: initialData?.tagline || "",
    description: initialData?.description || "",
    websiteUrl: initialData?.websiteUrl || "",
    logoUrl: initialData?.logoUrl || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    setSaving(true);
    try {
      onSave({
        roomId,
        title: form.title.trim(),
        tagline: form.tagline.trim(),
        description: form.description.trim(),
        websiteUrl: form.websiteUrl.trim(),
        logoUrl: form.logoUrl.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-white font-bold text-lg">
            {initialData?.id ? "Edit Stand" : "Create Stand"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              maxLength={100}
              required
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2
                         text-white text-sm focus:outline-none focus:border-indigo-500"
              placeholder="Your stand name"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Tagline
            </label>
            <input
              type="text"
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              maxLength={200}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2
                         text-white text-sm focus:outline-none focus:border-indigo-500"
              placeholder="Short description"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              maxLength={2000}
              rows={3}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2
                         text-white text-sm focus:outline-none focus:border-indigo-500 resize-none"
              placeholder="Tell people about your stand..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Website URL
            </label>
            <input
              type="url"
              value={form.websiteUrl}
              onChange={(e) =>
                setForm({ ...form, websiteUrl: e.target.value })
              }
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2
                         text-white text-sm focus:outline-none focus:border-indigo-500"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Logo URL
            </label>
            <input
              type="url"
              value={form.logoUrl}
              onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2
                         text-white text-sm focus:outline-none focus:border-indigo-500"
              placeholder="https://..."
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300
                         rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!form.title.trim() || saving}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white
                         rounded-lg text-sm font-medium transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : initialData?.id ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
