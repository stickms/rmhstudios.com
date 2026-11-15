import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  createPollGate,
  initialTracker,
  statusSample,
  statusUrl,
  trackNet,
  type NetSample,
} from '../net-status';

function run(
  samples: NetSample[],
) {
  let tracker =
    initialTracker;
  let state: string =
    'connecting';
  for (const s of samples)
    ({
      tracker,
      state,
    } =
      trackNet(
        tracker,
        s,
      ));
  return state;
}
const up =
  (
    at: number,
  ): NetSample => ({
    at,
    result:
      {
        connected: true,
      },
  });
const down =
  (
    at: number,
  ): NetSample => ({
    at,
    result:
      {
        connected: false,
      },
  });
const full =
  (
    at: number,
  ): NetSample => ({
    at,
    result:
      {
        connected: false,
        full: true,
      },
  });
const fail =
  (
    at: number,
  ): NetSample => ({
    at,
    result:
      'failed',
  });
const ended =
  (
    at: number,
  ): NetSample => ({
    at,
    result:
      'ended',
  });

describe('trackNet', () => {
  it('is on when the hub says connected', () =>
    expect(
      run(
        [
          up(
            0,
          ),
        ],
      ),
    ).toBe(
      'on',
    ));
  it('stays connecting through one or two failures, errors on the third', () => {
    expect(
      run(
        [
          fail(
            0,
          ),
          fail(
            15,
          ),
        ],
      ),
    ).toBe(
      'connecting',
    );
    expect(
      run(
        [
          fail(
            0,
          ),
          fail(
            15_000,
          ),
          fail(
            30_000,
          ),
        ],
      ),
    ).toBe(
      'error',
    );
  });
  it('a success resets the failure count', () => {
    expect(
      run(
        [
          fail(
            0,
          ),
          fail(
            1,
          ),
          up(
            2,
          ),
          fail(
            3,
          ),
          fail(
            4,
          ),
        ],
      ),
    ).toBe(
      'connecting',
    );
  });
  it('connected:false is connecting for under 30 s, error from 30 s', () => {
    expect(
      run(
        [
          down(
            0,
          ),
          down(
            15_000,
          ),
        ],
      ),
    ).toBe(
      'connecting',
    );
    expect(
      run(
        [
          down(
            0,
          ),
          down(
            15_000,
          ),
          down(
            30_000,
          ),
        ],
      ),
    ).toBe(
      'error',
    );
  });
  it('a drop after being online is measured from its first sample, and recovers', () => {
    expect(
      run(
        [
          up(
            0,
          ),
          down(
            15_000,
          ),
          down(
            44_999,
          ),
        ],
      ),
    ).toBe(
      'connecting',
    );
    expect(
      run(
        [
          up(
            0,
          ),
          down(
            15_000,
          ),
          down(
            45_000,
          ),
        ],
      ),
    ).toBe(
      'error',
    );
    expect(
      run(
        [
          up(
            0,
          ),
          down(
            15_000,
          ),
          up(
            30_000,
          ),
          down(
            45_000,
          ),
        ],
      ),
    ).toBe(
      'connecting',
    );
  });
  it('recovers from error when the socket is back', () => {
    expect(
      run(
        [
          down(
            0,
          ),
          down(
            30_000,
          ),
          up(
            45_000,
          ),
        ],
      ),
    ).toBe(
      'on',
    );
  });
});

describe('a full hub', () => {
  it('says full at once, not unavailable, and recovers when a seat opens', () => {
    expect(
      run(
        [
          full(
            0,
          ),
        ],
      ),
    ).toBe(
      'full',
    );
    expect(
      run(
        [
          down(
            0,
          ),
          full(
            15_000,
          ),
          full(
            60_000,
          ),
        ],
      ),
    ).toBe(
      'full',
    );
    expect(
      run(
        [
          full(
            0,
          ),
          up(
            15_000,
          ),
        ],
      ),
    ).toBe(
      'on',
    );
    expect(
      run(
        [
          full(
            0,
          ),
          down(
            15_000,
          ),
        ],
      ),
    ).toBe(
      'connecting',
    );
  });
  it('reads full from the status body', () => {
    expect(
      statusSample(
        200,
        {
          connected: false,
          full: true,
        },
      ),
    ).toEqual(
      {
        connected: false,
        full: true,
      },
    );
  });
});

describe('a refused ticket', () => {
  it('is an immediate, final error', () => {
    const r =
      trackNet(
        initialTracker,
        ended(
          0,
        ),
      );
    expect(
      r,
    ).toMatchObject(
      {
        state:
          'error',
        ended: true,
      },
    );
    expect(
      trackNet(
        initialTracker,
        up(
          0,
        ),
      )
        .ended,
    ).toBe(
      false,
    );
  });
});

describe('statusUrl', () => {
  it('maps the relay URL to the status endpoint with the ticket', () => {
    expect(
      statusUrl(
        'wss://rmhstudios.com/rmhos-net/',
        'a.b.c',
      ),
    ).toBe(
      'https://rmhstudios.com/rmhos-net/status?ticket=a.b.c',
    );
    expect(
      statusUrl(
        'ws://localhost:7009/rmhos-net/?ticket=old',
        'x',
      ),
    ).toBe(
      'http://localhost:7009/rmhos-net/status?ticket=x',
    );
  });
});

describe('statusSample', () => {
  it('treats 429 as no information, so three in a row never flip the toolbar', () => {
    expect(
      statusSample(
        429,
        null,
      ),
    ).toBeNull();
    let state =
      trackNet(
        initialTracker,
        up(
          0,
        ),
      );
    for (
      let i = 0;
      i <
      5;
      i++
    ) {
      const sample =
        statusSample(
          429,
          null,
        );
      if (
        sample
      )
        state =
          trackNet(
            state.tracker,
            {
              at: i,
              result:
                sample,
            },
          );
    }
    expect(
      state.state,
    ).toBe(
      'on',
    );
  });

  it('maps the other replies', () => {
    expect(
      statusSample(
        200,
        {
          connected: true,
        },
      ),
    ).toEqual(
      {
        connected: true,
        full: false,
      },
    );
    expect(
      statusSample(
        200,
        {
          connected: false,
        },
      ),
    ).toEqual(
      {
        connected: false,
        full: false,
      },
    );
    expect(
      statusSample(
        401,
        null,
      ),
    ).toBe(
      'ended',
    );
    expect(
      statusSample(
        503,
        null,
      ),
    ).toBe(
      'failed',
    );
    expect(
      statusSample(
        502,
        null,
      ),
    ).toBe(
      'failed',
    );
  });
});

describe('createPollGate', () => {
  it('lets one visibility poll through per 5 s', () => {
    const gate =
      createPollGate(
        5000,
      );
    expect(
      [
        gate(
          0,
        ),
        gate(
          1000,
        ),
        gate(
          4999,
        ),
        gate(
          5000,
        ),
        gate(
          5001,
        ),
      ],
    ).toEqual(
      [
        true,
        false,
        false,
        true,
        false,
      ],
    );
  });
});
