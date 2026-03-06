/**
 * Edit Curated Build Route
 */

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Loader2, Camera, AlertCircle, Save, Crop } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { ImageCropModal } from '@/components/feed/ImageCropModal';
import { useSession } from '@/components/Providers';

export const Route = createFileRoute('/admin/curated-builds/$id/edit')({
  component: CuratedBuildEditPage,
});

function CuratedBuildEditPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [build, setBuild] = useState<any>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string>('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [isCurated, setIsCurated] = useState(false);
  const [visibility, setVisibility] = useState<'PUBLIC' | 'UNLISTED' | 'PRIVATE'>('UNLISTED');
  const [ownerId, setOwnerId] = useState('');
  const [ownerSearch, setOwnerSearch] = useState('');
  const [ownerResults, setOwnerResults] = useState<{ id: string; name: string | null; username: string | null }[]>([]);
  const [ownerDisplay, setOwnerDisplay] = useState('');
  const [searchingOwner, setSearchingOwner] = useState(false);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isPending && (!session || !(session.user as any).isAdmin)) {
      navigate({ to: '/' });
    }
  }, [session, isPending, navigate]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/user-builds/${id}`)
      .then(res => {
        if (!res.ok) throw new Error('Build not found');
        return res.json();
      })
      .then(data => {
        setBuild(data);
        setTitle(data.title);
        setDescription(data.description);
        setTags(data.tags?.join(', ') || '');
        setThumbnailUrl(data.thumbnailUrl || '');
        setAvatarPreview(data.thumbnailUrl || null);
        setIsCurated(data.isCurated ?? false);
        setVisibility(data.visibility || 'UNLISTED');
        setOwnerId(data.user?.id || '');
        setOwnerDisplay(data.user?.name || data.user?.username || 'Unknown');
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
      if (cropSrc && cropSrc.startsWith('blob:')) URL.revokeObjectURL(cropSrc);
    };
  }, [avatarPreview, cropSrc]);

  useEffect(() => {
    if (!ownerSearch || ownerSearch.length < 2) { setOwnerResults([]); return; }
    const timer = setTimeout(async () => {
      setSearchingOwner(true);
      try {
        const res = await fetch(`/api/admin/users?q=${encodeURIComponent(ownerSearch)}&limit=5`);
        if (res.ok) { const data = await res.json(); setOwnerResults(data.items || []); }
      } catch {} finally { setSearchingOwner(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [ownerSearch]);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5 MB'); return; }
    setError(null);
    const objectUrl = URL.createObjectURL(file);
    setCropSrc(objectUrl);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCropDone = (croppedBlob: Blob) => {
    if (cropSrc && cropSrc.startsWith('blob:')) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    if (avatarPreview && avatarPreview.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
    const croppedFile = new File([croppedBlob], 'thumbnail.png', { type: 'image/png' });
    setAvatarFile(croppedFile);
    setAvatarPreview(URL.createObjectURL(croppedBlob));
  };

  const handleCropCancel = () => {
    if (cropSrc && cropSrc.startsWith('blob:')) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  const handleSave = async () => {
    if (!title.trim()) { setError('Title cannot be empty'); return; }
    if (!description.trim()) { setError('Description cannot be empty'); return; }
    setSubmitting(true);
    setError(null);
    try {
      let finalImageUrl = thumbnailUrl;
      if (avatarFile) {
        const formData = new FormData();
        formData.append('image', avatarFile);
        if (thumbnailUrl) formData.append('oldImageUrl', thumbnailUrl);
        const uploadRes = await fetch('/api/admin/curated-builds/image', { method: 'POST', body: formData });
        if (!uploadRes.ok) { const data = await uploadRes.json(); throw new Error(data.error || 'Failed to upload image'); }
        const uploadData = await uploadRes.json();
        finalImageUrl = uploadData.image;
      }
      const parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
      const res = await fetch(`/api/user-builds/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          thumbnailUrl: finalImageUrl,
          tags: parsedTags,
          isCurated,
          visibility,
          ...(ownerId && ownerId !== build.user?.id ? { userId: ownerId } : {}),
        }),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || 'Failed to update build'); }
      navigate({ to: '/admin/curated-builds' });
    } catch (err: any) {
      setError(err.message || 'Failed to update curated build');
      setSubmitting(false);
    }
  };

  if (isPending || loading) {
    return (
      <PageLayout title="Edit Curated Build" wide>
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-site-accent animate-spin" /></div>
      </PageLayout>
    );
  }

  if (!build) {
    return (
      <PageLayout title="Edit Curated Build" wide>
        <div className="max-w-3xl mx-auto p-4 md:p-8">
          <div className="p-8 rounded-xl border border-site-border bg-site-surface text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-red-500 mb-2">Error</h2>
            <p className="text-site-text-muted mb-6">{error || 'Build not found'}</p>
            <Link to="/admin/curated-builds"><Button variant="secondary">Back to Curated Builds</Button></Link>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Edit Curated Build" wide>
      <div className="max-w-3xl mx-auto p-4 md:p-8">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/admin/curated-builds" className="p-2 hover:bg-site-surface-hover rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-site-text-dim" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold font-display text-site-text">Edit Curated Build</h1>
            <p className="text-site-text-muted mt-1">Update official details, tags, and hero image.</p>
          </div>
        </div>

        <div className="bg-site-surface border border-site-border rounded-xl p-6 space-y-6">
          {/* Hero Image */}
          <div>
            <label className="block text-sm font-medium text-site-text mb-2">Hero Image</label>
            <div className="flex flex-col items-start gap-3">
              <div className="w-full max-w-sm rounded-xl border border-site-border bg-site-surface overflow-hidden">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="relative group aspect-video w-full bg-site-bg flex items-center justify-center overflow-hidden cursor-pointer">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Thumbnail preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center text-site-text-dim">
                      <Camera className="w-8 h-8 mb-2 opacity-50" />
                      <span className="text-sm">Click to upload image</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-sm font-medium text-white flex items-center gap-2"><Camera className="w-4 h-4" /> Upload New Image</span>
                  </div>
                </button>
                {avatarPreview && (
                  <div className="px-3 py-2 border-t border-site-border">
                    <p className="text-xs text-site-text-dim font-medium truncate">{title || 'Build Title'}</p>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {avatarPreview && (
                  <button type="button" onClick={async () => {
                    try {
                      const isLocal = avatarPreview!.startsWith('/') || avatarPreview!.startsWith('blob:');
                      const fetchUrl = isLocal ? avatarPreview! : `/api/admin/curated-builds/image/proxy?url=${encodeURIComponent(avatarPreview!)}`;
                      const res = await fetch(fetchUrl);
                      if (!res.ok) throw new Error();
                      const blob = await res.blob();
                      setCropSrc(URL.createObjectURL(blob));
                    } catch { setError('Failed to load image for cropping'); }
                  }} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-site-border text-site-text-muted hover:text-site-text hover:border-site-accent/50 transition-colors">
                    <Crop className="w-4 h-4" /> Re-crop
                  </button>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={handleAvatarSelect} />
              <p className="text-xs text-site-text-dim">Recommended aspect ratio is 16:9. Max size 5MB.</p>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-site-text mb-2">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-4 py-2 rounded-lg bg-site-bg border border-site-border text-site-text outline-none focus:border-site-accent/50 transition-colors" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-site-text mb-2">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full px-4 py-2 rounded-lg bg-site-bg border border-site-border text-site-text outline-none focus:border-site-accent/50 transition-colors resize-none" />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-site-text mb-2">Tags (comma separated)</label>
            <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Multiplayer, Party, Minigames" className="w-full px-4 py-2 rounded-lg bg-site-bg border border-site-border text-site-text outline-none focus:border-site-accent/50 transition-colors" />
          </div>

          {/* Owner */}
          <div>
            <label className="block text-sm font-medium text-site-text mb-2">Owner</label>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm text-site-text-muted">Current: <span className="text-site-text font-medium">{ownerDisplay}</span></span>
            </div>
            <div className="relative">
              <input type="text" value={ownerSearch} onChange={(e) => setOwnerSearch(e.target.value)} placeholder="Search users by name, username, or email..." className="w-full px-4 py-2 rounded-lg bg-site-bg border border-site-border text-site-text outline-none focus:border-site-accent/50 transition-colors text-sm" />
              {ownerResults.length > 0 && (
                <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-site-surface border border-site-border rounded-lg shadow-lg overflow-hidden">
                  {ownerResults.map(u => (
                    <button key={u.id} type="button" onClick={() => { setOwnerId(u.id); setOwnerDisplay(u.name || u.username || 'Unknown'); setOwnerSearch(''); setOwnerResults([]); }} className="w-full px-4 py-2 text-left text-sm hover:bg-site-surface-hover transition-colors flex items-center gap-2">
                      <span className="text-site-text font-medium">{u.name || 'Unnamed'}</span>
                      {u.username && <span className="text-site-text-dim">@{u.username}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-sm font-medium text-site-text mb-2">Visibility</label>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as any)} className="w-full px-4 py-2 rounded-lg bg-site-bg border border-site-border text-site-text outline-none focus:border-site-accent/50 transition-colors">
              <option value="PUBLIC">Public</option>
              <option value="UNLISTED">Unlisted</option>
              <option value="PRIVATE">Private</option>
            </select>
          </div>

          {/* Curated Toggle */}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setIsCurated(!isCurated)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isCurated ? 'bg-site-accent' : 'bg-site-border'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isCurated ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <label className="text-sm font-medium text-site-text">Curated Build</label>
          </div>

          {error && (
            <div className="p-4 rounded-lg bg-red-500/10 text-red-400 text-sm flex items-center gap-2 border border-red-500/20">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}

          {/* Actions */}
          <div className="pt-4 flex justify-end gap-3 border-t border-site-border">
            <Link to="/admin/curated-builds"><Button variant="ghost" disabled={submitting}>Cancel</Button></Link>
            <Button variant="accent" className="bg-site-accent text-white" onClick={handleSave} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        </div>
      </div>

      {cropSrc && <ImageCropModal imageSrc={cropSrc} onCropDone={handleCropDone} onCancel={handleCropCancel} aspect={16 / 9} cropShape="rect" />}
    </PageLayout>
  );
}
