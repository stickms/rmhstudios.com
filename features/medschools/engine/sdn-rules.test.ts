import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  containsHandle,
  eventDateOk,
  inStateGuard,
  normalizeQuestion,
  passesPrefilter,
  programGuard,
  redactForModel,
  scrubQuestion,
  splitQuestions,
} from './sdn-rules';

describe('sdn-rules', () => {
  it('redacts emails, urls, mentions and page handles', () => {
    const out =
      redactForModel(
        'mail a.b@x.org see https://x.org/p?q=1 @bob_1, and Alice-77 said hi',
        [
          'alice-77',
        ],
      );
    expect(
      out,
    ).toBe(
      'mail [email] see [link] [user], and [user] said hi',
    );
  });
  it('matches handles on word boundaries only', () => {
    expect(
      redactForModel(
        'mikey went',
        [
          'mike',
        ],
      ),
    ).toBe(
      'mikey went',
    );
    expect(
      containsHandle(
        'thanks MIKE!',
        [
          'mike',
        ],
      ),
    ).toBe(
      true,
    );
    expect(
      containsHandle(
        'mikey',
        [
          'mike',
        ],
      ),
    ).toBe(
      false,
    );
  });
  it('matches 1-2 character handles as exact-case whole tokens (Q20)', () => {
    expect(
      redactForModel(
        'jo is a name, Jo too, jolly',
        [
          'jo',
        ],
      ),
    ).toBe(
      '[user] is a name, Jo too, jolly',
    );
    expect(
      containsHandle(
        'hi zq there',
        [
          'zq',
        ],
      ),
    ).toBe(
      true,
    );
    expect(
      containsHandle(
        'hi ZQ there',
        [
          'zq',
        ],
      ),
    ).toBe(
      false,
    );
    expect(
      containsHandle(
        'zqx',
        [
          'zq',
        ],
      ),
    ).toBe(
      false,
    );
  });
  it('redacts a 1-character handle only as a standalone token', () => {
    expect(
      redactForModel(
        'x-ray, x2, ax and x said',
        [
          'x',
        ],
      ),
    ).toBe(
      'x-ray, x2, ax and [user] said',
    );
    expect(
      containsHandle(
        'x-ray x2',
        [
          'x',
        ],
      ),
    ).toBe(
      false,
    );
    expect(
      containsHandle(
        'thanks x!',
        [
          'x',
        ],
      ),
    ).toBe(
      true,
    );
  });
  it('never matches filler words as short handles', () => {
    expect(
      redactForModel(
        'um uh ha ya yo ex ah ok oh',
        [
          'um',
          'uh',
          'ha',
          'ya',
          'yo',
          'ex',
          'ah',
          'ok',
          'oh',
        ],
      ),
    ).toBe(
      'um uh ha ya yo ex ah ok oh',
    );
  });
  it('never matches short handles that are common words', () => {
    expect(
      redactForModel(
        'it is ok to go in',
        [
          'it',
          'is',
          'ok',
          'go',
          'in',
          'a',
          'I',
        ],
      ),
    ).toBe(
      'it is ok to go in',
    );
    expect(
      containsHandle(
        'II at Duke',
        [
          'II',
          'md',
        ],
      ),
    ).toBe(
      false,
    );
  });
});

describe('passesPrefilter', () => {
  it.each(
    [
      'II at Duke 11/3',
      'Got an A from X',
      'interview',
      'received secondary 7/15',
      'got the 2ndary today',
      'Secondaries are out',
    ],
  )(
    'passes %j',
    (
      t,
    ) =>
      expect(
        passesPrefilter(
          t,
        ),
      ).toBe(
        true,
      ),
  );
  it.each(
    [
      'congrats everyone, good luck',
      'I got a ride and a snack today',
    ],
  )(
    'drops %j',
    (
      t,
    ) =>
      expect(
        passesPrefilter(
          t,
        ),
      ).toBe(
        false,
      ),
  );
});

describe('programGuard', () => {
  it('confirms a PHD claim only when the text says so', () => {
    expect(
      programGuard(
        'PHD',
        'MD/PhD applicant, II 11/3',
      ),
    ).toBe(
      'PHD',
    );
    expect(
      programGuard(
        'PHD',
        'MSTP II',
      ),
    ).toBe(
      'PHD',
    );
  });
  it('never originates PHD and defaults to REG', () => {
    expect(
      programGuard(
        'PHD',
        'II at Duke',
      ),
    ).toBe(
      'REG',
    );
    expect(
      programGuard(
        'REG',
        'MD only, accepted',
      ),
    ).toBe(
      'REG',
    );
    expect(
      programGuard(
        undefined,
        'II at Duke',
      ),
    ).toBe(
      'REG',
    );
    expect(
      programGuard(
        undefined,
        'MSTP II',
      ),
    ).toBe(
      'REG',
    );
  });
});

