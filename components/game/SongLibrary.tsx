
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Upload, Play, Pause, Heart } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { authClient } from '@/lib/auth-client';
import { NeumorphicModal } from './NeumorphicModal';
import { useGameStore } from '@/lib/store/useGameStore';
import { GameEngine } from '@/lib/game/GameEngine';
import { parseBlob } from 'music-metadata';

interface Song {
    id: string;
    title: string;
    artist: string;
    bpm: number;
    duration: number;
    audioUrl: string;
    description?: string;
    uploadedBy: string;
    uploader: { name: string };
    coverUrl?: string; // Type definition
    analysisData?: any; // The pre-computed beatmap
    plays?: number;
    likeCount?: number;
    isLiked?: boolean;
    userPlays?: number;
    _count?: {
        scores: number;
        likes: number;
    }
}

export function SongLibrary({ onSelect, onHighlight, selectedSongId, onStopPreviewRef, readOnly = false }: { 
    onSelect: (song: Song) => void;
    onHighlight: (song: Song) => void;
    selectedSongId: string | null;
    onStopPreviewRef?: React.MutableRefObject<(() => void) | null>;
    readOnly?: boolean;
}) {
    const [songs, setSongs] = useState<Song[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatusText, setUploadStatusText] = useState("");
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
    
    // Global Volume
    const { volume } = useGameStore();
    
    // Upload State
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadTitle, setUploadTitle] = useState("");
    const [uploadArtist, setUploadArtist] = useState("");
    const [uploadDuration, setUploadDuration] = useState(0);
    const [uploadDescription, setUploadDescription] = useState("");
    
    const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
    const [previewId, setPreviewId] = useState<string | null>(null);
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);

    // Delete Modal State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [songToDelete, setSongToDelete] = useState<string | null>(null);

    // Like state
    const [likingId, setLikingId] = useState<string | null>(null);
    const { t } = useTranslation("c-game");

    const handleLike = async (e: React.MouseEvent, song: Song) => {
        e.stopPropagation();
        if (!session.data || likingId) return;
        setLikingId(song.id);
        try {
            const res = await fetch(`/api/slice-it/songs/${song.id}/like`, { method: 'POST' });
            if (!res.ok) throw new Error();
            const data = await res.json();
            setSongs(prev => prev.map(s => s.id === song.id
                ? { ...s, isLiked: data.liked, likeCount: (s.likeCount || 0) + (data.liked ? 1 : -1) }
                : s
            ));
        } catch {
            // silent
        } finally {
            setLikingId(null);
        }
    };
    
    const session = authClient.useSession();
    // Keep ref in sync with state for use in callbacks/cleanup
    useEffect(() => {
        previewAudioRef.current = previewAudio;
    }, [previewAudio]);

    // Stop preview helper
    const stopPreview = useCallback(() => {
        const audio = previewAudioRef.current;
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
        setPreviewAudio(null);
        setPreviewId(null);
    }, []);

    // Expose stopPreview to parent via ref
    useEffect(() => {
        if (onStopPreviewRef) {
            onStopPreviewRef.current = stopPreview;
        }
        return () => {
            if (onStopPreviewRef) onStopPreviewRef.current = null;
        };
    }, [stopPreview, onStopPreviewRef]);

    // Stop preview when the browser tab becomes hidden
    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden) stopPreview();
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [stopPreview]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            previewAudioRef.current?.pause();
        };
    }, []);

    useEffect(() => {
        fetchSongs();
    }, []);

    // Sync preview volume with global setting
    useEffect(() => {
        if (previewAudio) {
            previewAudio.volume = volume / 100;
        }
    }, [volume, previewAudio]);

    const fetchSongs = async () => {
        try {
            const res = await fetch('/api/slice-it/songs');
            if (res.ok) {
                const data = await res.json();
                setSongs(data);
            }
        } catch (e) {
            console.error("Failed to fetch songs", e);
        }
    };

    const MAX_AUDIO_SIZE = 50 * 1024 * 1024; // 50 MB (matches server limit)

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > MAX_AUDIO_SIZE) {
            toast.error(t("audio-too-large", { defaultValue: "Audio file too large ({{sizeMb}} MB). Maximum size is 50 MB.", sizeMb: (file.size / 1024 / 1024).toFixed(1) }));
            e.target.value = '';
            return;
        }
        
        setUploadFile(file);
        // Default values
        setUploadTitle(file.name.replace(/\.[^/.]+$/, ""));
        setUploadArtist(session.data?.user?.name || "Unknown");
        setUploadDuration(0);

        // Compute audio duration via HTMLAudioElement
        const objectUrl = URL.createObjectURL(file);
        const audio = new Audio(objectUrl);
        audio.onloadedmetadata = () => {
            setUploadDuration(audio.duration || 0);
            URL.revokeObjectURL(objectUrl);
        };

        // Attempt ID3 extraction
        try {
            const tags = await parseBlob(file);
            if (tags.common.title) setUploadTitle(tags.common.title);
            if (tags.common.artist) setUploadArtist(tags.common.artist);
        } catch (error) {
            console.log('Error reading tags:', error);
        }
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uploadFile || !session.data) return;

        setIsUploading(true);
        setUploadProgress(0);
        setUploadStatusText(t("status-analyzing", { defaultValue: "Analyzing audio format..." }));

        try {
            setUploadStatusText(t("status-uploading", { defaultValue: "Uploading track & analyzing server-side..." }));
            const formData = new FormData();
            formData.append('file', uploadFile);
            formData.append('title', uploadTitle);
            formData.append('artist', uploadArtist);
            formData.append('duration', String(uploadDuration));
            formData.append('description', uploadDescription);
            
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    setUploadProgress(percent);
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    setUploadFile(null);
                    setUploadDescription("");
                    setUploadProgress(100);
                    setUploadStatusText(t("status-success", { defaultValue: "Success!" }));
                    toast.success(t("upload-success", { defaultValue: "Track uploaded and map generated successfully!" }));
                    fetchSongs();
                    // Auto-close dialog after a brief moment
                    setTimeout(() => {
                        setUploadDialogOpen(false);
                        setUploadProgress(0);
                        setIsUploading(false);
                    }, 600);
                } else {
                    toast.error(t("upload-failed", { defaultValue: "Upload failed" }));
                    setIsUploading(false);
                    setUploadProgress(0);
                }
            });

            xhr.addEventListener('error', () => {
                toast.error(t("upload-error", { defaultValue: "Upload error" }));
                setIsUploading(false);
                setUploadProgress(0);
            });

            xhr.open('POST', '/api/slice-it/songs/upload');
            xhr.send(formData);

        } catch (err) {
            console.error(err);
            toast.error(t("upload-beatmap-error", { defaultValue: "Failed to generate beatmap. Ensure the file is a valid audio format." }));
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const togglePreview = (song: Song) => {
        if (previewId === song.id && previewAudio) {
            if (previewAudio.paused) {
                previewAudio.play();
            } else {
                previewAudio.pause();
            }
            return;
        }

        if (previewAudio) {
            previewAudio.pause();
        }

        const audio = new Audio(`/api/slice-it/songs/stream/${song.id}`);
        audio.volume = volume / 100;
        audio.play();
        setPreviewAudio(audio);
        setPreviewId(song.id);
        
        audio.onended = () => setPreviewId(null);
    };

    const handleDelete = (id: string) => {
        setSongToDelete(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!songToDelete) return;
        
        try {
            const res = await fetch(`/api/slice-it/songs/${songToDelete}`, { method: 'DELETE' });
            if (res.ok) {
                fetchSongs();
                toast.success(t("delete-success", { defaultValue: "Track purged from system library" }));
            } else {
                toast.error(t("delete-failed", { defaultValue: "Failure: Could not delete track." }));
            }
        } catch (e) {
            console.error(e);
            toast.error(t("delete-error", { defaultValue: "Error: System rejection during deletion." }));
        } finally {
            setIsDeleteModalOpen(false);
            setSongToDelete(null);
        }
    };

    return (
        <div className="w-full h-full bg-slice-bg flex flex-col">
            {/* Header / Search */}
            <div className="flex gap-2 items-center shrink-0 p-3 border-b border-slice-shadow-dark/50">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slice-text-light w-4 h-4" />
                    <Input
                        placeholder={t("search-placeholder", { defaultValue: "Search songs, artists..." })}
                        className="pl-9 bg-slice-card-bg border border-slice-shadow-dark/50 rounded-lg h-9 text-sm text-slice-text placeholder:text-slice-text-light focus-visible:ring-1 focus-visible:ring-blue-500"
                        value={searchTerm}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                    />
                </div>
                {!readOnly && (
                    <Dialog open={uploadDialogOpen} onOpenChange={(open) => { if (!isUploading) setUploadDialogOpen(open); }}>
                        <DialogTrigger asChild>
                             <Button className="h-9 w-9 rounded-lg bg-blue-500 text-white hover:bg-blue-600 p-0">
                                <Upload className="w-4 h-4" />
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-slice-bg border-none shadow-2xl rounded-2xl max-w-lg">
                            <DialogHeader>
                                <DialogTitle className="text-slice-text font-black">{t("upload-track-title", { defaultValue: "UPLOAD TRACK" })}</DialogTitle>
                            </DialogHeader>
                        <form onSubmit={handleUpload} className="space-y-4">
                            {!uploadFile ? (
                                <div className="p-8 border-2 border-dashed border-slice-shadow-dark/50 rounded-xl flex flex-col items-center justify-center text-slice-text-muted relative bg-slice-shadow-dark/20/50 h-64 transition-colors hover:bg-slice-shadow-dark/50/50">
                                    <input 
                                        type="file" 
                                        accept="audio/*"
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                        onChange={handleFileSelect}
                                    />
                                    <Upload className="w-12 h-12 mb-4 text-slice-text-light" />
                                    <span className="font-bold text-lg">{t("click-to-select", { defaultValue: "Click to select audio file" })}</span>
                                    <span className="text-sm text-slice-text-light mt-2">{t("supported-formats", { defaultValue: "MP3, WAV supported" })}</span>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                     <div className="p-4 bg-slice-card-bg rounded-xl border border-slice-shadow-dark/50 flex items-center justify-between">
                                        <div className="font-bold text-blue-600 truncate max-w-[200px]">{uploadFile.name}</div>
                                        <Button type="button" variant="ghost" size="sm" onClick={() => setUploadFile(null)} className="text-blue-400 hover:text-blue-600">{t("change", { defaultValue: "Change" })}</Button>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slice-text-light uppercase">{t("label-title", { defaultValue: "Title" })}</label>
                                            <Input value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} className="bg-slice-card-bg text-slice-text placeholder:text-slice-text-light shadow-[5px_5px_15px_var(--slice-shadow-dark),-5px_-5px_15px_var(--slice-shadow-light)] border border-slice-shadow-dark/30 focus:border-blue-400 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slice-text-light uppercase">{t("label-artist", { defaultValue: "Artist" })}</label>
                                            <Input value={uploadArtist} onChange={e => setUploadArtist(e.target.value)} className="bg-slice-card-bg text-slice-text placeholder:text-slice-text-light shadow-[5px_5px_15px_var(--slice-shadow-dark),-5px_-5px_15px_var(--slice-shadow-light)] border border-slice-shadow-dark/30 focus:border-blue-400 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all" />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slice-text-light uppercase">{t("label-description", { defaultValue: "Description (Optional)" })}</label>
                                        <Input
                                            value={uploadDescription}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUploadDescription(e.target.value)}
                                            className="bg-slice-card-bg text-slice-text placeholder:text-slice-text-light shadow-[5px_5px_15px_var(--slice-shadow-dark),-5px_-5px_15px_var(--slice-shadow-light)] border border-slice-shadow-dark/30 focus:border-blue-400 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all"
                                            placeholder={t("description-placeholder", { defaultValue: "Tell us about this track..." })}
                                        />
                                    </div>
                                </div>
                            )}

                            {isUploading && (
                                <div className="space-y-2 mt-4">
                                    <div className="flex justify-between text-xs font-bold text-slice-text-muted">
                                        <span className="uppercase">{uploadStatusText}</span>
                                        {uploadProgress > 0 && <span>{uploadProgress}%</span>}
                                    </div>
                                    <div className="w-full h-3 bg-slice-shadow-dark rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                                            style={{ width: `${Math.max(10, uploadProgress)}%` }} // Give a little visual progress even when analyzing
                                        />
                                    </div>
                                </div>
                            )}

                            <Button type="submit" disabled={isUploading || !uploadFile} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold h-12 rounded-xl mt-4">
                                {isUploading ? t("processing", { defaultValue: "PROCESSING..." }) : t("upload-track-title", { defaultValue: "UPLOAD TRACK" })}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
                )}
            </div>

            {/* Song List */}
            <div className="flex-1 overflow-y-auto p-2">
                {songs.filter(s => {
                    const term = searchTerm.toLowerCase();
                    return s.title.toLowerCase().includes(term) || (s.artist && s.artist.toLowerCase().includes(term));
                }).map(song => (
                    <div
                        key={song.id}
                        className={`p-2 flex items-center justify-between group hover:bg-slice-shadow-dark/50 transition-all cursor-pointer border-l-4 ${selectedSongId === song.id ? 'bg-blue-500/10 border-l-blue-500' : 'bg-transparent border-l-transparent'}`}
                        onClick={() => onHighlight(song)}
                    >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="w-8 h-8 rounded-full bg-slice-shadow-dark text-blue-500 hover:bg-slice-shadow-dark shrink-0"
                                onClick={(e) => { e.stopPropagation(); togglePreview(song); }}
                            >
                                {previewId === song.id && previewAudio && !previewAudio.paused ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                            </Button>

                            {/* Thumbnail */}
                            <div className="w-10 h-10 rounded-md bg-slice-shadow-dark shrink-0 overflow-hidden relative">
                                {song.coverUrl ? (
                                    <img src={song.coverUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-slice-text-muted font-bold text-xs">
                                        {song.title.charAt(0)}
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-slice-text text-sm leading-tight truncate">{song.title}</div>
                                <div className="text-xs text-slice-text-muted truncate">{song.artist} • {song.bpm} BPM • {Math.floor(song.duration / 60)}:{Math.round(song.duration % 60).toString().padStart(2, '0')}</div>
                                <div className="flex items-center gap-3 mt-0.5">
                                    <span className="flex items-center gap-1 text-[10px] text-slice-text-light">
                                        <Play className="w-2.5 h-2.5 fill-current" />{song.plays || 0}
                                    </span>
                                    <span className={`flex items-center gap-1 text-[10px] ${song.isLiked ? 'text-red-400' : 'text-slice-text-light'}`}>
                                        <Heart className={`w-2.5 h-2.5 ${song.isLiked ? 'fill-current' : ''}`} />{song.likeCount || 0}
                                    </span>
                                    {session.data?.user?.id === song.uploadedBy && (
                                        <span className="text-[10px] text-blue-500 font-bold">{t("your-track", { defaultValue: "YOUR TRACK" })}</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                            {!readOnly && session.data?.user?.id === song.uploadedBy && (
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={(e) => { e.stopPropagation(); handleDelete(song.id); }}
                                    className="h-8 w-8 p-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                    title={t("delete-song", { defaultValue: "Delete Song" })}
                                >
                                    <span className="sr-only">Delete</span>
                                    <span className="text-xs font-bold">✕</span>
                                </Button>
                            )}
                            {session.data && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-8 w-8 rounded-lg shrink-0 transition-colors ${song.isLiked ? 'text-red-500 hover:text-red-400' : 'text-slice-text-light hover:text-red-400'}`}
                                    onClick={(e) => handleLike(e, song)}
                                    disabled={likingId === song.id}
                                    title={song.isLiked ? t("unlike", { defaultValue: "Unlike" }) : t("like", { defaultValue: "Like" })}
                                >
                                    <Heart className={`w-4 h-4 ${song.isLiked ? 'fill-current' : ''}`} />
                                </Button>
                            )}
                            {!readOnly && (
                                <Button
                                    onClick={(e) => { e.stopPropagation(); onHighlight(song); onSelect(song); }}
                                    className="bg-blue-500 hover:bg-blue-600 text-white font-bold px-3 h-8 rounded-lg text-xs"
                                >
                                    {t("play", { defaultValue: "PLAY" })}
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <NeumorphicModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title={t("wipe-track-title", { defaultValue: "Wipe Track Data?" })}
                description={t("wipe-track-description", { defaultValue: "This will permanently delete the song, analysis data, and leaderboard entries. This action is irreversible." })}
                confirmText={t("purge", { defaultValue: "PURGE" })}
                cancelText={t("cancel", { defaultValue: "CANCEL" })}
                variant="danger"
            />
        </div>
    );
}
