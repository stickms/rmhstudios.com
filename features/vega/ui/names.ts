/**
 * Display names and descriptions for Project Vega's instruments, specimens, maps and targeting modes. A literal
 * `t()` per string (the extractor reads only literal keys), wrapped in one hook so the screens stay readable.
 */
import { useTranslation } from 'react-i18next';
import type { EnemyType, MapId, TargetMode, TowerType } from '@features/vega/engine/data';

export function useVegaNames() {
  const { t } = useTranslation('c-vega');

  const tower = (type: TowerType): string => {
    switch (type) {
      case 'SYNAPSE':
        return t('tower-synapse', { defaultValue: 'Synapse' });
      case 'SUPPRESSOR':
        return t('tower-suppressor', { defaultValue: 'Suppressor' });
      case 'CAUTERY':
        return t('tower-cautery', { defaultValue: 'Cautery' });
      case 'CENTRIFUGE':
        return t('tower-centrifuge', { defaultValue: 'Centrifuge' });
      case 'DEFIBRILLATOR':
        return t('tower-defibrillator', { defaultValue: 'Defibrillator' });
      case 'LOBOTOMIZER':
        return t('tower-lobotomizer', { defaultValue: 'Lobotomizer' });
      case 'ECHO':
        return t('tower-echo', { defaultValue: 'Echo' });
      case 'BIOBANK':
        return t('tower-biobank', { defaultValue: 'Biobank' });
    }
  };

  const towerBlurb = (type: TowerType): string => {
    switch (type) {
      case 'SYNAPSE':
        return t('tower-synapse-blurb', { defaultValue: 'Cheap, steady pulses at one target. Tier III fires at two.' });
      case 'SUPPRESSOR':
        return t('tower-suppressor-blurb', {
          defaultValue:
            'A sedative field: slows everything inside and wears it down. Tier III makes them take more damage.',
        });
      case 'CAUTERY':
        return t('tower-cautery-blurb', {
          defaultValue: 'A short searing beam that ignores armour and leaves a burn. Burning stops regeneration.',
        });
      case 'CENTRIFUGE':
        return t('tower-centrifuge-blurb', {
          defaultValue: 'Lobs sample canisters that splash a crowd, cloaked specimens included.',
        });
      case 'DEFIBRILLATOR':
        return t('tower-defibrillator-blurb', {
          defaultValue: 'A shock that jumps between specimens, triple against shields. Reveals the cloaked.',
        });
      case 'LOBOTOMIZER':
        return t('tower-lobotomizer-blurb', {
          defaultValue: 'Long-range precision that pierces armour. Tier III finishes off the badly wounded.',
        });
      case 'ECHO':
        return t('tower-echo-blurb', {
          defaultValue: 'Boosts the damage and rate of nearby instruments. From tier II it reveals the cloaked.',
        });
      case 'BIOBANK':
        return t('tower-biobank-blurb', { defaultValue: 'No attack. Pays serum each time a wave is cleared.' });
    }
  };

  const enemy = (type: EnemyType): string => {
    switch (type) {
      case 'ANXIETY':
        return t('enemy-anxiety', { defaultValue: 'Anxiety' });
      case 'GUILT':
        return t('enemy-guilt', { defaultValue: 'Guilt' });
      case 'FRAGMENT':
        return t('enemy-fragment', { defaultValue: 'Fragment' });
      case 'DEPRESSION':
        return t('enemy-depression', { defaultValue: 'Depression' });
      case 'MANIC':
        return t('enemy-manic', { defaultValue: 'Manic' });
      case 'DOUBT':
        return t('enemy-doubt', { defaultValue: 'Doubt' });
      case 'OBSESSION':
        return t('enemy-obsession', { defaultValue: 'Obsession' });
      case 'PARANOIA':
        return t('enemy-paranoia', { defaultValue: 'Paranoia' });
      case 'DREAD':
        return t('enemy-dread', { defaultValue: 'Dread' });
      case 'PATIENT':
        return t('enemy-patient', { defaultValue: 'The Patient' });
      case 'SURGEON':
        return t('enemy-surgeon', { defaultValue: 'The Surgeon' });
      case 'SPECIMEN':
        return t('enemy-specimen', { defaultValue: 'The Specimen' });
    }
  };

  const enemyBlurb = (type: EnemyType): string => {
    switch (type) {
      case 'ANXIETY':
        return t('enemy-anxiety-blurb', { defaultValue: 'Fast and frail. Comes in numbers.' });
      case 'GUILT':
        return t('enemy-guilt-blurb', { defaultValue: 'Splits into two quick fragments when it dies.' });
      case 'FRAGMENT':
        return t('enemy-fragment-blurb', { defaultValue: 'What is left of Guilt. Small and quick.' });
      case 'DEPRESSION':
        return t('enemy-depression-blurb', {
          defaultValue: 'Slow and plated. Armour blunts every hit; the Cautery and Lobotomizer go through it.',
        });
      case 'MANIC':
        return t('enemy-manic-blurb', { defaultValue: 'Surges and stalls, faster than it looks.' });
      case 'DOUBT':
        return t('enemy-doubt-blurb', {
          defaultValue: 'Shielded. A Defibrillator breaks shields three times as fast.',
        });
      case 'OBSESSION':
        return t('enemy-obsession-blurb', { defaultValue: 'Regenerates unless it is burning.' });
      case 'PARANOIA':
        return t('enemy-paranoia-blurb', {
          defaultValue: 'Cloaked. Only a Defibrillator or an Echo II can see it; a Centrifuge splash still lands.',
        });
      case 'DREAD':
        return t('enemy-dread-blurb', { defaultValue: 'Heals the specimens around it. Kill it first.' });
      case 'PATIENT':
        return t('enemy-patient-blurb', {
          defaultValue: 'A boss. Sheds Anxiety each time it loses a quarter of itself.',
        });
      case 'SURGEON':
        return t('enemy-surgeon-blurb', {
          defaultValue: 'A boss. Every few seconds it severs the instruments around it.',
        });
      case 'SPECIMEN':
        return t('enemy-specimen-blurb', {
          defaultValue: 'A boss in a glass shell. Below half it breaks free and runs.',
        });
    }
  };

  const map = (id: MapId): string => {
    switch (id) {
      case 'intake':
        return t('map-intake', { defaultValue: 'Intake Ward' });
      case 'vault':
        return t('map-vault', { defaultValue: 'Specimen Vault' });
      case 'theatre':
        return t('map-theatre', { defaultValue: 'Surgical Theatre' });
    }
  };

  const mapBlurb = (id: MapId): string => {
    switch (id) {
      case 'intake':
        return t('map-intake-blurb', {
          defaultValue: 'One corridor that doubles back on itself. Where every intern starts.',
        });
      case 'vault':
        return t('map-vault-blurb', {
          defaultValue: 'A long spiral into the vault. More time to shoot, more to shoot at.',
        });
      case 'theatre':
        return t('map-theatre-blurb', { defaultValue: 'Two doors, two streams, one way out. Score x1.5.' });
    }
  };

  const mode = (m: TargetMode): string => {
    switch (m) {
      case 'first':
        return t('target-first', { defaultValue: 'First' });
      case 'strong':
        return t('target-strong', { defaultValue: 'Strongest' });
      case 'last':
        return t('target-last', { defaultValue: 'Last' });
    }
  };

  return { tower, towerBlurb, enemy, enemyBlurb, map, mapBlurb, mode };
}
