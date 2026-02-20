
'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Upload, Play, Pause } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/store/useGameStore';
import { GameEngine } from '@/lib/game/GameEngine';
import * as metadata from 'music-metadata-browser';

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
    _count?: {
        scores: number;
    }
}

export function SongLibrary({ onSelect, onHighlight, selectedSongId }: { 
    onSelect: (song: Song) => void;
    onHighlight: (song: Song) => void;
    selectedSongId: string | null;
}) {
    const [songs, setSongs] = useState<Song[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
    
    // Global Volume
    const { volume } = useGameStore();
    
    // Upload State
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadTitle, setUploadTitle] = useState("");
    const [uploadArtist, setUploadArtist] = useState("");
    const [uploadBpm, setUploadBpm] = useState('120');
    const [uploadDuration, setUploadDuration] = useState(0);
    const [uploadDescription, setUploadDescription] = useState("");
    
    const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
    const [previewId, setPreviewId] = useState<string | null>(null);
    
    const session = authClient.useSession();
    const router = useRouter();

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

    const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10 MB

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > MAX_AUDIO_SIZE) {
            toast.error(`Audio file too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 10 MB.`);
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
            const tags = await metadata.parseBlob(file);
            if (tags.common.title) setUploadTitle(tags.common.title);
            if (tags.common.artist) setUploadArtist(tags.common.artist);
            if (tags.common.bpm) setUploadBpm(Math.round(tags.common.bpm).toString());
        } catch (error) {
            console.log('Error reading tags:', error);
        }
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uploadFile || !session.data) return;

        setIsUploading(true);
        setUploadProgress(0);

        const formData = new FormData();
        formData.append('file', uploadFile);
        formData.append('title', uploadTitle);
        formData.append('artist', uploadArtist);
        formData.append('bpm', uploadBpm);
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
                toast.success("Track uploaded successfully!");
                fetchSongs();
                // Auto-close dialog after a brief moment
                setTimeout(() => {
                    setUploadDialogOpen(false);
                    setUploadProgress(0);
                    setIsUploading(false);
                }, 600);
            } else {
                toast.error("Upload failed");
                setIsUploading(false);
                setUploadProgress(0);
            }
        });

        xhr.addEventListener('error', () => {
            toast.error("Upload error");
            setIsUploading(false);
            setUploadProgress(0);
        });

        xhr.open('POST', '/api/slice-it/songs/upload');
        xhr.send(formData);
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

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure? This cannot be undone.")) return;
        
        try {
            const res = await fetch(`/api/slice-it/songs/${id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchSongs();
                toast.success("Song deleted");
            } else {
                toast.error("Failed to delete song.");
            }
        } catch (e) {
            console.error(e);
            toast.error("Error deleting song.");
        }
    };

    return (
        <div className="w-full h-full bg-[#e0e5ec] flex flex-col">
            {/* Header / Search */}
            <div className="flex gap-2 items-center shrink-0 p-3 border-b border-slate-300">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <Input
                        placeholder="Search songs, artists..."
                        className="pl-9 bg-white border border-slate-300 rounded-lg h-9 text-sm text-slate-700 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-blue-500"
                        value={searchTerm}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Dialog open={uploadDialogOpen} onOpenChange={(open) => { if (!isUploading) setUploadDialogOpen(open); }}>
                    <DialogTrigger asChild>
                         <Button className="h-9 w-9 rounded-lg bg-blue-500 text-white hover:bg-blue-600 p-0">
                            <Upload className="w-4 h-4" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#e0e5ec] border-none shadow-2xl rounded-2xl max-w-lg">
                        <DialogHeader>
                            <DialogTitle className="text-slate-700 font-black">UPLOAD TRACK</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleUpload} className="space-y-4">
                            {!uploadFile ? (
                                <div className="p-8 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-500 relative bg-slate-50/50 h-64 transition-colors hover:bg-slate-100/50">
                                    <input 
                                        type="file" 
                                        accept="audio/*"
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                        onChange={handleFileSelect}
                                    />
                                    <Upload className="w-12 h-12 mb-4 text-slate-400" />
                                    <span className="font-bold text-lg">Click to select audio file</span>
                                    <span className="text-sm text-slate-400 mt-2">MP3, WAV supported</span>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                     <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex items-center justify-between">
                                        <div className="font-bold text-blue-600 truncate max-w-[200px]">{uploadFile.name}</div>
                                        <Button type="button" variant="ghost" size="sm" onClick={() => setUploadFile(null)} className="text-blue-400 hover:text-blue-600">Change</Button>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-400 uppercase">Title</label>
                                            <Input value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} className="bg-white text-slate-700 placeholder:text-slate-400" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-400 uppercase">Artist</label>
                                            <Input value={uploadArtist} onChange={e => setUploadArtist(e.target.value)} className="bg-white text-slate-700 placeholder:text-slate-400" />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-400 uppercase">BPM (Auto-detect if 0)</label>
                                        <Input 
                                            type="number" 
                                            value={uploadBpm} 
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUploadBpm(e.target.value)}
                                            className="bg-white text-slate-700 placeholder:text-slate-400"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-400 uppercase">Description (Optional)</label>
                                        <Input 
                                            value={uploadDescription} 
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUploadDescription(e.target.value)}
                                            className="bg-white text-slate-700 placeholder:text-slate-400"
                                            placeholder="Tell us about this track..."
                                        />
                                    </div>
                                </div>
                            )}

                            {isUploading && (
                                <div className="space-y-2 mt-4">
                                    <div className="flex justify-between text-xs font-bold text-slate-500">
                                        <span>UPLOADING...</span>
                                        <span>{uploadProgress}%</span>
                                    </div>
                                    <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                                            style={{ width: `${uploadProgress}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            <Button type="submit" disabled={isUploading || !uploadFile} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold h-12 rounded-xl mt-4">
                                {isUploading ? `UPLOADING... ${uploadProgress}%` : 'UPLOAD TRACK'}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Song List */}
            <div className="flex-1 overflow-y-auto p-2">
                {songs.filter(s => s.title.toLowerCase().includes(searchTerm.toLowerCase())).map(song => (
                    <div
                        key={song.id}
                        className={`p-2 flex items-center justify-between group hover:bg-slate-100 transition-all cursor-pointer border-l-4 ${selectedSongId === song.id ? 'bg-blue-50 border-l-blue-500' : 'bg-transparent border-l-transparent'}`}
                        onClick={() => onHighlight(song)}
                    >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="w-8 h-8 rounded-full bg-slate-200 text-blue-500 hover:bg-slate-300 shrink-0"
                                onClick={(e) => { e.stopPropagation(); togglePreview(song); }}
                            >
                                {previewId === song.id && previewAudio && !previewAudio.paused ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                            </Button>

                            {/* Thumbnail */}
                            <div className="w-10 h-10 rounded-md bg-slate-300 shrink-0 overflow-hidden relative">
                                {song.coverUrl ? (
                                    <img src={song.coverUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-bold text-xs">
                                        {song.title.charAt(0)}
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-slate-700 text-sm leading-tight truncate">{song.title}</div>
                                <div className="text-xs text-slate-500 truncate">{song.artist} • {song.bpm} BPM • {Math.floor(song.duration / 60)}:{Math.round(song.duration % 60).toString().padStart(2, '0')}</div>
                                {session.data?.user?.id === song.uploadedBy && (
                                    <div className="text-[10px] text-blue-500 font-bold">UPLOADED BY YOU</div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                             {session.data?.user?.id === song.uploadedBy && (
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={(e) => { e.stopPropagation(); handleDelete(song.id); }}
                                    className="h-8 w-8 p-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Delete Song"
                                >
                                    <span className="sr-only">Delete</span>
                                    <span className="text-xs font-bold">✕</span>
                                </Button>
                            )}
                            <Button
                                onClick={(e) => { e.stopPropagation(); onHighlight(song); }}
                                className="bg-blue-500 hover:bg-blue-600 text-white font-bold px-3 h-8 rounded-lg text-xs"
                            >
                                PLAY
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

        </div>
    );
}
