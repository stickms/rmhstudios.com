import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Circle } from 'lucide-react';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useStudioStore } from '@/lib/studio/store';
import { useLiveMidi } from '@/lib/studio/midi/live-store';
import { MAX_INPUT_LATENCY_MS, RECORD_QUANTIZE_VALUES, recordRefusal, type RecordQuantize } from '@/lib/studio/record';

const NO_INPUT = '__none__';

/**
 * The record button and the "Recording" popover beside it. The button is disabled, with its reason in the label
 * and the tooltip, when no MIDI track is armed or the loop is on; its text for assistive technology names the state (Recording,
 * Count-in) and is announced politely. The popover holds count-in, quantize, input latency and the MIDI keyboard.
 */
export function RecordControls() {
  const { t } = useTranslation('studio-record');
  const isRecording = useStudioStore((s) => s.isRecording);
  const phase = useStudioStore((s) => s.recordPhase);
  const setIsRecording = useStudioStore((s) => s.setIsRecording);
  const refusal = useStudioStore((s) => recordRefusal(s));

  const disabled = !isRecording && refusal !== null;
  const reason =
    refusal === 'loop-on'
      ? t('record-needs-loop-off', { defaultValue: 'Turn off the loop to record' })
      : t('record-needs-arm', {
          defaultValue: 'Arm a MIDI track to record',
        });
  const stateText =
    phase === 'count-in'
      ? t('state-count-in', { defaultValue: 'Count-in' })
      : phase === 'recording'
        ? t('state-recording', { defaultValue: 'Recording' })
        : t('state-record', { defaultValue: 'Record' });

  return (
    <div className="flex items-center">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={isRecording}
        onClick={() => setIsRecording(!isRecording)}
        title={disabled ? reason : stateText}
        aria-describedby={disabled ? 'studio-record-reason' : undefined}
        className={`min-h-9 rounded-app-sm p-1.5 pointer-coarse:min-h-11 ${isRecording ? 'bg-app-danger/15 text-app-danger' : 'text-app-text-muted hover:bg-app-surface-hover hover:text-app-text'} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <Circle className="h-4 w-4" fill={isRecording ? 'currentColor' : 'none'} aria-hidden />
        <span className="sr-only">{stateText}</span>
      </button>
      {disabled && (
        <span id="studio-record-reason" className="sr-only">
          {reason}
        </span>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {phase === 'idle' ? '' : stateText}
      </span>
      <RecordingPopover />
    </div>
  );
}

function RecordingPopover() {
  const { t } = useTranslation('studio-record');
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const settings = useStudioStore((s) => s.settings);
  const updateSettings = useStudioStore((s) => s.updateSettings);
  const midiStatus = useLiveMidi((s) => s.status);
  const midiInputs = useLiveMidi((s) => s.inputs);
  const enableMidi = useLiveMidi((s) => s.enable);

  const quantizeLabel = (q: RecordQuantize) => {
    switch (q) {
      case 'off':
        return t('quantize-off', { defaultValue: 'Off' });
      case '1/4':
        return t('quantize-quarter', { defaultValue: '1/4' });
      case '1/8':
        return t('quantize-eighth', { defaultValue: '1/8' });
      case '1/16':
        return t('quantize-sixteenth', { defaultValue: '1/16' });
    }
  };

  const savedName = settings.midiInputName;
  const names = midiInputs.map((i) => i.name);
  // A saved input that is not plugged in stays listed so the choice is not lost.
  const options = savedName && !names.includes(savedName) ? [...names, savedName] : names;
  const rowClass = 'flex items-center justify-between gap-3 px-3 py-2 text-xs text-app-text';

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('popover-trigger', { defaultValue: 'Recording settings' })}
        title={t('popover-trigger', { defaultValue: 'Recording settings' })}
        className="min-h-9 rounded-app-sm p-1 text-app-text-muted hover:bg-app-surface-hover hover:text-app-text pointer-coarse:min-h-11"
      >
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>
      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        role="dialog"
        label={t('popover-title', { defaultValue: 'Recording' })}
        align="start"
      >
        <div className="w-72 py-1">
          <div className={rowClass}>
            <span id="rec-count-in">{t('count-in', { defaultValue: 'Count-in bar' })}</span>
            <Switch
              aria-labelledby="rec-count-in"
              checked={settings.recordCountIn}
              onCheckedChange={(v) => updateSettings({ recordCountIn: v })}
            />
          </div>
          <div className={rowClass}>
            <span id="rec-quantize">{t('quantize', { defaultValue: 'Quantize' })}</span>
            <Select
              tier="app"
              controlSize="sm"
              containerClassName="inline-block"
              className="w-auto"
              aria-labelledby="rec-quantize"
              value={settings.recordQuantize}
              onChange={(e) => updateSettings({ recordQuantize: e.target.value as RecordQuantize })}
            >
              {RECORD_QUANTIZE_VALUES.map((q) => (
                <option key={q} value={q}>
                  {quantizeLabel(q)}
                </option>
              ))}
            </Select>
          </div>
          <div className={rowClass}>
            <label htmlFor="rec-latency">{t('latency', { defaultValue: 'Input latency (ms)' })}</label>
            <input
              id="rec-latency"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_INPUT_LATENCY_MS}
              step={5}
              value={settings.inputLatencyMs}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v))
                  updateSettings({ inputLatencyMs: Math.max(0, Math.min(MAX_INPUT_LATENCY_MS, Math.round(v))) });
              }}
              className="min-h-9 w-16 rounded-app-sm bg-app-bg-subtle px-1.5 py-0.5 text-center text-sm text-app-text outline-none pointer-coarse:min-h-11"
            />
          </div>
          <div className="border-t border-app-border px-3 py-2">
            {midiStatus === 'ready' ? (
              <div className="flex items-center justify-between gap-3 text-xs text-app-text">
                <span id="rec-midi-input">{t('midi-input', { defaultValue: 'MIDI input' })}</span>
                <Select
                  tier="app"
                  controlSize="sm"
                  containerClassName="inline-block"
                  className="w-auto"
                  aria-labelledby="rec-midi-input"
                  value={savedName ?? NO_INPUT}
                  onChange={(e) =>
                    updateSettings({ midiInputName: e.target.value === NO_INPUT ? null : e.target.value })
                  }
                >
                  <option value={NO_INPUT}>{t('midi-none', { defaultValue: 'None' })}</option>
                  {options.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <button
                type="button"
                disabled={midiStatus === 'requesting' || midiStatus === 'unsupported'}
                onClick={() => void enableMidi()}
                className="min-h-9 w-full rounded-app-sm border border-app-border px-2 py-1 text-xs font-medium text-app-text hover:bg-app-surface-hover disabled:opacity-50 pointer-coarse:min-h-11"
              >
                {t('midi-use', { defaultValue: 'Use a MIDI keyboard' })}
              </button>
            )}
            <p role="status" aria-live="polite" className="mt-1 text-xs text-app-text-muted">
              {midiStatus === 'denied'
                ? t('midi-denied', { defaultValue: 'MIDI access was not allowed. Nothing was connected.' })
                : midiStatus === 'unsupported'
                  ? t('midi-unsupported', { defaultValue: 'This browser cannot read a MIDI keyboard.' })
                  : midiStatus === 'ready' && options.length === 0
                    ? t('midi-no-devices', { defaultValue: 'No MIDI keyboard found. Plug one in.' })
                    : midiStatus === 'ready' && savedName && !names.includes(savedName)
                      ? t('midi-missing', { defaultValue: 'The chosen keyboard is not connected.' })
                      : ''}
            </p>
          </div>
        </div>
      </AnchoredMenu>
    </>
  );
}
