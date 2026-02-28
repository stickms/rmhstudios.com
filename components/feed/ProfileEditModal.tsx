'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProfileEditModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (data: { bio: string | null; location: string | null; website: string | null }) => void;
  initial: {
    bio: string | null;
    location: string | null;
    website: string | null;
  };
}

const MAX_BIO = 160;
const MAX_LOCATION = 100;
const MAX_WEBSITE = 200;

export function ProfileEditModal({ open, onClose, onSaved, initial }: ProfileEditModalProps) {
  const [bio, setBio] = useState(initial.bio ?? '');
  const [location, setLocation] = useState(initial.location ?? '');
  const [website, setWebsite] = useState(initial.website ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bioRemaining = MAX_BIO - bio.length;

  // Prevent body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bio: bio.trim() || null,
          location: location.trim() || null,
          website: website.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save');
        return;
      }

      const data = await res.json();
      onSaved(data);
      onClose();
    } catch {
      setError('Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative bg-site-bg border border-site-border rounded-2xl shadow-xl w-full max-w-md mx-4 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-site-border">
          <h2 className="font-bold text-site-text">Edit Profile</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="px-4 py-4 space-y-4">
          {/* Bio */}
          <div>
            <label className="block text-xs font-medium text-site-text-dim mb-1.5">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell people about yourself"
              rows={3}
              maxLength={MAX_BIO}
              className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-xl p-3 border border-site-border resize-none outline-none focus:border-site-accent transition-colors"
            />
            <span className={`text-xs font-mono ${bioRemaining <= 20 ? 'text-site-warning' : 'text-site-text-dim'}`}>
              {bioRemaining}
            </span>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-medium text-site-text-dim mb-1.5">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Where are you based?"
              maxLength={MAX_LOCATION}
              className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-xl p-3 border border-site-border outline-none focus:border-site-accent transition-colors"
            />
          </div>

          {/* Website */}
          <div>
            <label className="block text-xs font-medium text-site-text-dim mb-1.5">Website</label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              maxLength={MAX_WEBSITE}
              className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-xl p-3 border border-site-border outline-none focus:border-site-accent transition-colors"
            />
          </div>

          {error && (
            <p className="text-sm text-site-danger">{error}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-site-border">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" size="sm" disabled={submitting} onClick={handleSave}>
            {submitting ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
