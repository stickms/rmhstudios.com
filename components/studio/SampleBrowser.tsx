import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, Upload, Play, Trash2, Search, Music } from 'lucide-react';
import { SampleManager } from '@/lib/studio/samples/SampleManager';
import { SAMPLE_PACKS } from '@/lib/studio/samples/sample-packs';
import type { SampleMeta } from '@/lib/studio/types';

export function SampleBrowser() {
  const { t } = useTranslation("c-studio");
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
    <div className="flex h-full flex-col border-r border-site-border bg-site-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-site-border px-3 py-2">
        <span className="text-xs font-semibold uppercase text-site-text-muted">{t("samples-heading", { defaultValue: "Samples" })}</span>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="rounded-site-sm p-1 text-site-text-muted hover:bg-site-surface-hover hover:text-site-text"
          title={t("upload-samples", { defaultValue: "Upload samples" })}
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
      <div className="border-b border-site-border px-2 py-1.5">
        <div className="flex items-center gap-1.5 rounded-site-sm bg-site-bg-subtle px-2 py-1">
          <Search className="h-3 w-3 text-site-text-muted" />
          <input
            type="text"
            placeholder={t("search-placeholder", { defaultValue: "Search..." })}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-xs text-site-text outline-none placeholder:text-site-text-muted"
          />
        </div>
      </div>

      {/* Tabs */}
      <LiquidTabs
        size="sm"
        className="m-2"
        aria-label={t("sample-source", { defaultValue: "Sample source" })}
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        tabs={[
          { id: 'user', label: t("my-samples-tab", { defaultValue: "My Samples" }) },
          { id: 'packs', label: t("packs-tab", { defaultValue: "Packs" }) },
        ]}
      />

      {/* Content */}
      <div
        className={`flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-site-border ${
          isDragOver ? 'bg-site-accent-dim' : ''
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {activeTab === 'user' ? (
          filteredSamples.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-4 text-center text-site-text-muted">
              <FolderOpen className="h-8 w-8 opacity-30" />
              <p className="text-xs">
                {isDragOver ? t("drop-files-here", { defaultValue: "Drop files here" }) : t("drag-drop-hint", { defaultValue: "Drag & drop audio files or click upload" })}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5 p-1">
              {filteredSamples.map((sample) => (
                <div
                  key={sample.id}
                  className="group flex items-center gap-2 rounded-site-sm px-2 py-1.5 hover:bg-site-surface-hover"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-studio-sample', sample.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  <Music className="h-3 w-3 shrink-0 text-site-text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-site-text">{sample.name}</p>
                    <p className="text-xs text-site-text-muted">
                      {formatDuration(sample.duration)} · {formatSize(sample.size)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(sample.id)}
                    className="hidden rounded-site-sm p-0.5 text-site-text-muted hover:text-site-danger group-hover:block"
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
              <div key={pack.id} className="rounded-site-sm border border-site-border bg-site-bg-subtle p-2">
                <p className="text-xs font-medium text-site-text">{pack.name}</p>
                <p className="mt-0.5 text-xs text-site-text-muted">{pack.description}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded-site-sm bg-site-accent-dim px-1.5 py-0.5 text-xs text-site-accent">
                    {t("samples-count", { defaultValue: "{{count}} samples", count: pack.samples.length })}
                  </span>
                  <span className="text-xs text-site-text-muted">{pack.license}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
