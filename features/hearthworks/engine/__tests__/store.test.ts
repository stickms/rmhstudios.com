import {
  describe,
  expect,
  it,
} from 'vitest';
import { createHearthworksStore } from '../store';
import {
  TICK_MS,
  buildingAt,
} from '../world';

describe('hearthworks store', () => {
  it('stamps the local player on commands and applies them on the next advance', () => {
    const store =
      createHearthworksStore(
        {
          seed: 3,
          size: 24,
        },
      );
    const m =
      Math.floor(
        store.getState()
          .world
          .size /
          2,
      ) +
      2; // beside the spawn tile
    store
      .getState()
      .dispatch(
        {
          type: 'place',
          kind: 'cottage',
          x: m,
          z: m,
        },
      );
    expect(
      buildingAt(
        store.getState()
          .world,
        m,
        m,
      ),
    ).toBeUndefined();
    const events =
      store
        .getState()
        .advance(
          TICK_MS,
        );
    expect(
      buildingAt(
        store.getState()
          .world,
        m,
        m,
      )
        ?.kind,
    ).toBe(
      'cottage',
    );
    expect(
      events.some(
        (
          e,
        ) =>
          e.type ===
          'placed',
      ),
    ).toBe(
      true,
    );
    expect(
      store.getState()
        .pending,
    ).toHaveLength(
      0,
    );
    expect(
      store.getState()
        .rev,
    ).toBe(
      1,
    );
  });

  it('surfaces rejections as events instead of throwing', () => {
    const store =
      createHearthworksStore(
        {
          seed: 3,
          size: 24,
        },
      );
    store
      .getState()
      .dispatch(
        {
          type: 'remove',
          x: 12,
          z: 12,
        },
      );
    const events =
      store
        .getState()
        .advance(
          TICK_MS,
        );
    expect(
      events,
    ).toEqual(
      [
        {
          type: 'rejected',
          command:
            'remove',
          playerId:
            'local',
          reason:
            'nothing-there',
        },
      ],
    );
  });

  it('does not bump rev on a quiet frame (no re-render per frame)', () => {
    const store =
      createHearthworksStore(
        {
          seed: 3,
          size: 24,
        },
      );
    store
      .getState()
      .advance(
        TICK_MS,
      );
    store
      .getState()
      .advance(
        TICK_MS,
      );
    expect(
      store.getState()
        .rev,
    ).toBe(
      0,
    );
    expect(
      store.getState()
        .world
        .tick,
    ).toBe(
      2,
    );
  });

  it('caps a huge frame gap so a backgrounded tab cannot stall the page on return', () => {
    const store =
      createHearthworksStore(
        {
          seed: 3,
          size: 24,
        },
      );
    store
      .getState()
      .advance(
        60 *
          60 *
          1000,
      );
    expect(
      store.getState()
        .world
        .tick,
    ).toBe(
      250 /
        TICK_MS,
    );
  });

  it('replaceWorld swaps in a loaded world and keeps the player joined', () => {
    const a =
      createHearthworksStore(
        {
          seed: 1,
          size: 24,
        },
      );
    const b =
      createHearthworksStore(
        {
          seed: 2,
          size: 24,
        },
      );
    const loaded =
      structuredClone(
        b.getState()
          .world,
      );
    loaded.players =
      {};
    a.getState().replaceWorld(
      loaded,
    );
    expect(
      a.getState()
        .world
        .seed,
    ).toBe(
      2,
    );
    expect(
      a.getState()
        .world
        .players
        .local,
    ).toBeDefined();
  });
});

describe('view switching', () => {
  it('starts isometric and toggles both ways', () => {
    const store =
      createHearthworksStore(
        {
          seed: 3,
          size: 24,
        },
      );
    expect(
      store.getState()
        .view,
    ).toBe(
      'iso',
    );
    store
      .getState()
      .toggleView();
    expect(
      store.getState()
        .view,
    ).toBe(
      'third',
    );
    store
      .getState()
      .toggleView();
    expect(
      store.getState()
        .view,
    ).toBe(
      'iso',
    );
    store
      .getState()
      .setView(
        'third',
      );
    expect(
      store.getState()
        .view,
    ).toBe(
      'third',
    );
  });
});
