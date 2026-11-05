import { describe, expect, it } from 'vitest';
import { newDrive } from '@/lib/hearthworks/skins/animator';
import { createHearthworksStore } from '@/lib/hearthworks/store';
import type { WorldEvent } from '@/lib/hearthworks/world';
import { driveFromEvents, oneShotFor } from './figure-events';

const me = { kind: 'player', id: 'me' } as const;
const cop = { kind: 'officer', id: 7 } as const;

describe('oneShotFor', () => {
  it('maps the player’s own shots, reloads, wounds and chores to clips', () => {
    expect(oneShotFor({ type: 'shot', by: { kind: 'player', id: 'me' }, fx: 0, fz: 0, tx: 1, tz: 1, hit: false }, me)).toBe('shoot');
    expect(oneShotFor({ type: 'reloading', playerId: 'me', weapon: 'pistol' as never }, me)).toBe('reload');
    expect(oneShotFor({ type: 'playerHit', playerId: 'me', officerId: 7, damage: 3, hp: 90 }, me)).toBe('hurt');
    expect(oneShotFor({ type: 'harvested', playerId: 'me', item: 'wheat' as never, qty: 1 }, me)).toBe('interact');
    expect(oneShotFor({ type: 'foraged', playerId: 'me', item: 'wheat' as never, qty: 1 }, me)).toBe('interact');
  });

  it('ignores other people’s events', () => {
    expect(oneShotFor({ type: 'shot', by: { kind: 'player', id: 'you' }, fx: 0, fz: 0, tx: 1, tz: 1, hit: true }, me)).toBeNull();
    expect(oneShotFor({ type: 'shot', by: { kind: 'officer', id: 7 }, fx: 0, fz: 0, tx: 1, tz: 1, hit: true }, me)).toBeNull();
    expect(oneShotFor({ type: 'playerHit', playerId: 'you', officerId: 7, damage: 3, hp: 90 }, me)).toBeNull();
    expect(oneShotFor({ type: 'joined', playerId: 'me' }, me)).toBeNull();
  });

  it('maps an officer’s shots and wounds, and nothing meant for players', () => {
    expect(oneShotFor({ type: 'shot', by: { kind: 'officer', id: 7 }, fx: 0, fz: 0, tx: 1, tz: 1, hit: true }, cop)).toBe('shoot');
    expect(oneShotFor({ type: 'shot', by: { kind: 'officer', id: 8 }, fx: 0, fz: 0, tx: 1, tz: 1, hit: true }, cop)).toBeNull();
    expect(oneShotFor({ type: 'officerHit', officerId: 7, by: 'me', damage: 2, hp: 5 }, cop)).toBe('hurt');
    expect(oneShotFor({ type: 'officerHit', officerId: 9, by: 'me', damage: 2, hp: 5 }, cop)).toBeNull();
    expect(oneShotFor({ type: 'reloading', playerId: 'me', weapon: 'pistol' as never }, cop)).toBeNull();
  });
});

describe('driveFromEvents', () => {
  it('queues clips on the drive when the store reports events, and stops when unsubscribed', () => {
    const store = createHearthworksStore({ seed: 1 });
    const drive = newDrive();
    const off = driveFromEvents(store, me, drive);
    const e: WorldEvent = { type: 'playerHit', playerId: 'me', officerId: 1, damage: 1, hp: 10 };
    store.setState({ lastEvents: [e, { type: 'joined', playerId: 'x' }] });
    expect(drive.triggers).toEqual(['hurt']);
    off();
    store.setState({ lastEvents: [e] });
    expect(drive.triggers).toEqual(['hurt']);
  });
});
