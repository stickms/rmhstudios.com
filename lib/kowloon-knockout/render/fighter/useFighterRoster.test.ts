import {
  describe,
  expect,
  it,
} from 'vitest';
import { buildAvailability } from './useFighterRoster';
import { availableFighterModels } from './models';

describe('buildAvailability', () => {
  it('reads the loadout id list and lower-cases each channel index', () => {
    const a =
      buildAvailability(
        {
          ids: [
            'class_spy',
            '940',
          ],
        },
        {
          hl2: {
            'Models/Alyx.mdl':
              {
                glb: 'x.glb',
              },
          },
          portal:
            null,
        },
      );
    expect(
      a.tf2?.has(
        'class_spy',
      ),
    ).toBe(
      true,
    );
    expect(
      a.mdl.hl2?.has(
        'models/alyx.mdl',
      ),
    ).toBe(
      true,
    );
    expect(
      a
        .mdl
        .portal,
    ).toBeNull();
    expect(
      a
        .mdl
        .csgo,
    ).toBeNull();
  });
  it('treats malformed bodies as unavailable instead of throwing', () => {
    const a =
      buildAvailability(
        'nope',
        {
          hl2: [
            1,
            2,
          ],
          csgo: 7,
        },
      );
    expect(
      a.tf2,
    ).toBeNull();
    expect(
      a
        .mdl
        .hl2,
    ).toBeNull();
    expect(
      a
        .mdl
        .csgo,
    ).toBeNull();
    expect(
      availableFighterModels(
        a,
      ).map(
        (
          m,
        ) =>
          m.id,
      ),
    ).toEqual(
      [
        'ybot',
      ],
    );
  });
});
