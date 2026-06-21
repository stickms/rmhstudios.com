"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquarePlus,
  Send,
  Loader2,
  LogIn,
  Bug,
  Lightbulb,
  MessageCircle,
  HelpCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  feedbackSchema,
  FEEDBACK_CATEGORIES,
  type FeedbackCategory,
} from "@/lib/feedback-schema";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

type FieldErrors = Partial<Record<string, string>>;

interface FeedbackItem {
  id: string;
  category: string;
  message: string;
  createdAt: string;
  user: { name: string; image: string | null };
}

const CATEGORY_CONFIG: Record<
  FeedbackCategory,
  { label: string; icon: typeof Bug; color: string }
> = {
  bug: { label: "Bug", icon: Bug, color: "text-red-400 bg-red-400/10" },
  feature: {
    label: "Feature",
    icon: Lightbulb,
    color: "text-amber-400 bg-amber-400/10",
  },
  general: {
    label: "General",
    icon: MessageCircle,
    color: "text-blue-400 bg-blue-400/10",
  },
  other: {
    label: "Other",
    icon: HelpCircle,
    color: "text-site-text-muted bg-site-text-muted/10",
  },
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function FeedbackModal() {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [category, setCategory] = useState<FeedbackCategory | "">("");
  const [message, setMessage] = useState("");

  const { data: session } = authClient.useSession();

  const fetchFeedbacks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/feedback");
      if (res.ok) {
        setFeedbacks(await res.json());
      }
    } catch {
      // silently fail on load
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchFeedbacks();
  }, [open, fetchFeedbacks]);

  const resetForm = useCallback(() => {
    setCategory("");
    setMessage("");
    setErrors({});
    setSending(false);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) setTimeout(resetForm, 200);
    },
    [resetForm]
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setErrors({});

      const parsed = feedbackSchema.safeParse({
        category: category || undefined,
        message,
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

        const newItem: FeedbackItem = await res.json();
        setFeedbacks((prev) => [newItem, ...prev]);
        resetForm();
        toast.success("Feedback posted!");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Something went wrong"
        );
      } finally {
        setSending(false);
      }
    },
    [category, message, resetForm]
  );

  return (
    <>
      {/* Floating trigger button */}
      <motion.button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-(--site-accent) text-site-accent-fg shadow-lg shadow-(--site-accent)/25 hover:bg-(--site-accent-hover) transition-colors md:bottom-8 md:right-8 md:h-14 md:w-14"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1, type: "spring", stiffness: 260, damping: 20 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Feedback"
      >
        <MessageSquarePlus className="h-5 w-5 md:h-6 md:w-6" />
      </motion.button>

      {/* Modal */}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="bg-site-surface border-site-border text-site-text sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-site-text font-(family-name:--font-nunito) text-xl font-bold">
              Feedback Board
            </DialogTitle>
            <DialogDescription className="text-site-text-muted">
              See what others are saying, or share your own thoughts.
            </DialogDescription>
          </DialogHeader>

          {/* Feedback list */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 -mr-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-site-text-dim" />
              </div>
            ) : feedbacks.length === 0 ? (
              <p className="text-center text-site-text-dim py-8 text-sm">
                No feedback yet. Be the first!
              </p>
            ) : (
              <AnimatePresence initial={false}>
                {feedbacks.map((fb, i) => {
                  const config =
                    CATEGORY_CONFIG[fb.category as FeedbackCategory] ??
                    CATEGORY_CONFIG.other;
                  const Icon = config.icon;
                  return (
                    <motion.div
                      key={fb.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i < 10 ? i * 0.03 : 0 }}
                      className="rounded-lg border border-site-border bg-site-bg p-3"
                    >
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        {fb.user.image ? (
                          <img
                            src={fb.user.image}
                            alt=""
                            className="h-8 w-8 rounded-full shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).src = '/images/social/default_avatar.png'; }}
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-site-accent/20 flex items-center justify-center text-xs font-bold text-site-accent shrink-0">
                            {fb.user.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-site-text truncate">
                              {fb.user.name}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full ${config.color}`}
                            >
                              <Icon className="h-3 w-3" />
                              {config.label}
                            </span>
                            <span className="text-xs text-site-text-dim ml-auto shrink-0">
                              {timeAgo(fb.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm text-site-text-muted mt-1 whitespace-pre-wrap wrap-break-word">
                            {fb.message}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-site-border -mx-6 my-1" />

          {/* Form / Sign-in prompt */}
          {session ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex gap-2">
                <select
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as FeedbackCategory)
                  }
                  className="h-9 rounded-md border border-site-border bg-site-bg px-2 text-sm text-site-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--site-accent)"
                >
                  <option value="" disabled>
                    Category
                  </option>
                  {FEEDBACK_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_CONFIG[cat].label}
                    </option>
                  ))}
                </select>
                {errors.category && (
                  <p className="text-xs text-red-400 self-center">
                    {errors.category}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Textarea
                  rows={2}
                  placeholder="Share your feedback..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="bg-site-bg border-site-border text-site-text placeholder:text-site-text-dim focus-visible:ring-(--site-accent) resize-none text-sm"
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
              <Button
                type="submit"
                variant="accent"
                size="sm"
                disabled={sending}
                className="w-full"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Posting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Post Feedback
                  </>
                )}
              </Button>
            </form>
          ) : (
            <div className="flex items-center justify-center gap-2 py-3">
              <LogIn className="h-4 w-4 text-site-text-dim" />
              <span className="text-sm text-site-text-muted">
                <Link
                  to="/login"
                  search={{ callbackURL: undefined }}
                  className="text-site-accent hover:underline font-medium"
                >
                  Sign in
                </Link>{" "}
                to leave feedback
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
