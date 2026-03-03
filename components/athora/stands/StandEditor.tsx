/**
 * Athora — Stand Editor
 *
 * Modal form for creating or editing a stand within a room.
 */

"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";

interface LeadCaptureField {
  field: string;
  required: boolean;
  type?: string;
}

interface StandEditorProps {
  roomId: string;
  initialData?: {
    id?: string;
    title?: string;
    tagline?: string;
    description?: string;
    websiteUrl?: string;
    logoUrl?: string;
    queueEnabled?: boolean;
    leadCaptureEnabled?: boolean;
    leadCaptureFields?: LeadCaptureField[] | null;
    mediaUrls?: { url: string; type: string }[];
    posX?: number;
    posY?: number;
  };
  onSave: (data: StandFormData) => void;
  onClose: () => void;
}

export interface StandFormData {
  roomId: string;
  title: string;
  tagline: string;
  description: string;
  websiteUrl: string;
  logoUrl: string;
  queueEnabled: boolean;
  leadCaptureEnabled: boolean;
  leadCaptureFields: LeadCaptureField[];
  mediaUrls: { url: string; type: string }[];
  posX?: number;
  posY?: number;
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
    queueEnabled: initialData?.queueEnabled ?? false,
    leadCaptureEnabled: initialData?.leadCaptureEnabled ?? false,
  });
  const [leadFields, setLeadFields] = useState<LeadCaptureField[]>(
    initialData?.leadCaptureFields || [
      { field: "Name", required: true },
      { field: "Email", required: true },
    ]
  );
  const [mediaUrls, setMediaUrls] = useState<{ url: string; type: string }[]>(
    initialData?.mediaUrls || []
  );
  const [newFieldName, setNewFieldName] = useState("");
  const [saving, setSaving] = useState(false);

  // Logo crop state
  const [showCrop, setShowCrop] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [cropZoom, setCropZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleCropSave = async () => {
    if (!croppedAreaPixels || !form.logoUrl) return;
    setUploading(true);
    try {
      const blob = await getCroppedImg(form.logoUrl, croppedAreaPixels);
      if (!blob) return;

      const formData = new FormData();
      formData.append("file", blob, "stand-logo.png");
      const res = await fetch("/api/athora/uploads", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const { url } = await res.json();
        setForm((f) => ({ ...f, logoUrl: url }));
      }
      setShowCrop(false);
    } catch (e) {
      console.error("Crop failed:", e);
    } finally {
      setUploading(false);
    }
  };

  const handleAddMedia = () => {
    setMediaUrls([...mediaUrls, { url: "", type: "IMAGE" }]);
  };

  const handleRemoveMedia = (index: number) => {
    setMediaUrls(mediaUrls.filter((_, i) => i !== index));
  };

  const handleAddLeadField = () => {
    const trimmed = newFieldName.trim();
    if (trimmed && !leadFields.some((f) => f.field === trimmed)) {
      setLeadFields([...leadFields, { field: trimmed, required: false }]);
      setNewFieldName("");
    }
  };

  const handleRemoveLeadField = (field: string) => {
    setLeadFields(leadFields.filter((f) => f.field !== field));
  };

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
        queueEnabled: form.queueEnabled,
        leadCaptureEnabled: form.leadCaptureEnabled,
        leadCaptureFields: form.leadCaptureEnabled ? leadFields : [],
        mediaUrls: mediaUrls.filter((m) => m.url.trim()),
        posX: initialData?.posX,
        posY: initialData?.posY,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] flex flex-col">
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

        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto">
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
              Logo Image
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={form.logoUrl}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2
                           text-white text-sm focus:outline-none focus:border-indigo-500"
                placeholder="https://..."
              />
              {form.logoUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setCrop({ x: 0, y: 0 });
                    setCropZoom(1);
                    setShowCrop(true);
                  }}
                  className="px-3 py-2 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300
                             rounded-lg text-xs font-medium transition-colors shrink-0"
                >
                  Crop
                </button>
              )}
            </div>
            {form.logoUrl && (
              <div className="mt-2 flex items-center gap-2">
                <img
                  src={form.logoUrl}
                  alt="Logo preview"
                  className="w-10 h-10 rounded-lg object-cover bg-gray-800 border border-gray-600"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
                <span className="text-[10px] text-gray-500">
                  Preview — click Crop to adjust
                </span>
              </div>
            )}
          </div>

          {/* Media URLs */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-400">
                Media
              </label>
              <button
                type="button"
                onClick={handleAddMedia}
                className="text-[10px] text-indigo-400 hover:text-indigo-300"
              >
                + Add Media
              </button>
            </div>
            {mediaUrls.length === 0 && (
              <p className="text-[10px] text-gray-500">No media added yet</p>
            )}
            <div className="space-y-2">
              {mediaUrls.map((media, i) => (
                <div key={i} className="flex gap-2">
                  <select
                    value={media.type}
                    onChange={(e) => {
                      const updated = [...mediaUrls];
                      updated[i] = { ...updated[i], type: e.target.value };
                      setMediaUrls(updated);
                    }}
                    className="bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5
                               text-white text-xs focus:outline-none focus:border-indigo-500 w-24"
                  >
                    <option value="IMAGE">Image</option>
                    <option value="VIDEO">Video</option>
                    <option value="IFRAME">Embed</option>
                    <option value="PDF">PDF</option>
                    <option value="LINK">Link</option>
                  </select>
                  <input
                    type="url"
                    value={media.url}
                    onChange={(e) => {
                      const updated = [...mediaUrls];
                      updated[i] = { ...updated[i], url: e.target.value };
                      setMediaUrls(updated);
                    }}
                    className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5
                               text-white text-xs focus:outline-none focus:border-indigo-500"
                    placeholder="https://..."
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveMedia(i)}
                    className="text-gray-500 hover:text-red-400 text-xs px-1"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Queue Toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.queueEnabled}
              onChange={(e) =>
                setForm({ ...form, queueEnabled: e.target.checked })
              }
              className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-indigo-600
                         focus:ring-indigo-500 focus:ring-offset-0"
            />
            <div>
              <span className="text-sm text-white">Enable Queue</span>
              <p className="text-[10px] text-gray-500">
                Visitors can queue up to talk to you
              </p>
            </div>
          </label>

          {/* Lead Capture Toggle + Fields */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={form.leadCaptureEnabled}
                onChange={(e) =>
                  setForm({ ...form, leadCaptureEnabled: e.target.checked })
                }
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-indigo-600
                           focus:ring-indigo-500 focus:ring-offset-0"
              />
              <div>
                <span className="text-sm text-white">Lead Capture</span>
                <p className="text-[10px] text-gray-500">
                  Collect visitor info with a form
                </p>
              </div>
            </label>

            {form.leadCaptureEnabled && (
              <div className="ml-7 space-y-2">
                {leadFields.map((f) => (
                  <div
                    key={f.field}
                    className="flex items-center justify-between text-xs bg-gray-800/50 rounded-lg px-3 py-1.5"
                  >
                    <span className="text-gray-300">
                      {f.field}
                      {f.required && (
                        <span className="text-red-400 ml-0.5">*</span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={f.required}
                          onChange={(e) =>
                            setLeadFields(
                              leadFields.map((lf) =>
                                lf.field === f.field
                                  ? { ...lf, required: e.target.checked }
                                  : lf
                              )
                            )
                          }
                          className="w-3 h-3 rounded border-gray-600 bg-gray-700 text-indigo-600"
                        />
                        <span className="text-[10px] text-gray-500">Req</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRemoveLeadField(f.field)}
                        className="text-gray-500 hover:text-red-400"
                      >
                        x
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && (e.preventDefault(), handleAddLeadField())
                    }
                    maxLength={50}
                    className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-2 py-1
                               text-white text-xs focus:outline-none focus:border-indigo-500"
                    placeholder="Field name..."
                  />
                  <button
                    type="button"
                    onClick={handleAddLeadField}
                    disabled={!newFieldName.trim()}
                    className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50
                               text-white rounded-lg text-xs transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
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

      {/* Logo Crop Modal */}
      {showCrop && form.logoUrl && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md mx-4 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-gray-800">
              <h3 className="text-white font-semibold text-sm">Crop Logo</h3>
              <button
                onClick={() => setShowCrop(false)}
                className="text-gray-400 hover:text-white text-xs"
              >
                Cancel
              </button>
            </div>
            <div className="relative w-full h-64 bg-black">
              <Cropper
                image={form.logoUrl}
                crop={crop}
                zoom={cropZoom}
                minZoom={0.5}
                maxZoom={3}
                aspect={1}
                cropShape="rect"
                showGrid
                onCropChange={setCrop}
                onZoomChange={setCropZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>Zoom</span>
                <input
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.05}
                  value={cropZoom}
                  onChange={(e) => setCropZoom(Number(e.target.value))}
                  className="flex-1 accent-indigo-500"
                />
              </div>
              <button
                type="button"
                onClick={handleCropSave}
                disabled={uploading}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white
                           rounded-lg text-sm font-medium transition-colors
                           disabled:opacity-50"
              >
                {uploading ? "Uploading..." : "Apply Crop"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Canvas-based image cropping helper */
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area
): Promise<Blob | null> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 1);
  });
}
