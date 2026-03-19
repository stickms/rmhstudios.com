import { useState, useCallback, useEffect } from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import { useStudioStore } from '@/lib/studio/store';
import {
  KEYBIND_ACTIONS,
  getKeybindsByCategory,
  resolveKeybinds,
  findConflicts,
  eventToKeyString,
} from '@/lib/studio/keybinds';

export function KeybindSettings() {
  const { settings, setKeybindOverride, resetKeybinds } = useStudioStore();
  const [rebindingAction, setRebindingAction] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const keybindMap = resolveKeybinds(settings.keybindOverrides);
  const categories = getKeybindsByCategory();

  // Listen for key capture when rebinding
  useEffect(() => {
    if (!rebindingAction) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setRebindingAction(null);
        setConflict(null);
        return;
      }

      // Skip modifier-only presses
      if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return;

      const keyString = eventToKeyString(e);
      const conflicts = findConflicts(rebindingAction, keyString, keybindMap);

      if (conflicts.length > 0) {
        const conflictAction = KEYBIND_ACTIONS.find((a) => a.id === conflicts[0]);
        setConflict(`Conflicts with: ${conflictAction?.label || conflicts[0]}`);
        // Still set it — user can resolve later
      } else {
        setConflict(null);
      }

      setKeybindOverride(rebindingAction, [keyString]);
      setRebindingAction(null);
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [rebindingAction, keybindMap, setKeybindOverride]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--site-border)] px-4 py-2">
        <span className="text-sm font-medium text-[var(--site-text)]">Keyboard Shortcuts</span>
        <button
          onClick={resetKeybinds}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-[var(--site-muted)] hover:bg-white/10 hover:text-[var(--site-text)]"
        >
          <RotateCcw className="h-3 w-3" />
          Reset All
        </button>
      </div>

      {/* Conflict warning */}
      {conflict && (
        <div className="flex items-center gap-2 bg-yellow-500/10 px-4 py-1.5 text-xs text-yellow-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {conflict}
        </div>
      )}

      {/* Keybind list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
        {Object.entries(categories).map(([category, actions]) => (
          <div key={category}>
            <div className="sticky top-0 bg-[var(--site-surface)] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--site-muted)]">
              {category}
            </div>
            {actions.map((action) => {
              const keys = keybindMap[action.id] || action.defaultKeys;
              const isRebinding = rebindingAction === action.id;
              const isOverridden = action.id in settings.keybindOverrides;

              return (
                <div
                  key={action.id}
                  className="flex items-center justify-between px-4 py-1.5 hover:bg-white/3"
                >
                  <span className="text-xs text-[var(--site-text)]">{action.label}</span>
                  <button
                    onClick={() => setRebindingAction(isRebinding ? null : action.id)}
                    className={`min-w-[80px] rounded px-2 py-0.5 text-right font-mono text-[10px] ${
                      isRebinding
                        ? 'animate-pulse bg-cyan-500/20 text-cyan-400'
                        : isOverridden
                        ? 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20'
                        : 'bg-white/5 text-[var(--site-muted)] hover:bg-white/10'
                    }`}
                  >
                    {isRebinding ? 'Press a key...' : keys.join(', ')}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div className="border-t border-[var(--site-border)] px-4 py-2 text-[10px] text-[var(--site-muted)]">
        Click a shortcut to rebind. Press Escape to cancel. Purple = customized.
      </div>
    </div>
  );
}
