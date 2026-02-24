'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Play, Settings, X, Check, ImagePlus, Heart } from 'lucide-react';
import { Leaderboard } from './Leaderboard';
import { SongComments } from './SongComments';
import { useGameStore, Difficulty } from '@/lib/store/useGameStore';
import { Slider } from '@/components/ui/slider';
import { authClient } from '@/lib/auth-client';
import { toast } from 'sonner';
import { calculateScoreMultiplier } from '@/lib/game/score';

interface Song {
    id: string;
    title: string;
    artist: string;
    bpm: number;
    duration: number;
    audioUrl: string;
    coverUrl?: string; // Added coverUrl
    description?: string;
    uploadedBy: string;
    uploader: { name: string };
    plays?: number;
    likeCount?: number;
    isLiked?: boolean;
    userPlays?: number;
    _count?: {
        scores: number;
        likes: number;
    }
}

interface SongDetailsPanelProps {
    song: Song | null;
    onPlay: (song: Song) => void;
    onSongUpdated?: (updates: Partial<Song>) => void;
    readOnly?: boolean;
}

const ModifierToggle = ({ label, active, onClick, color }: { label: string, active: boolean, onClick: () => void, color: string }) => (
    <div className="flex justify-between items-center bg-slice-shadow-dark/20 hover:bg-slice-shadow-dark/50 p-2 rounded-lg border border-slice-shadow-dark/50 cursor-pointer transition-all" onClick={onClick}>
        <span className="text-xs text-slice-text font-bold uppercase select-none">{label}</span>
        <div
            className={`w-10 h-5 rounded-full transition-colors relative ${active ? '' : 'bg-slice-shadow-dark'}`}
            style={{backgroundColor: active ? color : undefined}}
        >
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${active ? 'left-5' : 'left-0.5'}`} />
        </div>
    </div>
);

export function SongDetailsPanel({ song, onPlay, onSongUpdated, readOnly = false }: SongDetailsPanelProps) {
    const { modifiers, setModifiers } = useGameStore();
    const session = authClient.useSession();
    const isOwner = !!session.data?.user?.id && session.data.user.id === song?.uploadedBy;

    // Edit state
    const [showEdit, setShowEdit] = React.useState(false);
    const [editTitle, setEditTitle] = React.useState('');
    const [editArtist, setEditArtist] = React.useState('');
    const [editBpm, setEditBpm] = React.useState('');
    const [editDescription, setEditDescription] = React.useState('');
    const [editCoverFile, setEditCoverFile] = React.useState<File | null>(null);
    const [editCoverPreview, setEditCoverPreview] = React.useState<string | null>(null);
    const [isSaving, setIsSaving] = React.useState(false);
    const [isLiking, setIsLiking] = React.useState(false);

    const handleLike = async () => {
        if (!song || isLiking) return;
        setIsLiking(true);
        try {
            const res = await fetch(`/api/slice-it/songs/${song.id}/like`, { method: 'POST' });
            if (!res.ok) throw new Error();
            const data = await res.json();
            onSongUpdated?.({
                isLiked: data.liked,
                likeCount: (song.likeCount || 0) + (data.liked ? 1 : -1)
            });
        } catch (e) {
            // silent
        } finally {
            setIsLiking(false);
        }
    };

    const openEdit = () => {
        if (!song) return;
        setEditTitle(song.title);
        setEditArtist(song.artist);
        setEditBpm(String(Math.round(song.bpm)));
        setEditDescription(song.description ?? '');
        setEditCoverFile(null);
        setEditCoverPreview(null);
        setShowEdit(true);
    };

    const MAX_COVER_SIZE = 10 * 1024 * 1024; // 10 MB

    const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > MAX_COVER_SIZE) {
            toast.error(`Cover image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 10 MB.`);
            e.target.value = '';
            return;
        }
        setEditCoverFile(file);
        const url = URL.createObjectURL(file);
        setEditCoverPreview(url);
    };

    const handleSave = async () => {
        if (!song) return;
        setIsSaving(true);
        try {
            const formData = new FormData();
            formData.append('title', editTitle);
            formData.append('artist', editArtist);
            formData.append('bpm', editBpm);
            formData.append('description', editDescription);
            if (editCoverFile) formData.append('cover', editCoverFile);

            const res = await fetch(`/api/slice-it/songs/${song.id}`, {
                method: 'PATCH',
                body: formData,
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            const newCoverUrl = data.song?.coverUrl ?? song.coverUrl;
            const newBpm = parseFloat(editBpm) || song.bpm;
            onSongUpdated?.({ title: editTitle, artist: editArtist, bpm: newBpm, description: editDescription, coverUrl: newCoverUrl });
            setShowEdit(false);
            if (editCoverPreview) URL.revokeObjectURL(editCoverPreview);
            setEditCoverFile(null);
            setEditCoverPreview(null);
            toast.success('Track updated');
        } catch (e: any) {
            toast.error('Failed to save: ' + (e.message ?? 'Unknown error'));
        } finally {
            setIsSaving(false);
        }
    };

    if (!song) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slice-text-light opacity-50 space-y-4">
                <div className="w-32 h-32 rounded-lg bg-slice-shadow-dark animate-pulse" />
                <div className="font-bold text-lg text-center">
                    Select a track to begin
                </div>
            </div>
        );
    }

    const getScoreMultiplier = () => {
        return calculateScoreMultiplier(modifiers);
    };

    return (
        <>
            {/* Edit Modal */}
            {showEdit && (
                <div className="fixed inset-0 z-200 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowEdit(false)} />
                    <div className="relative bg-slice-bg rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-black text-slice-text uppercase tracking-tight">Edit Track</h3>
                            <button className="w-8 h-8 rounded-full flex items-center justify-center text-slice-text-light hover:text-slice-text-darker hover:bg-slice-shadow-dark/50 transition-colors" onClick={() => setShowEdit(false)}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex flex-col gap-3">
                            {/* Cover Image */}
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slice-text-light uppercase tracking-wider">Cover Image</label>
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-slice-shadow-dark/50 border-2 border-dashed border-slice-shadow-dark/50 group-hover:border-blue-400 transition-colors shrink-0 relative">
                                        {(editCoverPreview || song?.coverUrl) ? (
                                            <img src={editCoverPreview ?? song?.coverUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-slice-text-light">
                                                <ImagePlus className="w-6 h-6" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-sm font-bold text-blue-500 group-hover:text-blue-600">{editCoverFile ? editCoverFile.name : 'Click to change cover'}</span>
                                        <span className="text-xs text-slice-text-light">PNG, JPG, WebP</span>
                                    </div>
                                    <input type="file" accept="image/*" className="hidden" onChange={handleCoverSelect} />
                                </label>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slice-text-light uppercase tracking-wider">Title</label>
                                <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="bg-(--slice-input-bg) text-slice-text border-(--slice-input-border) shadow-[inset_2px_2px_4px_var(--slice-shadow-dark),inset_-2px_-2px_4px_var(--slice-shadow-light)]" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slice-text-light uppercase tracking-wider">Artist</label>
                                <Input value={editArtist} onChange={e => setEditArtist(e.target.value)} className="bg-(--slice-input-bg) text-slice-text border-(--slice-input-border) shadow-[inset_2px_2px_4px_var(--slice-shadow-dark),inset_-2px_-2px_4px_var(--slice-shadow-light)]" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slice-text-light uppercase tracking-wider">BPM</label>
                                <Input type="number" value={editBpm} onChange={e => setEditBpm(e.target.value)} className="bg-(--slice-input-bg) text-slice-text border-(--slice-input-border) shadow-[inset_2px_2px_4px_var(--slice-shadow-dark),inset_-2px_-2px_4px_var(--slice-shadow-light)]" placeholder="e.g. 120" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slice-text-light uppercase tracking-wider">Description</label>
                                <Input value={editDescription} onChange={e => setEditDescription(e.target.value)} className="bg-(--slice-input-bg) text-slice-text border-(--slice-input-border) shadow-[inset_2px_2px_4px_var(--slice-shadow-dark),inset_-2px_-2px_4px_var(--slice-shadow-light)]" placeholder="Optional description..." />
                            </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <Button variant="ghost" className="flex-1 text-slice-text-muted" onClick={() => setShowEdit(false)} disabled={isSaving}>Cancel</Button>
                            <Button className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold gap-2" onClick={handleSave} disabled={isSaving}>
                                <Check className="w-4 h-4" />
                                {isSaving ? 'Saving...' : 'Save'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col">
            {/* Header / Info */}
            <div className="p-4 bg-slice-bg border-b border-slice-shadow-dark/30">
                <div className="flex gap-4 items-start">
                    {/* Cover Art */}
                    <div className="w-32 h-32 rounded-lg bg-slice-shadow-dark shrink-0 overflow-hidden relative shadow-lg">
                         {song.coverUrl ? (
                             <img src={song.coverUrl} alt={song.title} className="w-full h-full object-cover" />
                         ) : (
                             <div className="flex items-center justify-center h-full text-slice-text-light font-black text-5xl select-none">
                                 {song.title.charAt(0)}
                             </div>
                         )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                            <h2 className="text-2xl font-black text-slice-text leading-tight mb-1">{song.title}</h2>
                            {isOwner && (
                                <button
                                    className="shrink-0 w-8 h-8 rounded-full bg-slice-shadow-dark/50 hover:bg-slice-shadow-dark border border-slice-shadow-dark/30 flex items-center justify-center text-slice-text-light hover:text-slice-text-darker transition-colors mt-0.5"
                                    onClick={openEdit}
                                    title="Edit track info"
                                >
                                    <Settings className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <div className="text-blue-500 font-bold text-lg mb-3">{song.artist}</div>

                        <div className="grid grid-cols-3 gap-3">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-slice-text-light uppercase">Tempo</span>
                                <span className="font-mono text-slice-text font-bold text-sm">{Math.round(song.bpm)} BPM</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-slice-text-light uppercase">Duration</span>
                                <span className="font-mono text-slice-text font-bold text-sm">{Math.floor(song.duration / 60)}:{Math.round(song.duration % 60).toString().padStart(2, '0')}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-slice-text-light uppercase">Difficulty</span>
                                <span className={`font-mono font-bold text-sm ${
                                    modifiers.difficulty === 'easy' ? 'text-green-500' :
                                    modifiers.difficulty === 'normal' ? 'text-blue-500' :
                                    modifiers.difficulty === 'hard' ? 'text-orange-500' :
                                    'text-red-500'
                                }`}>{modifiers.difficulty.toUpperCase()}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                            <div className="flex items-center gap-1.5 bg-slice-shadow-dark/20 px-2 py-1 rounded-md border border-slice-shadow-dark/30" title="Total plays">
                                <Play className="w-3 h-3 text-blue-500 fill-current" />
                                <span className="text-xs font-bold text-slice-text">{song.plays || 0}</span>
                            </div>
                            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors ${song.isLiked ? 'bg-red-500/10 border-red-500/30' : 'bg-slice-shadow-dark/20 border-slice-shadow-dark/30'}`} title="Likes">
                                <Heart className={`w-3 h-3 ${song.isLiked ? 'text-red-500 fill-current' : 'text-slice-text-light'}`} />
                                <span className={`text-xs font-bold ${song.isLiked ? 'text-red-500' : 'text-slice-text'}`}>{song.likeCount || 0}</span>
                            </div>
                            {song.userPlays !== undefined && (
                                <div className="flex items-center gap-1.5 bg-blue-500/10 px-2 py-1 rounded-md border border-blue-500/30" title="Your plays">
                                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wide">YOU</span>
                                    <span className="text-xs font-bold text-blue-500">{song.userPlays}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Play Button & Multiplier */}
                {!readOnly && (
                    <div className="mt-4 flex items-center gap-3">
                        <Button
                            className="flex-1 h-14 bg-blue-500 hover:bg-blue-600 text-white font-bold text-base rounded-lg active:scale-95 transition-all flex items-center justify-center gap-3 group"
                            onClick={() => onPlay(song)}
                        >
                            <Play className="w-6 h-6 fill-current group-hover:scale-110 transition-transform" />
                            <span className="uppercase tracking-wide">Start Game</span>
                        </Button>
                        <Button
                            variant="ghost"
                            className={`h-14 w-14 rounded-lg border flex items-center justify-center transition-all ${
                                song.isLiked
                                    ? 'bg-red-500/10 border-red-500/50 text-red-500 shadow-[inset_2px_2px_4px_rgba(239,68,68,0.2)]'
                                    : 'bg-slice-card-bg border-slice-shadow-dark/50 text-slice-text-light hover:text-red-400 hover:border-red-400/50'
                            }`}
                            onClick={handleLike}
                            disabled={isLiking}
                        >
                            <Heart className={`w-6 h-6 transition-transform ${song.isLiked ? 'fill-current scale-110' : 'group-hover:scale-110'}`} />
                        </Button>
                        <div className="flex flex-col items-center px-4 py-2 bg-slice-card-bg rounded-lg border border-slice-shadow-dark/50">
                            <div className="text-[10px] font-bold text-slice-text-light uppercase">Multiplier</div>
                            <div className="text-xl font-black text-blue-500 tabular-nums">x{getScoreMultiplier().toFixed(2)}</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modifiers Section */}
            <div className="p-4 border-b border-slice-shadow-dark/30">
                <h3 className="text-sm font-bold text-slice-text uppercase mb-3">Difficulty</h3>
                <div className="grid grid-cols-4 gap-1.5 mb-4">
                    {(['easy', 'normal', 'hard', 'expert'] as Difficulty[]).map(d => {
                        const isActive = modifiers.difficulty === d;
                        const colorMap: Record<Difficulty, string> = {
                            easy: '#22c55e',
                            normal: '#3b82f6',
                            hard: '#f97316',
                            expert: '#ef4444'
                        };
                        const noteMap: Record<Difficulty, string> = {
                            easy: '70%',
                            normal: '100%',
                            hard: '150%',
                            expert: '200%'
                        };
                        return (
                            <button
                                key={d}
                                onClick={() => setModifiers({ ...modifiers, difficulty: d })}
                                className={`px-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all border ${
                                    isActive
                                        ? 'text-white shadow-md scale-[1.02]'
                                        : 'bg-slice-shadow-dark/20 text-slice-text-light border-slice-shadow-dark/30 hover:bg-slice-shadow-dark/50'
                                }`}
                                style={isActive ? { backgroundColor: colorMap[d], borderColor: colorMap[d] } : undefined}
                            >
                                <div>{d}</div>
                                <div className={`text-[10px] font-normal mt-0.5 ${isActive ? 'text-white/80' : 'text-slice-text-muted'}`}>{noteMap[d]} notes</div>
                            </button>
                        );
                    })}
                </div>

                <h3 className="text-sm font-bold text-slice-text uppercase mb-3">Game Modifiers</h3>
                <div className="grid grid-cols-2 gap-2 mb-4">
                    <ModifierToggle
                        label="Invisible"
                        active={modifiers.invisible}
                        onClick={() => setModifiers({...modifiers, invisible: !modifiers.invisible})}
                        color="#a855f7"
                    />
                    <ModifierToggle
                        label="Bombs"
                        active={modifiers.bombs}
                        onClick={() => setModifiers({...modifiers, bombs: !modifiers.bombs})}
                        color="#f97316"
                    />
                    <ModifierToggle
                        label="Switching"
                        active={modifiers.switching}
                        onClick={() => setModifiers({...modifiers, switching: !modifiers.switching, oneTrack: !modifiers.switching ? false : modifiers.oneTrack})}
                        color="#3b82f6"
                    />
                    <ModifierToggle
                        label="Spin"
                        active={modifiers.spin}
                        onClick={() => setModifiers({...modifiers, spin: !modifiers.spin})}
                        color="#06b6d4"
                    />
                    <ModifierToggle
                        label="Strict Timing"
                        active={modifiers.strictTiming}
                        onClick={() => setModifiers({...modifiers, strictTiming: !modifiers.strictTiming})}
                        color="#dc2626"
                    />
                    <ModifierToggle
                        label="One Track"
                        active={modifiers.oneTrack}
                        onClick={() => setModifiers({...modifiers, oneTrack: !modifiers.oneTrack, switching: !modifiers.oneTrack ? false : modifiers.switching})}
                        color="#8b5cf6"
                    />
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xs font-bold text-slice-text-muted uppercase">Playback Speed</h3>
                        <div className="flex items-center gap-2">
                            {modifiers.speed < 1.0 && (
                                <span className="text-[9px] font-bold uppercase tracking-wide bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full">Unranked</span>
                            )}
                            <span className="text-blue-500 font-mono font-bold text-sm">x{modifiers.speed.toFixed(1)}</span>
                        </div>
                    </div>
                    <div className="bg-slice-shadow-dark/50 p-3 rounded-lg border border-slice-shadow-dark/50">
                        <Slider
                            value={[modifiers.speed]}
                            min={0.5}
                            max={2.0}
                            step={0.1}
                            onValueChange={(vals) => setModifiers({...modifiers, speed: vals[0]})}
                            className="cursor-pointer mb-2"
                        />
                        <div className="flex justify-between px-1 text-[9px] text-slice-text-light font-mono select-none">
                            <span>0.5x</span><span>1.0x</span><span>1.5x</span><span>2.0x</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Leaderboard Section */}
            <div className="p-4 border-b border-slice-shadow-dark/30">
                <h3 className="text-sm font-bold text-slice-text uppercase mb-3">Leaderboard</h3>
                <div className="bg-slice-shadow-dark/20 rounded-lg border border-slice-shadow-dark/50 p-3 max-h-[300px] overflow-y-auto">
                    <Leaderboard songId={song.id} />
                </div>
            </div>

            {/* Comments Section */}
            <div className="p-4">
                <h3 className="text-sm font-bold text-slice-text uppercase mb-3">Comments</h3>
                <div className="bg-slice-shadow-dark/20 rounded-lg border border-slice-shadow-dark/50 p-3 min-h-[200px]">
                    <SongComments songId={song.id} />
                </div>
            </div>
        </div>
        </>
    );
}
