import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  NAME_STYLES,
  TYPING_HABITS,
  botPromptPersona,
  composePersona,
  hasNameStyle,
  humanizeBotText,
  pickNameStyle,
  pickTypingHabit,
  readTypingHabit,
  rollPersona,
  typingLine,
  withNameStyle,
} from '../persona';

const habit =
  (
    id: string,
  ) =>
    TYPING_HABITS.find(
      (
        h,
      ) =>
        h.id ===
        id,
    )!;
const persona =
  (
    id: string,
  ) =>
    `THEME: x.\n${typingLine(habit(id))}`;

describe('humanizeBotText', () => {
  it('never lets an em or en dash through', () => {
    const out =
      humanizeBotText(
        'the new place — honestly great—would go again',
        persona(
          'normal',
        ),
      );
    expect(
      out,
    ).not.toMatch(
      /[—–]/,
    );
    expect(
      out,
    ).toBe(
      'the new place - honestly great - would go again',
    );
    expect(
      humanizeBotText(
        'open 9–5 today',
        persona(
          'normal',
        ),
      ),
    ).toBe(
      'open 9-5 today',
    );
  });

  it('applies the habits a model forgets', () => {
    expect(
      humanizeBotText(
        'Saw Dune again. Still great.',
        persona(
          'no-caps',
        ),
      ),
    ).toBe(
      'saw dune again. still great.',
    );
    expect(
      humanizeBotText(
        'Saw Dune again.',
        persona(
          'no-periods',
        ),
      ),
    ).toBe(
      'Saw Dune again',
    );
    expect(
      humanizeBotText(
        'wait...',
        persona(
          'no-periods',
        ),
      ),
    ).toBe(
      'wait...',
    );
  });
});

describe('typing habits', () => {
  it('a legacy persona gets a stable habit from its id; a stored one is kept', () => {
    const a =
      botPromptPersona(
        'THEME: x.',
        'bot-1',
      );
    expect(
      readTypingHabit(
        a,
      ),
    ).not.toBeNull();
    expect(
      botPromptPersona(
        'THEME: x.',
        'bot-1',
      ),
    ).toBe(
      a,
    );
    expect(
      readTypingHabit(
        botPromptPersona(
          persona(
            'emoticons',
          ),
          'bot-1',
        ),
      )
        ?.id,
    ).toBe(
      'emoticons',
    );
  });

  it('new personas carry one TYPING and one NAME STYLE line', () => {
    const text =
      composePersona(
        rollPersona(),
      );
    expect(
      text
        .split(
          '\n',
        )
        .filter(
          (
            l,
          ) =>
            l.startsWith(
              'TYPING (',
            ),
        )
        .length,
    ).toBe(
      1,
    );
    expect(
      hasNameStyle(
        text,
      ),
    ).toBe(
      true,
    );
  });

  it('the pickers cover every entry across [0, 1)', () => {
    expect(
      pickTypingHabit(
        0,
      )
        .id,
    ).toBe(
      TYPING_HABITS[0]!
        .id,
    );
    expect(
      pickTypingHabit(
        0.999999,
      )
        .id,
    ).toBe(
      TYPING_HABITS[
        TYPING_HABITS.length -
          1
      ]!
        .id,
    );
    expect(
      pickNameStyle(
        0,
      )
        .id,
    ).toBe(
      NAME_STYLES[0]!
        .id,
    );
    expect(
      pickNameStyle(
        0.999999,
      )
        .id,
    ).toBe(
      NAME_STYLES[
        NAME_STYLES.length -
          1
      ]!
        .id,
    );
    expect(
      NAME_STYLES.reduce(
        (
          n,
          s,
        ) =>
          n +
          s.weight,
        0,
      ),
    ).toBeCloseTo(
      1,
    );
  });

  it('withNameStyle adds the line once', () => {
    const once =
      withNameStyle(
        'THEME: x.',
        NAME_STYLES[1]!,
      );
    expect(
      withNameStyle(
        once,
        NAME_STYLES[2]!,
      ),
    ).toBe(
      once,
    );
  });
});
