/**
 * The guest's own lines, through the real parser, agent client and HomeSession (only the machine
 * and the store are fakes): what the person sees and what is stored after `SESSION_OK <user>` and
 * `SAVED_ON_POWEROFF <bytes>`. Wave A wrote the parser and the guest; wave B the page. This is the
 * seam between them.
 */
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AgentClient } from '../../engine/agent';
import { SHARE_ARCHIVE_PATH } from '../../engine/agent-protocol';
import {
  HomeSession,
  type SessionEnv,
  type SessionSnapshot,
} from '../../engine/home-session';
import { HomeSync } from '../../engine/home-sync';
import { memoryHomeStore } from '../../engine/home-store';
import { AboutUser } from '../AboutDialog';
import { displayLinuxUser } from '../about-facts';

const i18n =
  i18next.createInstance();
await i18n.init(
  {
    lng: 'en',
    fallbackLng:
      'en',
    resources:
      {},
    interpolation:
      {
        escapeValue: false,
      },
  },
);

function fakeTar(): Uint8Array {
  const t =
    new Uint8Array(
      1536,
    );
  t.fill(
    7,
    0,
    100,
  );
  t.set(
    new TextEncoder().encode(
      'ustar  \0',
    ),
    257,
  );
  return t;
}

const inertTarget =
  {
    addEventListener:
      () => {},
    removeEventListener:
      () => {},
  };
const env: SessionEnv =
  {
    now: () =>
      Date.now(),
    setInterval:
      () =>
        1,
    clearInterval:
      () => {},
    setTimeout:
      (
        cb,
        ms,
      ) =>
        setTimeout(
          cb,
          ms,
        ),
    clearTimeout:
      (
        h,
      ) =>
        clearTimeout(
          h as ReturnType<
            typeof setTimeout
          >,
        ),
    doc: Object.assign(
      {
        visibilityState:
          'visible',
      },
      inertTarget,
    ),
    win: inertTarget,
  };

/** A machine whose guest answers SESSION and RESTORE with the lines the real guest prints. */
function machine(
  sessionReply: string,
) {
  const listeners =
    new Set<
      (
        c: string,
      ) => void
    >();
  const sent: string[] =
    [];
  const share =
    new Map<
      string,
      Uint8Array
    >();
  const emit =
    (
      text: string,
    ) =>
      listeners.forEach(
        (
          cb,
        ) =>
          cb(
            text,
          ),
      );
  const vm =
    {
      onSerial1(
        cb: (
          c: string,
        ) => void,
      ) {
        listeners.add(
          cb,
        );
        return () =>
          listeners.delete(
            cb,
          );
      },
      sendSerial1(
        text: string,
      ) {
        sent.push(
          text,
        );
        if (
          text.startsWith(
            'SESSION ',
          )
        )
          queueMicrotask(
            () =>
              emit(
                sessionReply,
              ),
          );
        if (
          text.startsWith(
            'RESTORE',
          )
        )
          queueMicrotask(
            () =>
              emit(
                'RMHOS RESTORED\n',
              ),
          );
      },
      writeShareFile:
        async (
          p: string,
          d: Uint8Array,
        ) =>
          void share.set(
            p,
            d,
          ),
      readShareFile:
        async (
          p: string,
        ) =>
          share.get(
            p,
          )!,
      deleteShareFile:
        async (
          p: string,
        ) =>
          void share.delete(
            p,
          ),
    };
  const agent =
    new AgentClient(
      vm,
    );
  const store =
    memoryHomeStore();
  const sync =
    new HomeSync(
      {
        userId:
          'u1',
        vm,
        agent,
        store,
      },
    );
  const snaps: SessionSnapshot[] =
    [];
  const session =
    new HomeSession(
      {
        agent,
        sync,
        linuxUser:
          'guest',
        autosaveMs: 300_000,
        env,
        onChange:
          (
            s,
          ) =>
            snaps.push(
              s,
            ),
      },
    );
  return {
    session,
    emit,
    sent,
    share,
    store,
  };
}

const aboutLine =
  (
    guestUser:
      | string
      | null,
    siteUser:
      | string
      | null,
  ) => {
    const user =
      displayLinuxUser(
        guestUser,
        siteUser,
      );
    return renderToStaticMarkup(
      <I18nextProvider
        i18n={
          i18n
        }
      >
        {user && (
          <AboutUser
            user={
              user
            }
          />
        )}
      </I18nextProvider>,
    );
  };

describe('SESSION_OK <user> reaches the About line', () => {
  it('RMHOS SESSION_OK guest_rmh: About says guest_rmh, not the name the site asked for', async () => {
    const m =
      machine(
        'RMHOS SESSION_OK guest_rmh\n',
      );
    await m.session.start();
    expect(
      m
        .sent[0],
    ).toMatch(
      /^SESSION guest /,
    );
    expect(
      m
        .session
        .snapshot
        .linuxName,
    ).toBe(
      'guest_rmh',
    );
    expect(
      aboutLine(
        m
          .session
          .snapshot
          .linuxName,
        'guest',
      ),
    ).toBe(
      '<p>You are signed in to rmhOS as guest_rmh.</p>',
    );
  });

  it('a bare SESSION_OK still works: About falls back to the site name', async () => {
    const m =
      machine(
        'RMHOS SESSION_OK\n',
      );
    await m.session.start();
    expect(
      m
        .session
        .snapshot,
    ).toMatchObject(
      {
        stage:
          'running',
        linuxName:
          null,
      },
    );
    expect(
      aboutLine(
        m
          .session
          .snapshot
          .linuxName,
        'guest',
      ),
    ).toContain(
      'as guest.',
    );
  });
});

describe('SAVED_ON_POWEROFF <bytes> is stored without a SAVE', () => {
  it('parser line, then POWEROFF: the share tar is stored, no SAVE command is sent, the machine stops', async () => {
    const m =
      machine(
        'RMHOS SESSION_OK guest\n',
      );
    await m.session.start();
    m.session.markDirty();
    m.share.set(
      SHARE_ARCHIVE_PATH,
      fakeTar(),
    );
    m.emit(
      'RMHOS SAVED_ON_POWEROFF 1536\nRMHOS POWEROFF\n',
    );
    await vi.waitFor(
      () =>
        expect(
          m
            .session
            .snapshot
            .stage,
        ).toBe(
          'stopped',
        ),
    );
    expect(
      m.sent.some(
        (
          l,
        ) =>
          l.startsWith(
            'SAVE',
          ),
      ),
    ).toBe(
      false,
    );
    expect(
      m
        .session
        .snapshot
        .lastSave
        ?.result
        .status,
    ).toBe(
      'saved',
    );
    expect(
      await m.store.get(
        'u1',
      ),
    ).not.toBeNull();
  });

  it('a byte count that does not match the share is refused', async () => {
    const m =
      machine(
        'RMHOS SESSION_OK guest\n',
      );
    await m.session.start();
    m.share.set(
      SHARE_ARCHIVE_PATH,
      fakeTar(),
    );
    m.emit(
      'RMHOS SAVED_ON_POWEROFF 999\nRMHOS POWEROFF\n',
    );
    await vi.waitFor(
      () =>
        expect(
          m
            .session
            .snapshot
            .stage,
        ).toBe(
          'stopped',
        ),
    );
    expect(
      m
        .session
        .snapshot
        .lastSave
        ?.result,
    ).toMatchObject(
      {
        status:
          'failed',
        code: 'bad_archive',
      },
    );
    expect(
      await m.store.get(
        'u1',
      ),
    ).toBeNull();
  });
});
