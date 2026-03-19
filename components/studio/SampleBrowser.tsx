import { useState, useEffect, useCallback, useRef } from 'react';
import { FolderOpen, Upload, Play, Trash2, Search, Music } from 'lucide-react';
import { SampleManager } from '@/lib/studio/samples/SampleManager';
import { SAMPLE_PACKS } from '@/lib/studio/samples/sample-packs';
import type { SampleMeta } from '@/lib/studio/types';

export function SampleBrowser() {
  const [samples, setSamples] = useState<SampleMeta[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'user' | 'packs'>('user');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load samples list
  useEffect(() => {
    SampleManager.getInstance().list().then(setSamples);
  }, []);

  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    const manager = SampleManager.getInstance();
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('audio/')) continue;
      await manager.importFile(file);
    }
    const updated = await manager.list();
    setSamples(updated);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  }, [handleFileUpload]);

  const handleDelete = useCallback(async (id: string) => {
    await SampleManager.getInstance().remove(id);
    setSamples((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const filteredSamples = samples.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.folder.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex h-full flex-col border-r border-[var(--site-border)] bg-[var(--site-surface)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--site-border)] px-3 py-2">
        <span className="text-xs font-semibold uppercase text-[var(--site-muted)]">Samples</span>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="rounded p-1 text-[var(--site-muted)] hover:bg-white/10 hover:text-[var(--site-text)]"
          title="Upload samples"
        >
          <Upload className="h-3.5 w-3.5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
        />
      </div>

      {/* Search */}
      <div className="border-b border-[var(--site-border)] px-2 py-1.5">
        <div className="flex items-center gap-1.5 rounded bg-black/30 px-2 py-1">
          <Search className="h-3 w-3 text-[var(--site-muted)]" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-xs text-[var(--site-text)] outline-none placeholder:text-[var(--site-muted)]"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--site-border)]">
        <button
          onClick={() => setActiveTab('user')}
          className={`flex-1 py-1.5 text-[10px] font-medium ${
            activeTab === 'user' ? 'border-b-2 border-cyan-400 text-cyan-400' : 'text-[var(--site-muted)]'
          }`}
        >
          My Samples
        </button>
        <button
          onClick={() => setActiveTab('packs')}
          className={`flex-1 py-1.5 text-[10px] font-medium ${
            activeTab === 'packs' ? 'border-b-2 border-cyan-400 text-cyan-400' : 'text-[var(--site-muted)]'
          }`}
        >
          Packs
        </button>
      </div>

      {/* Content */}
      <div
        className={`flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 ${
          isDragOver ? 'bg-cyan-500/5' : ''
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {activeTab === 'user' ? (
          filteredSamples.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-4 text-center text-[var(--site-muted)]">
              <FolderOpen className="h-8 w-8 opacity-30" />
              <p className="text-xs">
                {isDragOver ? 'Drop files here' : 'Drag & drop audio files or click upload'}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5 p-1">
              {filteredSamples.map((sample) => (
                <div
                  key={sample.id}
                  className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-white/5"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-studio-sample', sample.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  <Music className="h-3 w-3 shrink-0 text-[var(--site-muted)]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] text-[var(--site-text)]">{sample.name}</p>
                    <p className="text-[9px] text-[var(--site-muted)]">
                      {formatDuration(sample.duration)} · {formatSize(sample.size)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(sample.id)}
                    className="hidden rounded p-0.5 text-[var(--site-muted)] hover:text-red-400 group-hover:block"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-2 p-2">
            {SAMPLE_PACKS.map((pack) => (
              <div key={pack.id} className="rounded border border-[var(--site-border)] bg-black/20 p-2">
                <p className="text-xs font-medium text-[var(--site-text)]">{pack.name}</p>
                <p className="mt-0.5 text-[9px] text-[var(--site-muted)]">{pack.description}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[9px] text-cyan-400">
                    {pack.samples.length} samples
                  </span>
                  <span className="text-[9px] text-[var(--site-muted)]">{pack.license}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
