/**
 * ProjectDialog — Save/Load/Export/Import project modal.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useStudioStore } from '@/lib/rmhstudio/store';
import {
  saveProject,
  loadProject,
  listProjects,
  deleteProject,
  exportProjectJSON,
  importProjectJSON,
  type ProjectSummary,
} from '@/lib/rmhstudio/storage';

interface ProjectDialogProps {
  mode: 'save' | 'load';
  open: boolean;
  onClose: () => void;
}

export default function ProjectDialog({ mode, open, onClose }: ProjectDialogProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const getProjectData = useStudioStore(s => s.getProjectData);
  const loadProjectToStore = useStudioStore(s => s.loadProject);
  const projectName = useStudioStore(s => s.projectName);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await listProjects();
    setProjects(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleSave = useCallback(async () => {
    const data = getProjectData();
    await saveProject(data);
    await refresh();
    onClose();
  }, [getProjectData, refresh, onClose]);

  const handleLoad = useCallback(async (id: string) => {
    const proj = await loadProject(id);
    if (proj) {
      loadProjectToStore(proj);
      onClose();
    }
  }, [loadProjectToStore, onClose]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteProject(id);
    await refresh();
  }, [refresh]);

  const handleExport = useCallback(() => {
    const data = getProjectData();
    const json = exportProjectJSON(data);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.name.replace(/\s+/g, '-').toLowerCase()}.rmhstudio.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [getProjectData]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const proj = importProjectJSON(text);
        await saveProject(proj);
        loadProjectToStore(proj);
        onClose();
      } catch {
        alert('Invalid project file.');
      }
    };
    input.click();
  }, [loadProjectToStore, onClose]);

  if (!open) return null;

  return (
    <div className="rstudio-dialog-overlay" onClick={onClose}>
      <div className="rstudio-dialog" onClick={e => e.stopPropagation()}>
        <h2>{mode === 'save' ? 'Save Project' : 'Open Project'}</h2>

        {mode === 'save' && (
          <div className="flex flex-col gap-3 mb-4">
            <p style={{ fontSize: 13, color: 'var(--rstudio-text-muted)' }}>
              Save &quot;{projectName}&quot; to local storage.
            </p>
            <div className="flex gap-2">
              <button className="rstudio-dialog-btn primary" onClick={handleSave}>
                Save
              </button>
              <button className="rstudio-dialog-btn" onClick={handleExport}>
                Export JSON
              </button>
              <button className="rstudio-dialog-btn" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {mode === 'load' && (
          <div className="flex flex-col gap-3">
            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--rstudio-text-dim)' }}>Loading...</p>
            ) : projects.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--rstudio-text-dim)' }}>
                No saved projects. Save one first or import a JSON file.
              </p>
            ) : (
              <div className="rstudio-project-list">
                {projects.map(p => (
                  <div key={p.id} className="rstudio-project-item">
                    <div>
                      <div style={{ fontSize: 13 }}>{p.name}</div>
                      <div className="rstudio-project-meta">
                        {p.bpm} BPM &middot; {new Date(p.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        className="rstudio-dialog-btn primary"
                        style={{ padding: '4px 10px', fontSize: 11 }}
                        onClick={() => handleLoad(p.id)}
                      >
                        Open
                      </button>
                      <button
                        className="rstudio-dialog-btn danger"
                        style={{ padding: '4px 10px', fontSize: 11 }}
                        onClick={() => handleDelete(p.id)}
                      >
                        Del
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button className="rstudio-dialog-btn" onClick={handleImport}>
                Import JSON
              </button>
              <button className="rstudio-dialog-btn" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
