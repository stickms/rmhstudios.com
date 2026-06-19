'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Plus, BarChart3, Image } from 'lucide-react';
import { GifEmbed } from './GifEmbed';
import { AIGenerateButton } from './AIGenerateButton';
import { authClient } from '@/lib/auth-client';
import { useResolvedUser } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { useFeedStore } from '@/stores/feedStore';
import {
  MAX_RMHARK_LENGTH,
  MAX_POLL_QUESTION_LENGTH,
  MAX_POLL_OPTION_LENGTH,
  MIN_POLL_OPTIONS,
  MAX_POLL_OPTIONS,
} from '@/lib/rmhark-schema';

type Attachment = 'poll' | 'gif' | null;

interface PollDraft {
  question: string;
  options: string[];
  multiSelect: boolean;
}

const IMAGE_EXT_REGEX = /\.(gif|png|jpe?g|webp|avif)(\?[^\s]*)?$/i;

function isValidMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith('tenor.com') || parsed.hostname.endsWith('giphy.com')) return true;
    if (IMAGE_EXT_REGEX.test(parsed.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

interface ComposeModalProps {
  open: boolean;
  onClose: () => void;
}

export function ComposeModal({ open, onClose }: ComposeModalProps) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [attachment, setAttachment] = useState<Attachment>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [poll, setPoll] = useState<PollDraft>({
    question: '',
    options: ['', ''],
    multiSelect: false,
  });
  const [gifUrl, setGifUrl] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const { prependItem } = useFeedStore();
  const { data: session } = authClient.useSession();
  const { resolved: resolvedUser } = useResolvedUser();

  const remaining = MAX_RMHARK_LENGTH - content.length;

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const hasPoll = attachment === 'poll' && poll.question.trim() &&
    poll.options.filter((o) => o.trim()).length >= MIN_POLL_OPTIONS;
  const hasGif = attachment === 'gif' && gifUrl.trim() && isValidMediaUrl(gifUrl.trim());
  const hasContent = content.trim().length > 0;
  const canSubmit = (hasContent || hasPoll || hasGif) && remaining >= 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {};
      if (content.trim()) body.content = content.trim();
      if (hasPoll) {
        body.poll = {
          question: poll.question.trim(),
          options: poll.options.filter((o) => o.trim()).map((o) => o.trim()),
          multiSelect: poll.multiSelect,
        };
      }
      if (hasGif) body.gifUrl = gifUrl.trim();

      const res = await fetch('/api/rmharks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        console.error('Post error:', data.error);
        return;
      }

      const item = await res.json();
      prependItem(item);
      setContent('');
      setAttachment(null);
      setPoll({ question: '', options: ['', ''], multiSelect: false });
      setGifUrl('');
      onClose();
    } catch (error) {
      console.error('Post error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !session) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="absolute inset-x-4 top-[5vh] sm:top-[10vh] mx-auto max-w-lg bg-site-bg border border-site-border rounded-2xl shadow-xl animate-in zoom-in-95 fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-site-border">
          <button
            onClick={onClose}
            className="p-1.5 -ml-1.5 rounded-full text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5">
            {/* AI draft button */}
            <AIGenerateButton
              request={{ mode: 'post', draft: content }}
              onGenerated={(text) => setContent(text)}
              title="Generate a post with AI"
            />

            {/* Plus button */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="p-1.5 rounded-full text-site-text-dim hover:text-site-accent hover:bg-site-accent/10 transition-colors"
              >
                <Plus className="w-4.5 h-4.5" />
              </button>

              {menuOpen && (
                <div className="absolute top-full right-0 mt-1 w-40 bg-site-bg border border-site-border rounded-xl shadow-xl py-1 z-30">
                  <button
                    onClick={() => {
                      setAttachment('poll');
                      setGifUrl('');
                      setMenuOpen(false);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                  >
                    <BarChart3 className="w-4 h-4 text-site-text-dim" />
                    Create Poll
                  </button>
                  <button
                    onClick={() => {
                      setAttachment('gif');
                      setPoll({ question: '', options: ['', ''], multiSelect: false });
                      setMenuOpen(false);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                  >
                    <Image className="w-4 h-4 text-site-text-dim" />
                    Add Image
                  </button>
                </div>
              )}
            </div>

            <Button
              variant="accent"
              size="sm"
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              {submitting ? 'Posting...' : 'Post'}
            </Button>
          </div>
        </div>

        {/* Compose area */}
        <div className="px-4 py-3">
          <div className="flex gap-3">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-linear-to-tr from-site-accent to-site-accent-hover flex items-center justify-center text-white font-bold text-sm ring-2 ring-site-bg shrink-0">
              {(resolvedUser?.image || session.user.image) ? (
                <img
                  src={resolvedUser?.image || session.user.image!}
                  alt={resolvedUser?.name || session.user.name || 'User'}
                  className="w-full h-full rounded-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/images/social/default_avatar.png'; }}
                />
              ) : (
                ((resolvedUser?.name || session.user.name)?.[0] || 'U').toUpperCase()
              )}
            </div>

            <div className="flex-1 min-w-0">
              <textarea
                autoFocus
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What's on your mind?"
                rows={4}
                maxLength={MAX_RMHARK_LENGTH}
                className="w-full bg-transparent text-site-text placeholder:text-site-text-dim text-base resize-none border-none outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleSubmit();
                  }
                }}
              />

              {/* Poll creator */}
              {attachment === 'poll' && (
                <div className="mt-2 border border-site-border rounded-xl p-3 bg-site-surface/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-site-text-dim uppercase tracking-wide">Poll</span>
                    <button
                      onClick={() => {
                        setAttachment(null);
                        setPoll({ question: '', options: ['', ''], multiSelect: false });
                      }}
                      className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <input
                    type="text"
                    value={poll.question}
                    onChange={(e) => setPoll((p) => ({ ...p, question: e.target.value }))}
                    placeholder="Ask a question..."
                    maxLength={MAX_POLL_QUESTION_LENGTH}
                    className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-lg p-2 border border-site-border outline-none focus:border-site-accent transition-colors mb-2"
                  />

                  <div className="space-y-2">
                    {poll.options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const newOptions = [...poll.options];
                            newOptions[i] = e.target.value;
                            setPoll((p) => ({ ...p, options: newOptions }));
                          }}
                          placeholder={`Option ${i + 1}`}
                          maxLength={MAX_POLL_OPTION_LENGTH}
                          className="flex-1 bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-lg p-2 border border-site-border outline-none focus:border-site-accent transition-colors"
                        />
                        {poll.options.length > MIN_POLL_OPTIONS && (
                          <button
                            onClick={() => {
                              const newOptions = poll.options.filter((_, j) => j !== i);
                              setPoll((p) => ({ ...p, options: newOptions }));
                            }}
                            className="p-1 rounded-full text-site-text-dim hover:text-site-danger hover:bg-site-danger/10 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {poll.options.length < MAX_POLL_OPTIONS && (
                    <button
                      onClick={() => setPoll((p) => ({ ...p, options: [...p.options, ''] }))}
                      className="mt-2 text-xs text-site-accent hover:text-site-accent-hover transition-colors"
                    >
                      + Add option
                    </button>
                  )}

                  <label className="flex items-center gap-2 mt-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={poll.multiSelect}
                      onChange={(e) => setPoll((p) => ({ ...p, multiSelect: e.target.checked }))}
                      className="rounded border-site-border text-site-accent focus:ring-site-accent"
                    />
                    <span className="text-xs text-site-text-dim">Allow multiple selections</span>
                  </label>
                </div>
              )}

              {/* GIF input */}
              {attachment === 'gif' && (
                <div className="mt-2 border border-site-border rounded-xl p-3 bg-site-surface/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-site-text-dim uppercase tracking-wide">Image</span>
                    <button
                      onClick={() => {
                        setAttachment(null);
                        setGifUrl('');
                      }}
                      className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <input
                    type="url"
                    value={gifUrl}
                    onChange={(e) => setGifUrl(e.target.value)}
                    placeholder="Paste an image URL or Tenor/Giphy link..."
                    className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-lg p-2 border border-site-border outline-none focus:border-site-accent transition-colors"
                  />

                  {gifUrl.trim() && isValidMediaUrl(gifUrl.trim()) && (
                    <GifEmbed url={gifUrl.trim()} className="mt-2" />
                  )}

                  {gifUrl.trim() && !isValidMediaUrl(gifUrl.trim()) && (
                    <p className="text-xs text-site-danger mt-1">Must be a direct image URL or Tenor/Giphy link</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-site-border flex items-center justify-end">
          <span
            className={`text-xs font-mono ${
              remaining <= 0
                ? 'text-site-danger'
                : remaining <= 20
                  ? 'text-site-warning'
                  : 'text-site-text-dim'
            }`}
          >
            {remaining}
          </span>
        </div>
      </div>
    </div>
  );
}
