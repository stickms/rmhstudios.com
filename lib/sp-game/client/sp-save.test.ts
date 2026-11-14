/** The single-player save format (the last level start, in localStorage). */
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  loadSave,
  makeSave,
  parseSave,
  saveKey,
  writeSave,
  type SaveStorage,
} from './sp-save';

class MemoryStorage implements SaveStorage {
  data =
    new Map<
      string,
      string
    >();
  getItem(
    k: string,
  ) {
    return (
      this.data.get(
        k,
      ) ??
      null
    );
  }
  setItem(
    k: string,
    v: string,
  ) {
    this.data.set(
      k,
      v,
    );
  }
  removeItem(
    k: string,
  ) {
    this.data.delete(
      k,
    );
  }
}

describe('single-player saves', () => {
  const maps =
    [
      'testchmb_a_00',
      'testchmb_a_01',
    ];
  const transition =
    {
      fromMap:
        'testchmb_a_00',
      toMap:
        'testchmb_a_01',
      landmark:
        'landmark',
      player:
        {
          offset:
            {
              x: 1,
              y: 2,
              z: 3,
            },
          velocity:
            {
              x: 0,
              y: 0,
              z: 0,
            },
          eyeAngles:
            {
              x: 0,
              y: 90,
              z: 0,
            },
          ducked: false,
          health: 100,
          armor: 0,
          hasSuit: false,
          suitPower: 100,
          flashlight: false,
          portalgun:
            {
              canFire1: true,
              canFire2: false,
            },
        },
      entities:
        [],
      globals:
        {
          g: 1,
        },
    };

  it('round-trips a level start with its transition', () => {
    const st =
      new MemoryStorage();
    expect(
      writeSave(
        makeSave(
          'portal',
          'testchmb_a_01',
          transition,
          2,
          123,
        ),
        st,
      ),
    ).toBe(
      true,
    );
    const back =
      loadSave(
        'portal',
        maps,
        st,
      );
    expect(
      back,
    ).toEqual(
      {
        v: 1,
        game: 'portal',
        map: 'testchmb_a_01',
        transition,
        savedAt: 123,
        checkpoints: 2,
      },
    );
  });

  it('rejects other games, unknown maps and malformed data; drops a transition for another map', () => {
    expect(
      parseSave(
        {
          v: 1,
          game: 'hl2',
          map: 'testchmb_a_00',
        },
        'portal',
        maps,
      ),
    ).toBeNull();
    expect(
      parseSave(
        {
          v: 1,
          game: 'portal',
          map: 'd1_trainstation_01',
        },
        'portal',
        maps,
      ),
    ).toBeNull();
    expect(
      parseSave(
        {
          v: 2,
          game: 'portal',
          map: 'testchmb_a_00',
        },
        'portal',
        maps,
      ),
    ).toBeNull();
    expect(
      parseSave(
        'nope',
        'portal',
        maps,
      ),
    ).toBeNull();
    const s =
      parseSave(
        {
          v: 1,
          game: 'portal',
          map: 'testchmb_a_00',
          transition,
        },
        'portal',
        maps,
      );
    expect(
      s?.transition,
    ).toBeNull();
    const st =
      new MemoryStorage();
    st.setItem(
      saveKey(
        'portal',
      ),
      '{broken',
    );
    expect(
      loadSave(
        'portal',
        maps,
        st,
      ),
    ).toBeNull();
  });

  it('tolerates a storage that throws', () => {
    const bad: SaveStorage =
      {
        getItem:
          () => {
            throw new Error(
              'denied',
            );
          },
        setItem:
          () => {
            throw new Error(
              'quota',
            );
          },
        removeItem:
          () => {},
      };
    expect(
      writeSave(
        makeSave(
          'hl2',
          'd1_trainstation_01',
          null,
        ),
        bad,
      ),
    ).toBe(
      false,
    );
    expect(
      loadSave(
        'hl2',
        [
          'd1_trainstation_01',
        ],
        bad,
      ),
    ).toBeNull();
  });
});
