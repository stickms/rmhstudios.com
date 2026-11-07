'use client';

import { useEffect, useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFighterRoster } from '@/lib/kowloon-knockout/render/fighter/useFighterRoster';
import { DEFAULT_FIGHTER_MODEL, type FighterModelDef } from '@/lib/kowloon-knockout/render/fighter/models';

/**
 * Fighter model chooser: Y-Bot plus whichever Source-engine characters R2 holds.
 * A saved choice that R2 no longer has snaps back to the default.
 * Group headings other than "Kowloon" are game titles (proper nouns).
 */
export default function ModelPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
    const { t } = useTranslation('c-kowloon-knockout');
    const roster = useFighterRoster();
    const id = useId();

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

    return (
        <div className="kk-model-picker">
            <label className="option-label" htmlFor={id}>{t('model', { defaultValue: 'MODEL' })}</label>
            <select id={id} className="kk-model-select" value={present ? value : DEFAULT_FIGHTER_MODEL} onChange={(e) => onChange(e.target.value)}>
                {groups.map(([group, models]) => (
                    <optgroup key={group} label={group === 'Kowloon' ? t('model-group-kowloon', { defaultValue: 'Kowloon' }) : group}>
                        {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </optgroup>
                ))}
            </select>
        </div>
    );
}