describe('inStateGuard', () => {
  it('needs the text to agree with the claim', () => {
    expect(
      inStateGuard(
        true,
        'OOS II',
      ),
    ).toBeNull();
    expect(
      inStateGuard(
        true,
        'IS II',
      ),
    ).toBe(
      true,
    );
    expect(
      inStateGuard(
        false,
        'out of state, II',
      ),
    ).toBe(
      false,
    );
    expect(
      inStateGuard(
        false,
        'IS II',
      ),
    ).toBeNull();
    expect(
      inStateGuard(
        true,
        'this is an II',
      ),
    ).toBeNull();
    expect(
      inStateGuard(
        undefined,
        'IS II',
      ),
    ).toBeNull();
  });
});

describe('eventDateOk (Q12)', () => {
  const post =
    new Date(
      '2026-11-20T15:00:00Z',
    );
  const d =
    (
      iso: string,
    ) =>
      new Date(
        `${iso}T00:00:00Z`,
      );
  it('accepts the post day and rejects the day after', () => {
    expect(
      eventDateOk(
        d(
          '2026-11-20',
        ),
        'INTERVIEW',
        post,
        2027,
      ),
    ).toBe(
      true,
    );
    expect(
      eventDateOk(
        d(
          '2026-11-21',
        ),
        'INTERVIEW',
        post,
        2027,
      ),
    ).toBe(
      false,
    );
  });
  it('allows 400 days back, not 401', () => {
    const later =
      new Date(
        '2027-08-31T12:00:00Z',
      );
    expect(
      eventDateOk(
        d(
          '2026-07-27',
        ),
        'INTERVIEW',
        later,
        2027,
      ),
    ).toBe(
      true,
    ); // 400 days
    expect(
      eventDateOk(
        d(
          '2026-07-26',
        ),
        'INTERVIEW',
        later,
        2027,
      ),
    ).toBe(
      false,
    ); // 401 days
  });
  it('rejects an event outside the thread cycle by its own type rule', () => {
    expect(
      eventDateOk(
        d(
          '2026-10-05',
        ),
        'INTERVIEW',
        post,
        2026,
      ),
    ).toBe(
      false,
    );
    expect(
      eventDateOk(
        d(
          '2026-06-15',
        ),
        'INTERVIEW',
        post,
        2026,
      ),
    ).toBe(
      true,
    );
    expect(
      eventDateOk(
        d(
          '2026-09-02',
        ),
        'ACCEPTANCE',
        post,
        2027,
      ),
    ).toBe(
      true,
    );
  });
});

describe('questions', () => {
  const handles =
    [
      'SomePageHandle',
    ];
  it.each(
    [
      [
        'email',
        'Why did you email me at a@b.org about this?',
      ],
      [
        'url',
        'Have you seen https://x.org/q for this school?',
      ],
      [
        'mention',
        'What did @pat ask you about research?',
      ],
      [
        'phone',
        'Can you call me on 555-123-4567 about it?',
      ],
      [
        'honorific',
        'Dr. Marlowe asked why I chose medicine?',
      ],
      [
        'handle',
        'What would SomePageHandle say about this?',
      ],
      [
        'too short',
        'Why?',
      ],
      [
        'too long',
        'Why this school? ' +
          'x'.repeat(
            400,
          ),
      ],
      [
        'not a question',
        'I loved the tour of the campus',
      ],
    ],
  )(
    'rejects %s',
    (
      _n,
      q,
    ) =>
      expect(
        scrubQuestion(
          q,
          handles,
        ),
      ).toBeNull(),
  );
  it('accepts plain questions and the page closure form', () => {
    expect(
      scrubQuestion(
        'Tell me about a time you failed',
        handles,
      ),
    ).toBe(
      'Tell me about a time you failed',
    );
    expect(
      scrubQuestion(
        'Why this school?',
        [],
      ),
    ).toBe(
      'Why this school?',
    );
    expect(
      scrubQuestion(
        'Why this school here?',
        {
          containsHandle:
            () =>
              true,
        },
      ),
    ).toBeNull();
  });
  it('splits on newlines and after question marks', () => {
    expect(
      splitQuestions(
        'Why MD? Why us?\nTell me about yourself\n\n- What is hard?',
      ),
    ).toEqual(
      [
        'Why MD?',
        'Why us?',
        'Tell me about yourself',
        'What is hard?',
      ],
    );
  });
  it('normalizes for the dedupe key', () => {
    expect(
      normalizeQuestion(
        'Why MD?',
      ),
    ).toBe(
      normalizeQuestion(
        'why  md',
      ),
    );
  });
});
