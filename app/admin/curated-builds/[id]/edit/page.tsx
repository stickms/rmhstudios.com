'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Camera, AlertCircle, Save } from 'lucide-react';
import Link from 'next/link';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { ImageCropModal } from '@/components/feed/ImageCropModal';
import { useSession } from '@/components/Providers';

export default function CuratedBuildEditPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { data: session, isPending } = useSession();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [build, setBuild] = useState<any>(null);

    // Form fields
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [tags, setTags] = useState<string>('');
    const [thumbnailUrl, setThumbnailUrl] = useState('');

    // Image Upload State
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [cropSrc, setCropSrc] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isPending && (!session || !(session.user as any).isAdmin)) {
            router.push('/');
        }
    }, [session, isPending, router]);

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
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, [id]);

    useEffect(() => {
        return () => {
            if (avatarPreview && avatarPreview.startsWith('blob:')) {
                URL.revokeObjectURL(avatarPreview);
            }
            if (cropSrc && cropSrc.startsWith('blob:')) {
                URL.revokeObjectURL(cropSrc);
            }
        };
    }, [avatarPreview, cropSrc]);

    const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            setError('Image must be under 5 MB');
            return;
        }

        setError(null);
        const objectUrl = URL.createObjectURL(file);
        setCropSrc(objectUrl);

        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleCropDone = (croppedBlob: Blob) => {
        if (cropSrc && cropSrc.startsWith('blob:')) {
            URL.revokeObjectURL(cropSrc);
        }
        setCropSrc(null);

        if (avatarPreview && avatarPreview.startsWith('blob:')) {
            URL.revokeObjectURL(avatarPreview);
        }

        const croppedFile = new File([croppedBlob], 'thumbnail.png', { type: 'image/png' });
        setAvatarFile(croppedFile);
        setAvatarPreview(URL.createObjectURL(croppedBlob));
    };

    const handleCropCancel = () => {
        if (cropSrc && cropSrc.startsWith('blob:')) {
            URL.revokeObjectURL(cropSrc);
        }
        setCropSrc(null);
    };

    const handleSave = async () => {
        if (!title.trim()) {
            setError('Title cannot be empty');
            return;
        }

        if (!description.trim()) {
            setError('Description cannot be empty');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            let finalImageUrl = thumbnailUrl;

            if (avatarFile) {
                const formData = new FormData();
                formData.append('image', avatarFile);
                const uploadRes = await fetch('/api/admin/curated-builds/image', {
                    method: 'POST',
                    body: formData,
                });
                
                if (!uploadRes.ok) {
                    const data = await uploadRes.json();
                    throw new Error(data.error || 'Failed to upload image');
                }
                const uploadData = await uploadRes.json();
                finalImageUrl = uploadData.image;
            }

            const parsedTags = tags.split(',')
                .map(t => t.trim())
                .filter(Boolean);

            const res = await fetch(`/api/user-builds/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim(),
                    thumbnailUrl: finalImageUrl,
                    tags: parsedTags,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to update build');
            }

            router.push('/admin/curated-builds');
        } catch (err: any) {
            setError(err.message || 'Failed to update curated build');
            setSubmitting(false);
        }
    };

    if (isPending || loading) {
        return (
            <PageLayout title="Edit Curated Build" wide>
                <div className="flex justify-center py-20">
                    <Loader2 className="w-8 h-8 text-site-accent animate-spin" />
                </div>
            </PageLayout>
        );
    }

    if (!build) {
        return (
            <PageLayout title="Edit Curated Build" wide>
                <div className="max-w-3xl mx-auto p-4 md:p-8">
                    <div className="p-8 rounded-xl border border-site-border bg-site-surface text-center">
                        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-site-text mb-2 text-red-500">Error</h2>
                        <p className="text-site-text-muted mb-6">{error || 'Build not found'}</p>
                        <Link href="/admin/curated-builds">
                            <Button variant="secondary">Back to Curated Builds</Button>
                        </Link>
                    </div>
                </div>
            </PageLayout>
        );
    }

    return (
        <PageLayout title="Edit Curated Build" wide>
            <div className="max-w-3xl mx-auto p-4 md:p-8">
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/admin/curated-builds" className="p-2 hover:bg-site-surface-hover rounded-full transition-colors">
                        <ArrowLeft className="w-5 h-5 text-site-text-dim" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold font-display text-site-text">Edit Curated Build</h1>
                        <p className="text-site-text-muted mt-1">Update official details, tags, and hero image.</p>
                    </div>
                </div>

                <div className="bg-site-surface border border-site-border rounded-xl p-6 space-y-6">
                    {/* Hero Image / Thumbnail */}
                    <div>
                         <label className="block text-sm font-medium text-site-text mb-2">Hero Image</label>
                         <div className="flex flex-col items-start gap-3">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="relative group w-64 aspect-video rounded-xl bg-site-bg flex items-center justify-center border border-site-border overflow-hidden cursor-pointer hover:border-site-accent transition-colors"
                            >
                                {avatarPreview ? (
                                    <img src={avatarPreview} alt="Thumbnail preview" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="flex flex-col items-center text-site-text-dim">
                                        <Camera className="w-8 h-8 mb-2 opacity-50" />
                                        <span className="text-sm">Click to upload image</span>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="text-sm font-medium text-white flex items-center gap-2">
                                        <Camera className="w-4 h-4" /> Update Image
                                    </span>
                                </div>
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/gif,image/webp"
                                className="hidden"
                                onChange={handleAvatarSelect}
                            />
                            <p className="text-xs text-site-text-dim">Recommended aspect ratio is 16:9. Max size 5MB.</p>
                        </div>
                    </div>

                    {/* Title */}
                    <div>
                        <label className="block text-sm font-medium text-site-text mb-2">Title</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg bg-site-bg border border-site-border text-site-text outline-none focus:border-site-accent/50 transition-colors"
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-site-text mb-2">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={4}
                            className="w-full px-4 py-2 rounded-lg bg-site-bg border border-site-border text-site-text outline-none focus:border-site-accent/50 transition-colors resize-none"
                        />
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="block text-sm font-medium text-site-text mb-2">Tags (comma separated)</label>
                        <input
                            type="text"
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            placeholder="Multiplayer, Party, Minigames"
                            className="w-full px-4 py-2 rounded-lg bg-site-bg border border-site-border text-site-text outline-none focus:border-site-accent/50 transition-colors"
                        />
                    </div>

                    {error && (
                        <div className="p-4 rounded-lg bg-red-500/10 text-red-400 text-sm flex items-center gap-2 border border-red-500/20">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="pt-4 flex justify-end gap-3 border-t border-site-border">
                        <Link href="/admin/curated-builds">
                            <Button variant="ghost" disabled={submitting}>Cancel</Button>
                        </Link>
                        <Button
                            variant="accent"
                            className="bg-site-accent text-white"
                            onClick={handleSave}
                            disabled={submitting}
                        >
                            {submitting ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Save className="w-4 h-4 mr-2" />
                            )}
                            Save Changes
                        </Button>
                    </div>
                </div>
            </div>

            {/* Image Crop Modal */}
            {cropSrc && (
                <ImageCropModal
                    imageSrc={cropSrc}
                    onCropDone={handleCropDone}
                    onCancel={handleCropCancel}
                    aspect={16 / 9}
                    cropShape="rect"
                />
            )}
        </PageLayout>
    );
}
