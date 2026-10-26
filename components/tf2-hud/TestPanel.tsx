/**
 * Test state: the values the game would feed the HUD. Change them to see every
 * state — low health, an uber, the last seconds of a round — without a match.
 */
'use client';

import { ImageUp, RotateCcw, X } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CLASS_MAX_HEALTH,
  DEFAULT_TEST_STATE,
  FIXTURE_PRESETS,
  TF2_CLASSES,
  type Team,
  type Tf2Class,
} from '@/lib/tf2-hud/fixtures';
import { useEditor } from '@/lib/tf2-hud/store';
import type { BackdropKind } from '@/lib/tf2-hud/view';
import { Btn, NumberField, PanelHead, RangeField, Row, SelectField, TextField } from './ui';

const BACKDROPS: BackdropKind[] = ['auto', 'checker', 'game', 'menu', 'image'];

export default function TestPanel() {
  const { t } = useTranslation('c-tf2-hud');
  const test = useEditor((s) => s.test);
  const setTest = useEditor((s) => s.setTest);
  const view = useEditor((s) => s.view);
  const setView = useEditor((s) => s.setView);
  const fileRef = useRef<HTMLInputElement>(null);

  const backdropLabel: Record<BackdropKind, string> = {
    auto: t('bd-auto', { defaultValue: 'Automatic' }),
    checker: t('bd-checker', { defaultValue: 'Checkerboard' }),
    game: t('bd-game', { defaultValue: 'Arena' }),
    menu: t('bd-menu', { defaultValue: 'Menu' }),
    image: t('bd-image', { defaultValue: 'My screenshot' }),
  };

  const pickImage = (file: File | undefined) => {
    if (!file) return;
    if (view.backdropImage) URL.revokeObjectURL(view.backdropImage);
    setView({ backdropImage: URL.createObjectURL(file), backdrop: 'image' });
  };

  return (
    <section
      className="flex min-h-0 flex-col"
      aria-label={t('test-state', { defaultValue: 'Test state' })}
    >
      <PanelHead
        title={t('test-state', { defaultValue: 'Test state' })}
        actions={
          <Btn
            size="xs"
            variant="ghost"
            icon={RotateCcw}
            onClick={() => setTest({ ...DEFAULT_TEST_STATE })}
          >
            {t('reset', { defaultValue: 'Reset' })}
          </Btn>
        }
      />
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2">
        <div className="mb-2 flex flex-wrap gap-1">
          {FIXTURE_PRESETS.map((p) => (
            <Btn key={p.id} size="xs" variant="secondary" onClick={() => setTest(p.patch)}>
              {p.label}
            </Btn>
          ))}
        </div>

        <Row label={t('class', { defaultValue: 'Class' })}>
          <SelectField
            aria-label={t('class', { defaultValue: 'Class' })}
            value={test.playerClass}
            onChange={(e) => {
              const c = e.target.value as Tf2Class;
              setTest({
                playerClass: c,
                maxHealth: CLASS_MAX_HEALTH[c],
                health: CLASS_MAX_HEALTH[c],
              });
            }}
            className="w-32 capitalize"
          >
            {TF2_CLASSES.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c}
              </option>
            ))}
          </SelectField>
        </Row>
        <Row label={t('team', { defaultValue: 'Team' })}>
          <SelectField
            aria-label={t('team', { defaultValue: 'Team' })}
            value={test.team}
            onChange={(e) => setTest({ team: e.target.value as Team })}
            className="w-32"
          >
            <option value="red">RED</option>
            <option value="blue">BLU</option>
          </SelectField>
        </Row>
        <Row label={t('health', { defaultValue: 'Health' })}>
          <NumberField
            label={t('health', { defaultValue: 'Health' })}
            value={test.health}
            min={0}
            max={9999}
            onChange={(health) => setTest({ health })}
            className="w-20"
          />
          <span className="text-xs text-(--app-text-dim)">/</span>
          <NumberField
            label={t('max-health', { defaultValue: 'Max health' })}
            value={test.maxHealth}
            min={1}
            max={9999}
            onChange={(maxHealth) => setTest({ maxHealth })}
            className="w-20"
          />
        </Row>
        <Row label={t('ammo', { defaultValue: 'Ammo (clip / reserve)' })}>
          <NumberField
            label={t('ammo-clip', { defaultValue: 'Clip' })}
            value={test.ammoClip}
            min={0}
            max={999}
            onChange={(ammoClip) => setTest({ ammoClip })}
            className="w-20"
          />
          <NumberField
            label={t('ammo-reserve', { defaultValue: 'Reserve' })}
            value={test.ammoReserve}
            min={0}
            max={999}
            onChange={(ammoReserve) => setTest({ ammoReserve })}
            className="w-20"
          />
        </Row>
        <Row label={t('metal', { defaultValue: 'Metal' })}>
          <NumberField
            label={t('metal', { defaultValue: 'Metal' })}
            value={test.metal}
            min={0}
            max={999}
            onChange={(metal) => setTest({ metal })}
            className="w-20"
          />
        </Row>
        <Row label={t('charge', { defaultValue: 'Charge %' })}>
          <div className="w-32">
            <RangeField
              label={t('charge', { defaultValue: 'Charge %' })}
              value={test.charge}
              min={0}
              max={100}
              onChange={(charge) => setTest({ charge })}
            />
          </div>
        </Row>
        <Row label={t('progress', { defaultValue: 'Progress bars %' })}>
          <div className="w-32">
            <RangeField
              label={t('progress', { defaultValue: 'Progress bars %' })}
              value={test.progress}
              min={0}
              max={100}
              onChange={(progress) => setTest({ progress })}
            />
          </div>
        </Row>
        <Row label={t('score', { defaultValue: 'Score (RED – BLU)' })}>
          <NumberField
            label="RED"
            value={test.redScore}
            min={0}
            max={99}
            onChange={(redScore) => setTest({ redScore })}
            className="w-16"
          />
          <NumberField
            label="BLU"
            value={test.blueScore}
            min={0}
            max={99}
            onChange={(blueScore) => setTest({ blueScore })}
            className="w-16"
          />
        </Row>
        <Row label={t('round-time', { defaultValue: 'Round time (s)' })}>
          <NumberField
            label={t('round-time', { defaultValue: 'Round time (s)' })}
            value={test.roundSeconds}
            min={0}
            max={5999}
            onChange={(roundSeconds) => setTest({ roundSeconds })}
            className="w-20"
          />
        </Row>
        <Row label={t('player-name', { defaultValue: 'Player name' })}>
          <TextField
            aria-label={t('player-name', { defaultValue: 'Player name' })}
            value={test.playerName}
            maxLength={32}
            onChange={(e) => setTest({ playerName: e.target.value })}
            className="w-32"
          />
        </Row>

        <h3 className="tf2hud-panel-head pt-3">{t('backdrop', { defaultValue: 'Backdrop' })}</h3>
        <Row label={t('backdrop-style', { defaultValue: 'Behind the HUD' })}>
          <SelectField
            aria-label={t('backdrop-style', { defaultValue: 'Behind the HUD' })}
            value={view.backdrop}
            onChange={(e) => setView({ backdrop: e.target.value as BackdropKind })}
            className="w-36"
          >
            {BACKDROPS.filter((b) => b !== 'image' || view.backdropImage).map((b) => (
              <option key={b} value={b}>
                {backdropLabel[b]}
              </option>
            ))}
          </SelectField>
        </Row>
        <div className="flex items-center gap-2">
          <Btn size="xs" icon={ImageUp} onClick={() => fileRef.current?.click()}>
            {t('upload-screenshot', { defaultValue: 'Use a screenshot' })}
          </Btn>
          {view.backdropImage ? (
            <Btn
              size="xs"
              variant="ghost"
              icon={X}
              onClick={() => {
                URL.revokeObjectURL(view.backdropImage!);
                setView({ backdropImage: undefined, backdrop: 'auto', compareOpacity: 0 });
              }}
            >
              {t('remove', { defaultValue: 'Remove' })}
            </Btn>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              pickImage(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        <Row label={t('hud-opacity', { defaultValue: 'HUD opacity' })}>
          <div className="w-32">
            <RangeField
              label={t('hud-opacity', { defaultValue: 'HUD opacity' })}
              value={Math.round(view.hudOpacity * 100)}
              min={0}
              max={100}
              onChange={(v) => setView({ hudOpacity: v / 100 })}
            />
          </div>
        </Row>
        {view.backdropImage ? (
          <Row label={t('compare', { defaultValue: 'Overlay screenshot' })}>
            <div className="w-32">
              <RangeField
                label={t('compare', { defaultValue: 'Overlay screenshot' })}
                value={Math.round(view.compareOpacity * 100)}
                min={0}
                max={100}
                onChange={(v) => setView({ compareOpacity: v / 100 })}
              />
            </div>
          </Row>
        ) : null}
      </div>
    </section>
  );
}
