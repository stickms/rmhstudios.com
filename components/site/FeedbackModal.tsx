"use client";

import { useState, useCallback, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquarePlus, Send, CheckCircle2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  feedbackSchema,
  FEEDBACK_CATEGORIES,
  type FeedbackCategory,
} from "@/lib/feedback-schema";
import { toast } from "sonner";

type FieldErrors = Partial<Record<string, string>>;

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Bug Report",
  feature: "Feature Request",
  general: "General Feedback",
  other: "Other",
};

export function FeedbackModal() {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<FeedbackCategory | "">("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");

  const resetForm = useCallback(() => {
    setName("");
    setEmail("");
    setCategory("");
    setMessage("");
    setHoneypot("");
    setErrors({});
    setSending(false);
    setSent(false);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        setTimeout(resetForm, 200);
      }
    },
    [resetForm]
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setErrors({});

      const parsed = feedbackSchema.safeParse({
        name,
        email,
        category: category || undefined,
        message,
        honeypot,
      });

      if (!parsed.success) {
        const fieldErrors: FieldErrors = {};
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0]);
          if (!fieldErrors[key]) fieldErrors[key] = issue.message;
        }
        setErrors(fieldErrors);
        return;
      }

      setSending(true);
      try {
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "Failed to send feedback");
        }

        setSent(true);
        toast.success("Feedback sent — thank you!");
        setTimeout(() => handleOpenChange(false), 1800);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Something went wrong"
        );
      } finally {
        setSending(false);
      }
    },
    [name, email, category, message, honeypot, handleOpenChange]
  );

  return (
    <>
      {/* Floating trigger button */}
      <motion.button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-(--site-accent) text-white shadow-lg shadow-(--site-accent)/25 hover:bg-(--site-accent-hover) transition-colors md:bottom-8 md:right-8 md:h-14 md:w-14"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1, type: "spring", stiffness: 260, damping: 20 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Send feedback"
      >
        <MessageSquarePlus className="h-5 w-5 md:h-6 md:w-6" />
      </motion.button>

      {/* Modal */}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="bg-site-surface border-site-border text-site-text sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-site-text font-(family-name:--font-nunito) text-xl font-bold">
              Send Feedback
            </DialogTitle>
            <DialogDescription className="text-site-text-muted">
              Bug, idea, or just want to say hi? We&apos;d love to hear from
              you.
            </DialogDescription>
          </DialogHeader>

          <AnimatePresence mode="wait">
            {sent ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3 py-8"
              >
                <CheckCircle2 className="h-12 w-12 text-green-400" />
                <p className="text-lg font-semibold text-site-text">
                  Thank you!
                </p>
                <p className="text-sm text-site-text-muted">
                  Your feedback has been sent.
                </p>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                onSubmit={handleSubmit}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-4"
              >
                {/* Honeypot — hidden from humans */}
                <div className="absolute opacity-0 pointer-events-none h-0 overflow-hidden" aria-hidden="true">
                  <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                  />
                </div>

                {/* Name */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="fb-name"
                    className="text-sm font-medium text-site-text-muted"
                  >
                    Name{" "}
                    <span className="text-site-text-dim text-xs">
                      (optional)
                    </span>
                  </label>
                  <Input
                    id="fb-name"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-site-bg border-site-border text-site-text placeholder:text-site-text-dim focus-visible:ring-(--site-accent)"
                  />
                  {errors.name && (
                    <p className="text-xs text-red-400">{errors.name}</p>
                  )}
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="fb-email"
                    className="text-sm font-medium text-site-text-muted"
                  >
                    Email <span className="text-red-400">*</span>
                  </label>
                  <Input
                    id="fb-email"
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-site-bg border-site-border text-site-text placeholder:text-site-text-dim focus-visible:ring-(--site-accent)"
                  />
                  {errors.email && (
                    <p className="text-xs text-red-400">{errors.email}</p>
                  )}
                </div>

                {/* Category */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="fb-category"
                    className="text-sm font-medium text-site-text-muted"
                  >
                    Category <span className="text-red-400">*</span>
                  </label>
                  <select
                    id="fb-category"
                    required
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as FeedbackCategory)
                    }
                    className="flex h-10 w-full rounded-md border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--site-accent) focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="" disabled>
                      Select a category...
                    </option>
                    {FEEDBACK_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </select>
                  {errors.category && (
                    <p className="text-xs text-red-400">{errors.category}</p>
                  )}
                </div>

                {/* Message */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="fb-message"
                    className="text-sm font-medium text-site-text-muted"
                  >
                    Message <span className="text-red-400">*</span>
                  </label>
                  <Textarea
                    id="fb-message"
                    required
                    rows={4}
                    placeholder="Tell us what's on your mind..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="bg-site-bg border-site-border text-site-text placeholder:text-site-text-dim focus-visible:ring-(--site-accent) resize-none"
                  />
                  <div className="flex items-center justify-between">
                    {errors.message ? (
                      <p className="text-xs text-red-400">{errors.message}</p>
                    ) : (
                      <span />
                    )}
                    <span
                      className={`text-xs ${message.length > 2000 ? "text-red-400" : "text-site-text-dim"}`}
                    >
                      {message.length}/2000
                    </span>
                  </div>
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  variant="accent"
                  disabled={sending}
                  className="w-full"
                >
                  {sending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send Feedback
                    </>
                  )}
                </Button>
              </motion.form>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </>
  );
}
