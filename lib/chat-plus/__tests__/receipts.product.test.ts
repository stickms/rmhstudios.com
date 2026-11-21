import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  DEFAULT_RECEIPT_PREFS,
  effectiveHidden,
  hiddenBy,
  type ParticipantReceiptPrefs,
} from '@/lib/chat-plus/receipts';

const P =
  (
    o: Partial<ParticipantReceiptPrefs> = {},
  ): ParticipantReceiptPrefs => ({
    ...DEFAULT_RECEIPT_PREFS,
    ...o,
  });

describe('effectiveHidden truth table', () => {
  const states: [
    string,
    Partial<ParticipantReceiptPrefs>,
  ][] =
    [
      [
        'clear',
        {},
      ],
      [
        'account off',
        {
          accountReceipts: false,
          accountTyping: false,
        },
      ],
      [
        'conversation off',
        {
          hideReceipts: true,
          hideTyping: true,
        },
      ],
      [
        'both off',
        {
          accountReceipts: false,
          accountTyping: false,
          hideReceipts: true,
          hideTyping: true,
        },
      ],
    ];

  for (const [
    an,
    a,
  ] of states) {
    for (const [
      bn,
      b,
    ] of states) {
      it(`A ${an} / B ${bn}`, () => {
        const expected =
          !(
            an ===
              'clear' &&
            bn ===
              'clear'
          );
        expect(
          effectiveHidden(
            P(
              a,
            ),
            P(
              b,
            ),
          ),
        ).toEqual(
          {
            receipts:
              expected,
            typing:
              expected,
          },
        );
      });
    }
  }

  it('is symmetric', () => {
    const a =
      P(
        {
          accountReceipts: false,
        },
      );
    const b =
      P(
        {
          hideTyping: true,
        },
      );
    expect(
      effectiveHidden(
        a,
        b,
      ),
    ).toEqual(
      effectiveHidden(
        b,
        a,
      ),
    );
    expect(
      effectiveHidden(
        a,
        b,
      ),
    ).toEqual(
      {
        receipts: true,
        typing: true,
      },
    );
  });

  it('keeps receipts and typing independent', () => {
    expect(
      effectiveHidden(
        P(
          {
            accountReceipts: false,
          },
        ),
        P(),
      ),
    ).toEqual(
      {
        receipts: true,
        typing: false,
      },
    );
    expect(
      hiddenBy(
        P(
          {
            hideTyping: true,
          },
        ),
      ),
    ).toEqual(
      {
        receipts: false,
        typing: true,
      },
    );
  });

  it('has no per-conversation "on" that overrides an account "off"', () => {
    expect(
      hiddenBy(
        P(
          {
            accountReceipts: false,
            hideReceipts: false,
          },
        ),
      )
        .receipts,
    ).toBe(
      true,
    );
  });
});
