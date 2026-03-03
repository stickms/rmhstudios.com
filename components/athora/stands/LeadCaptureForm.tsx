/**
 * Athora — Lead Capture Form
 *
 * Dynamic form for collecting visitor info at a stand.
 * Fields are configured by the stand owner.
 */

"use client";

import { useState } from "react";

interface LeadField {
  field: string;
  required: boolean;
  type?: string;
}

interface LeadCaptureFormProps {
  standId: string;
  standTitle: string;
  fields: LeadField[];
  onClose: () => void;
}

const DEFAULT_FIELDS: LeadField[] = [
  { field: "name", required: true },
  { field: "email", required: true, type: "email" },
  { field: "company", required: false },
  { field: "message", required: false },
];

export function LeadCaptureForm({
  standId,
  standTitle,
  fields,
  onClose,
}: LeadCaptureFormProps) {
  const formFields = fields?.length > 0 ? fields : DEFAULT_FIELDS;
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate required fields
    for (const f of formFields) {
      if (f.required && !formData[f.field]?.trim()) {
        setError(`${f.field} is required`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/athora/stands/${standId}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: formData }),
      });

      if (res.ok) {
        setSubmitted(true);
        setTimeout(onClose, 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to submit");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-80 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
          <div className="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-white font-bold text-sm">Info Submitted!</h3>
          <p className="text-gray-400 text-xs mt-1">The stand owner will be in touch.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div>
            <h2 className="text-white font-bold text-sm">Leave Your Info</h2>
            <p className="text-gray-400 text-[10px] mt-0.5">{standTitle}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {formFields.map((f) => (
            <div key={f.field}>
              <label className="block text-[10px] font-medium text-gray-400 mb-1 capitalize">
                {f.field} {f.required && <span className="text-red-400">*</span>}
              </label>
              {f.field === "message" ? (
                <textarea
                  value={formData[f.field] || ""}
                  onChange={(e) => setFormData({ ...formData, [f.field]: e.target.value })}
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5
                             text-white text-xs focus:outline-none focus:border-indigo-500 resize-none"
                />
              ) : (
                <input
                  type={f.type || "text"}
                  value={formData[f.field] || ""}
                  onChange={(e) => setFormData({ ...formData, [f.field]: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5
                             text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              )}
            </div>
          ))}

          {error && (
            <p className="text-red-400 text-[10px]">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300
                         rounded-lg text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50
                         text-white rounded-lg text-xs font-medium transition-colors"
            >
              {submitting ? "Sending..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
