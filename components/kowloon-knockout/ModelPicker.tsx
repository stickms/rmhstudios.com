import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFighterRoster } from '@/lib/kowloon-knockout/render/fighter/useFighterRoster';
import { DEFAULT_FIGHTER_MODEL, type FighterModelDef } from '@/lib/kowloon-knockout/render/fighter/models';
import './kk-screens.css';

/**
 * Fighter model chooser: Y-Bot plus whichever Source-engine characters R2 holds.
 * A one-line summary button opens a scrollable, grouped grid of cards (comfortable
 * to thumb on a phone, keyboard-complete as plain buttons). A saved choice that R2
 * no longer has snaps back to the default. Group headings other than "Kowloon" are
 * game titles (proper nouns).
 */
export default function ModelPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
    const { t } = useTranslation('c-kowloon-knockout');
    const roster = useFighterRoster();
    const listId = useId();
    const [open, setOpen] = useState(false);

    const groups = useMemo(() => {
        const out = new Map<FighterModelDef['group'], FighterModelDef[]>();
        for (const m of roster) out.set(m.group, [...(out.get(m.group) ?? []), m]);
        return [...out.entries()];
    }, [roster]);

    // Only once the lookup has produced more than the default can "missing" be told from "not loaded yet".
    const known = roster.length > 1;
    const present = roster.some((m) => m.id === value);
    useEffect(() => {
        if (known && !present) onChange(DEFAULT_FIGHTER_MODEL);
    }, [known, present, onChange]);

    const current = roster.find((m) => m.id === (present ? value : DEFAULT_FIGHTER_MODEL));
    const groupLabel = (g: FighterModelDef['group']) => (g === 'Kowloon' ? t('model-group-kowloon', { defaultValue: 'Kowloon' }) : g);

    return (
        <div className="kk-model-picker">
            <button
                type="button"
                className="kk-model-toggle"
                aria-expanded={open}
                aria-controls={listId}
                onClick={() => setOpen((o) => !o)}
            >
                <span className="kk-model-toggle__label">{t('model', { defaultValue: 'MODEL' })}</span>
                <span className="kk-model-toggle__value">{current?.label ?? 'Y-Bot'}</span>
                <span className="kk-model-toggle__caret" aria-hidden="true">{open ? '▲' : '▼'}</span>
            </button>
            {open && (
                <div id={listId} className="kk-model-list" role="group" aria-label={t('model', { defaultValue: 'MODEL' })}>
                    {groups.map(([group, models]) => (
                        <div key={group} className="kk-model-group">
                            <h3>{groupLabel(group)}</h3>
                            <div className="kk-model-grid">
                                {models.map((m) => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        className="kk-model-card"
                                        aria-pressed={m.id === value}
                                        onClick={() => { onChange(m.id); setOpen(false); }}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
