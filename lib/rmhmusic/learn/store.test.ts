import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The adapters need browser APIs; the store only needs to know they were built.
const created = vi.hoisted(() => ({ hub: 0, mic: 0, midi: 0, keyboard: 0, screen: 0 }));
vi.mock('./input/hub', () => ({
  createInputHub: vi.fn((adapters: unknown[]) => {
    created.hub += 1;
    return { adapters };
  }),
}));
vi.mock('./input/mic', () => ({
  createMicInput: vi.fn(() => (created.mic++, { source: 'mic' })),
}));
vi.mock('./input/midi', () => ({
  createMidiInput: vi.fn(() => (created.midi++, { source: 'midi' })),
}));
vi.mock('./input/keyboard', () => ({
  createKeyboardInput: vi.fn(() => (created.keyboard++, { source: 'keys' })),
}));
vi.mock('./input/screen', () => ({
  createScreenInput: vi.fn(() => (created.screen++, { source: 'screen' })),
}));

import { useLearnStore, type LessonProgressRow, type Profile } from './store';

const PROFILE: Profile = { instrument: 'piano', input: 'screen', latencyMs: 0, dailyGoal: 1 };
const ROW: LessonProgressRow = {
  lessonId: 'staff-what-is-a-staff',
  stars: 1,
  bestScore: 60,
  completedAt: '2026-11-01T00:00:00.000Z',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function reset() {
  useLearnStore.setState({
    profile: null,
    progress: [],
    hub: null,
    screen: null,
    status: 'idle',
    error: null,
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', {});
  reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('learn store', () => {
  it('builds no adapters on import, even where a window exists', () => {
    expect(created).toEqual({ hub: 0, mic: 0, midi: 0, keyboard: 0, screen: 0 });
    const s = useLearnStore.getState();
    expect(s.hub).toBeNull();
    expect(s.screen).toBeNull();
    expect(s.status).toBe('idle');
  });

  it('load() reads the profile, builds the input once, and becomes ready', async () => {
    fetchMock.mockResolvedValue(json({ profile: PROFILE, progress: [ROW] }));
    await useLearnStore.getState().load();
    const s = useLearnStore.getState();
    expect(s.status).toBe('ready');
    expect(s.profile).toEqual(PROFILE);
    expect(s.progress).toEqual([ROW]);
    expect(s.hub).not.toBeNull();
    expect(s.screen).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/rmhmusic/learn/profile',
      expect.objectContaining({ credentials: 'include' }),
    );

    const hub = s.hub;
    await useLearnStore.getState().load();
    expect(useLearnStore.getState().hub).toBe(hub);
    expect(created.hub).toBe(1);
  });

  it('load() does not refetch while a load is in flight', async () => {
    let release!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (release = r)));
    const a = useLearnStore.getState().load();
    const b = useLearnStore.getState().load();
    release(json({ profile: PROFILE, progress: [] }));
    await Promise.all([a, b]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('load() maps a failure to status error without throwing', async () => {
    fetchMock.mockResolvedValue(json({ error: 'x' }, 500));
    await expect(useLearnStore.getState().load()).resolves.toBeUndefined();
    expect(useLearnStore.getState().status).toBe('error');
    expect(useLearnStore.getState().error).toBe('load_failed');

    fetchMock.mockRejectedValue(new TypeError('offline'));
    await useLearnStore.getState().load();
    expect(useLearnStore.getState().status).toBe('error');
    expect(useLearnStore.getState().error).toBe('load_failed');

    fetchMock.mockResolvedValue(json({ error: 'Unauthorized' }, 401));
    await useLearnStore.getState().load();
    expect(useLearnStore.getState().error).toBe('unauthorized');
  });

  it('setInstrument updates at once, PUTs the whole profile, and keeps it on success', async () => {
    useLearnStore.setState({ profile: PROFILE, status: 'ready' });
    fetchMock.mockResolvedValue(json({ profile: { ...PROFILE, instrument: 'guitar' } }));
    const done = useLearnStore.getState().setInstrument('guitar');
    expect(useLearnStore.getState().profile?.instrument).toBe('guitar');
    await done;
    expect(useLearnStore.getState().profile?.instrument).toBe('guitar');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/rmhmusic/learn/profile');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({ ...PROFILE, instrument: 'guitar' });
  });

  it('setInstrument rolls back and records an error when the PUT fails', async () => {
    useLearnStore.setState({ profile: PROFILE, status: 'ready' });
    fetchMock.mockResolvedValue(json({ error: 'x' }, 500));
    const done = useLearnStore.getState().setInstrument('guitar');
    expect(useLearnStore.getState().profile?.instrument).toBe('guitar');
    await done;
    expect(useLearnStore.getState().profile?.instrument).toBe('piano');
    expect(useLearnStore.getState().error).toBe('save_failed');
    expect(useLearnStore.getState().status).toBe('ready');
  });

  it('setLatency rounds and clamps to the schema range before sending', async () => {
    useLearnStore.setState({ profile: PROFILE, status: 'ready' });
    fetchMock.mockImplementation(async () => json({ profile: PROFILE }));
    await useLearnStore.getState().setLatency(812.6);
    expect(useLearnStore.getState().profile?.latencyMs).toBe(500);
    await useLearnStore.getState().setLatency(-41.4);
    expect(useLearnStore.getState().profile?.latencyMs).toBe(-41);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).latencyMs).toBe(-41);
  });

  it('completeLesson merges optimistically, then the server progress replaces it', async () => {
    useLearnStore.setState({ profile: PROFILE, progress: [ROW], status: 'ready' });
    const serverProgress: LessonProgressRow[] = [{ ...ROW, stars: 3, bestScore: 95 }];
    fetchMock.mockResolvedValue(json({ stars: 3, xpAwarded: 20, progress: serverProgress }));

    const done = useLearnStore.getState().completeLesson('staff-what-is-a-staff', 3, 95);
    expect(useLearnStore.getState().progress).toEqual([{ ...ROW, stars: 3, bestScore: 95 }]);
    // A worse replay would not lower it: the optimistic merge is the server's rule.
    await done;
    expect(useLearnStore.getState().progress).toEqual(serverProgress);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/rmhmusic/learn/lesson-complete');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      lessonId: 'staff-what-is-a-staff',
      stars: 3,
      score: 95,
    });
  });

  it('completeLesson adds a row for a first completion and rolls it back on failure', async () => {
    useLearnStore.setState({ profile: PROFILE, progress: [ROW], status: 'ready' });
    fetchMock.mockResolvedValue(json({ error: 'x' }, 500));
    const done = useLearnStore.getState().completeLesson('staff-treble-notes', 2, 80);
    const optimistic = useLearnStore
      .getState()
      .progress.find((r) => r.lessonId === 'staff-treble-notes');
    expect(optimistic).toMatchObject({ stars: 2, bestScore: 80 });
    await done;
    expect(useLearnStore.getState().progress).toEqual([ROW]);
    expect(useLearnStore.getState().error).toBe('save_failed');
  });

  it('completeLesson rolls an improved row back to what it was', async () => {
    useLearnStore.setState({ profile: PROFILE, progress: [ROW], status: 'ready' });
    fetchMock.mockRejectedValue(new TypeError('offline'));
    await useLearnStore.getState().completeLesson('staff-what-is-a-staff', 3, 99);
    expect(useLearnStore.getState().progress).toEqual([ROW]);
  });

  it('completeLesson ignores an unknown lesson without a request', async () => {
    useLearnStore.setState({ profile: PROFILE, progress: [ROW], status: 'ready' });
    await useLearnStore.getState().completeLesson('nope', 3, 100);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useLearnStore.getState().progress).toEqual([ROW]);
  });
});
