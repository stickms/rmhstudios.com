import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  askOnce,
  evictionRisk,
  readPersisted,
  requestPersist,
} from '../persistence';

describe('persistence', () => {
  it('reads what the browser says, and null when it cannot say', async () => {
    expect(
      await readPersisted(
        {
          persisted:
            async () =>
              true,
        },
      ),
    ).toBe(
      true,
    );
    expect(
      await readPersisted(
        {
          persisted:
            async () =>
              false,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      await readPersisted(
        {},
      ),
    ).toBeNull();
    expect(
      await readPersisted(
        undefined,
      ),
    ).toBeNull();
    expect(
      await readPersisted(
        {
          persisted:
            async () =>
              Promise.reject(
                new Error(
                  'x',
                ),
              ),
        },
      ),
    ).toBeNull();
  });

  it('the standing line shows only when the browser says it may delete the files', () => {
    expect(
      evictionRisk(
        false,
      ),
    ).toBe(
      true,
    );
    expect(
      evictionRisk(
        true,
      ),
    ).toBe(
      false,
    );
    expect(
      evictionRisk(
        null,
      ),
    ).toBe(
      false,
    );
  });

  it('asks only when called, and answers false when it cannot or the browser refuses', async () => {
    const persist =
      vi.fn(
        async () =>
          true,
      );
    expect(
      persist,
    ).not.toHaveBeenCalled();
    expect(
      await requestPersist(
        {
          persist,
        },
      ),
    ).toBe(
      true,
    );
    expect(
      persist,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      await requestPersist(
        {},
      ),
    ).toBe(
      false,
    );
    expect(
      await requestPersist(
        {
          persist:
            async () =>
              false,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      await requestPersist(
        {
          persist:
            async () =>
              Promise.reject(
                new Error(
                  'x',
                ),
              ),
        },
      ),
    ).toBe(
      false,
    );
  });
});

describe('askOnce', () => {
  it('asks the browser on the first Save only, however often Save is pressed', async () => {
    const persist =
      vi.fn(
        async () =>
          false,
      );
    const keepOnce =
      askOnce(
        () =>
          requestPersist(
            {
              persist,
            },
          ),
      );
    await keepOnce();
    await keepOnce();
    await keepOnce();
    expect(
      persist,
    ).toHaveBeenCalledTimes(
      1,
    );
  });

  it('the explicit button is not limited: it calls the request itself', async () => {
    const persist =
      vi.fn(
        async () =>
          false,
      );
    await requestPersist(
      {
        persist,
      },
    );
    await requestPersist(
      {
        persist,
      },
    );
    expect(
      persist,
    ).toHaveBeenCalledTimes(
      2,
    );
  });
});
