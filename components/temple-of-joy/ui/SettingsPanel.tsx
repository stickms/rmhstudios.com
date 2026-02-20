'use client';
import { useState } from 'react';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { saveToServer } from '@/lib/temple-of-joy/persistence';

export default function SettingsPanel() {
  const theme = useTempleStore((s) => s.theme);
  const numberFormat = useTempleStore((s) => s.numberFormat);
  const setTheme = useTempleStore((s) => s.setTheme);
  const setNumberFormat = useTempleStore((s) => s.setNumberFormat);
  const resetRun = useTempleStore((s) => s.resetRun);
  const state = useTempleStore((s) => s);

  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const dark = theme === 'dark';

  const handleSaveNow = () => {
    saveToServer(state)
      .then(() => setSaveStatus('Saved ✓'))
      .catch(() => setSaveStatus('Save failed'))
      .finally(() => setTimeout(() => setSaveStatus(null), 2500));
    setSaveStatus('Saving…');
  };

  const handleResetRun = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    resetRun();
    setConfirmReset(false);
  };

  // Shared styles
  const surface = { background: dark ? '#2c1d12' : '#f5f0e8' };
  const border = { borderColor: dark ? '#6b4c2a' : '#c4a97a' };
  const textColor = { color: dark ? '#e8d5b0' : '#3d2c1e' };

  const sectionCls = 'rounded-xl border p-4 space-y-3';
  const labelCls = 'text-xs font-semibold uppercase tracking-wider opacity-60';
  const rowCls = 'flex items-center justify-between gap-4';

  const pillBtn = (active: boolean) => ({
    ...surface,
    ...border,
    ...(active ? { background: dark ? '#d4a847' : '#8b6914', color: dark ? '#1a120b' : '#f5f0e8', borderColor: 'transparent' } : textColor),
  });

  return (
    <div
      className="p-4 space-y-4 max-w-md mx-auto"
      style={textColor}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-serif font-bold">⚙️ Settings</h2>
      </div>

      {/* Display */}
      <div className={sectionCls} style={{ ...surface, ...border }}>
        <p className={labelCls}>Display</p>

        {/* Theme */}
        <div className={rowCls}>
          <span className="text-sm">Theme</span>
          <div className="flex gap-1">
            {(['light', 'dark'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className="px-3 py-1 rounded-lg text-xs font-semibold border transition-colors"
                style={pillBtn(theme === t)}
              >
                {t === 'light' ? '☀️ Light' : '🌙 Dark'}
              </button>
            ))}
          </div>
        </div>

        {/* Number format */}
        <div className={rowCls}>
          <span className="text-sm">Numbers</span>
          <div className="flex gap-1">
            {(['abbreviated', 'scientific'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setNumberFormat(f)}
                className="px-3 py-1 rounded-lg text-xs font-semibold border transition-colors"
                style={pillBtn(numberFormat === f)}
              >
                {f === 'abbreviated' ? 'Abbrev.' : 'Scientific'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Save */}
      <div className={sectionCls} style={{ ...surface, ...border }}>
        <p className={labelCls}>Save Data</p>
        <button
          onClick={handleSaveNow}
          className="w-full py-2 rounded-lg text-xs font-semibold border transition-colors hover:opacity-80"
          style={{ ...surface, ...border, ...textColor }}
        >
          {saveStatus ?? '💾 Save Now'}
        </button>
      </div>

      {/* Danger zone */}
      <div
        className={sectionCls}
        style={{
          background: dark ? '#2c1212' : '#fdf0f0',
          borderColor: dark ? '#7a2929' : '#e9b4b4',
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-red-500 opacity-70">
          Danger Zone
        </p>
        <button
          onClick={handleResetRun}
          onBlur={() => setConfirmReset(false)}
          className="w-full py-2 rounded-lg text-xs font-semibold border border-red-500 text-red-500 transition-colors hover:bg-red-500 hover:text-white"
        >
          {confirmReset ? '⚠️ Click again to confirm reset' : '🔄 Reset Run'}
        </button>
        {confirmReset && (
          <p className="text-xs opacity-60 text-center">
            This will reset your current run (but keep Bliss Shards &amp; achievements).
          </p>
        )}
      </div>
    </div>
  );
}
