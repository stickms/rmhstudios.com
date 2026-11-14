import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  AWAY_BLUR_MS,
  watchAway,
} from './away-watch';

function setup() {
  const doc =
    Object.assign(
      new EventTarget(),
      {
        hidden: false,
      },
    );
  const win =
    new EventTarget();
  const onAway =
    vi.fn();
  const stop =
    watchAway(
      {
        doc,
        win,
        onAway,
      },
    );
  return {
    doc,
    win,
    onAway,
    stop,
  };
}

describe('watchAway', () => {
  beforeEach(
    () =>
      vi.useFakeTimers(),
  );
  afterEach(
    () =>
      vi.useRealTimers(),
  );

  it('a tab that goes hidden is away at once', () => {
    const {
      doc,
      onAway,
    } =
      setup();
    doc.hidden = true;
    doc.dispatchEvent(
      new Event(
        'visibilitychange',
      ),
    );
    expect(
      onAway,
    ).toHaveBeenCalledWith(
      'hidden',
    );
  });

  it('a tab that becomes visible again is not away', () => {
    const {
      doc,
      onAway,
    } =
      setup();
    doc.hidden = false;
    doc.dispatchEvent(
      new Event(
        'visibilitychange',
      ),
    );
    expect(
      onAway,
    ).not.toHaveBeenCalled();
  });

  it('a window that stays blurred long enough is away; one that comes back in time is not', () => {
    const {
      win,
      onAway,
    } =
      setup();
    win.dispatchEvent(
      new Event(
        'blur',
      ),
    );
    vi.advanceTimersByTime(
      AWAY_BLUR_MS -
        1,
    );
    win.dispatchEvent(
      new Event(
        'focus',
      ),
    );
    vi.advanceTimersByTime(
      10_000,
    );
    expect(
      onAway,
    ).not.toHaveBeenCalled();
    win.dispatchEvent(
      new Event(
        'blur',
      ),
    );
    vi.advanceTimersByTime(
      AWAY_BLUR_MS,
    );
    expect(
      onAway,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      onAway,
    ).toHaveBeenCalledWith(
      'blurred',
    );
  });

  it('hidden after blur reports once, as hidden, and leaves no timer', () => {
    const {
      doc,
      win,
      onAway,
    } =
      setup();
    win.dispatchEvent(
      new Event(
        'blur',
      ),
    );
    doc.hidden = true;
    doc.dispatchEvent(
      new Event(
        'visibilitychange',
      ),
    );
    vi.advanceTimersByTime(
      10_000,
    );
    expect(
      onAway,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      onAway,
    ).toHaveBeenCalledWith(
      'hidden',
    );
  });

  it('stopping removes the listeners and the timer', () => {
    const {
      doc,
      win,
      onAway,
      stop,
    } =
      setup();
    win.dispatchEvent(
      new Event(
        'blur',
      ),
    );
    stop();
    expect(
      vi.getTimerCount(),
    ).toBe(
      0,
    );
    doc.hidden = true;
    doc.dispatchEvent(
      new Event(
        'visibilitychange',
      ),
    );
    win.dispatchEvent(
      new Event(
        'blur',
      ),
    );
    vi.advanceTimersByTime(
      10_000,
    );
    expect(
      onAway,
    ).not.toHaveBeenCalled();
  });
});
