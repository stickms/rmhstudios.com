/**
 * Athora — Report Modal
 *
 * Modal for reporting a user or room to moderators.
 */

"use client";

import { useState } from "react";

const REPORT_REASONS = [
  { value: "HARASSMENT", label: "Harassment or bullying" },
  { value: "SPAM", label: "Spam or advertising" },
  { value: "INAPPROPRIATE_CONTENT", label: "Inappropriate content" },
  { value: "IMPERSONATION", label: "Impersonation" },
  { value: "SCAM", label: "Scam or fraud" },
  { value: "OTHER", label: "Other" },
] as const;

interface ReportModalProps {
  roomId: string;
  targetUserId?: string;
  targetName?: string;
  onClose: () => void;
}

export function ReportModal({
  roomId,
  targetUserId,
  targetName,
  onClose,
}: ReportModalProps) {
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/athora/rooms/${roomId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId: targetUserId || null,
          reason,
          details: details.trim() || null,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        setTimeout(onClose, 1500);
      }
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-80 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
          <div className="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-white font-bold text-sm">Report Submitted</h3>
          <p className="text-gray-400 text-xs mt-1">Thank you. We'll review this shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-white font-bold text-sm">
            Report {targetName ? targetName : "Room"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="space-y-1.5">
            {REPORT_REASONS.map((r) => (
              <label
                key={r.value}
                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors text-xs ${
                  reason === r.value
                    ? "bg-red-900/20 border border-red-600/30 text-white"
                    : "bg-gray-800 border border-transparent text-gray-300 hover:bg-gray-750"
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="sr-only"
                />
                <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                  reason === r.value ? "border-red-500 bg-red-500" : "border-gray-500"
                }`} />
                {r.label}
              </label>
            ))}
          </div>

          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={1000}
            rows={2}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2
                       text-white text-xs focus:outline-none focus:border-red-500 resize-none"
            placeholder="Additional details (optional)"
          />

          <div className="flex gap-2">
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
              disabled={!reason || submitting}
              className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50
                         text-white rounded-lg text-xs font-medium transition-colors"
            >
              {submitting ? "Submitting..." : "Submit Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
