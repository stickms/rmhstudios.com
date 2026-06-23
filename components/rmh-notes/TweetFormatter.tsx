'use client';

import { useState } from 'react';
import Modal from './Modal';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface Props {
  content: string;
  title: string;
  onClose: () => void;
}

const TWEET_LIMIT = 280;

export default function TweetFormatter({ content, title, onClose }: Props) {
  const { t } = useTranslation("c-rmh-notes");
  const splitIntoTweets = (text: string): string[] => {
    const sentences = text.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/);
    const tweets: string[] = [];
    let current = '';
    for (const sentence of sentences) {
      if ((current + ' ' + sentence).trim().length <= TWEET_LIMIT - 10) {
        current = (current + ' ' + sentence).trim();
      } else {
        if (current) tweets.push(current);
        current = sentence.slice(0, TWEET_LIMIT - 5);
      }
    }
    if (current) tweets.push(current);
    return tweets.filter(Boolean);
  };

  const [tweets, setTweets] = useState<string[]>(() => splitIntoTweets(content));

  const copyAll = async () => {
    const thread = tweets.map((t, i) => `${i + 1}/${tweets.length} ${t}`).join('\n\n---\n\n');
    await navigator.clipboard.writeText(thread);
    toast.success(t("thread-copied", { defaultValue: "Thread copied!" }));
  };

  const updateTweet = (i: number, val: string) => {
    setTweets((prev) => { const n = [...prev]; n[i] = val; return n; });
  };

  const addTweet = () => setTweets((prev) => [...prev, '']);
  const removeTweet = (i: number) => setTweets((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <Modal title="𝕏 Tweet Thread Formatter" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: 'var(--notes-text-muted)' }}>{t("tweet-count-in-thread", { count: tweets.length, defaultValue: "{{count}} tweet in thread", defaultValue_plural: "{{count}} tweets in thread" })}</p>
          <div className="flex gap-2">
            <button onClick={addTweet} className="text-xs px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--notes-surface-2)', color: 'var(--notes-text-muted)', border: '1px solid var(--notes-border)' }}>+ {t("add-tweet", { defaultValue: "Add tweet" })}</button>
            <button onClick={copyAll} className="text-xs px-2.5 py-1.5 rounded-lg font-semibold" style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}>{t("copy-thread", { defaultValue: "Copy thread" })}</button>
          </div>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {tweets.map((tweet, i) => {
            const over = tweet.length > TWEET_LIMIT;
            return (
              <div key={i} className="relative">
                <div className="flex items-start gap-2">
                  <span className="text-xs mt-2 font-semibold w-6 text-right shrink-0" style={{ color: 'var(--notes-text-subtle)' }}>{i + 1}</span>
                  <textarea
                    value={tweet}
                    onChange={(e) => updateTweet(i, e.target.value)}
                    rows={3}
                    className="flex-1 px-3 py-2 rounded-xl text-sm outline-none resize-none"
                    style={{
                      background: 'var(--notes-surface-2)',
                      border: `1px solid ${over ? 'var(--notes-danger)' : 'var(--notes-border)'}`,
                      color: 'var(--notes-text)',
                    }}
                  />
                  <button onClick={() => removeTweet(i)} className="mt-2 text-xs opacity-40 hover:opacity-80" style={{ color: 'var(--notes-danger)' }}>✕</button>
                </div>
                <div className="text-right text-xs mt-0.5 pr-6" style={{ color: over ? 'var(--notes-danger)' : 'var(--notes-text-subtle)' }}>
                  {tweet.length}/{TWEET_LIMIT}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
