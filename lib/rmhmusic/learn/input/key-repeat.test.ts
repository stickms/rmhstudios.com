import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  isHeldActivation,
  isHeldOnControl,
} from './key-repeat';

describe('isHeldActivation', () => {
  it('is true only for a repeating Enter', () => {
    expect(
      isHeldActivation(
        {
          key: 'Enter',
          repeat: true,
        },
      ),
    ).toBe(
      true,
    );
  });

  it('leaves a first Enter press alone', () => {
    expect(
      isHeldActivation(
        {
          key: 'Enter',
          repeat: false,
        },
      ),
    ).toBe(
      false,
    );
  });

  it('leaves other keys alone, repeating or not (Space clicks once, on keyup)', () => {
    for (const key of [
      ' ',
      'Tab',
      'a',
      'Escape',
    ]) {
      expect(
        isHeldActivation(
          {
            key,
            repeat: true,
          },
        ),
      ).toBe(
        false,
      );
      expect(
        isHeldActivation(
          {
            key,
            repeat: false,
          },
        ),
      ).toBe(
        false,
      );
    }
  });
});

interface FakeEl {
  tag: string;
  attrs: Record<
    string,
    string
  >;
  parent?: FakeEl;
  closest: (
    selector: string,
  ) => FakeEl | null;
}

/** A stand-in for an element in a tree: `closest` finds the first of its own chain a selector names. */
function el(
  tag: string,
  attrs: Record<
    string,
    string
  > = {},
  parent?: FakeEl,
): FakeEl {
  const self: FakeEl =
    {
      tag,
      attrs,
      parent,
      closest(
        selector,
      ) {
        const wanted =
          selector
            .split(
              ',',
            )
            .map(
              (
                s,
              ) =>
                s.trim(),
            );
        const matches =
          (
            n: FakeEl,
          ) =>
            wanted.some(
              (
                w,
              ) =>
                w ===
                'a[href]'
                  ? n.tag ===
                      'a' &&
                    'href' in
                      n.attrs
                  : w ===
                    n.tag,
            );
        for (
          let n:
            | FakeEl
            | undefined =
            self;
          n;
          n =
            n.parent
        )
          if (
            matches(
              n,
            )
          )
            return n;
        return null;
      },
    };
  return self;
}

describe('isHeldOnControl', () => {
  const held =
    {
      key: 'Enter',
      repeat: true,
    };

  it('catches a held Enter that reached a button, or anything inside one', () => {
    const button =
      el(
        'button',
      );
    expect(
      isHeldOnControl(
        {
          ...held,
          target:
            button,
        },
      ),
    ).toBe(
      true,
    );
    expect(
      isHeldOnControl(
        {
          ...held,
          target:
            el(
              'span',
              {},
              button,
            ),
        },
      ),
    ).toBe(
      true,
    );
  });

  it('catches a held Enter that reached a link, which focus lands on after the last card', () => {
    const link =
      el(
        'a',
        {
          href: '/rmhmusic',
        },
      );
    expect(
      isHeldOnControl(
        {
          ...held,
          target:
            link,
        },
      ),
    ).toBe(
      true,
    );
    expect(
      isHeldOnControl(
        {
          ...held,
          target:
            el(
              'span',
              {},
              link,
            ),
        },
      ),
    ).toBe(
      true,
    );
  });

  it('leaves a link with no href, a plain element, a first press and other keys alone', () => {
    expect(
      isHeldOnControl(
        {
          ...held,
          target:
            el(
              'a',
            ),
        },
      ),
    ).toBe(
      false,
    );
    expect(
      isHeldOnControl(
        {
          ...held,
          target:
            el(
              'div',
            ),
        },
      ),
    ).toBe(
      false,
    );
    expect(
      isHeldOnControl(
        {
          key: 'Enter',
          repeat: false,
          target:
            el(
              'button',
            ),
        },
      ),
    ).toBe(
      false,
    );
    expect(
      isHeldOnControl(
        {
          key: ' ',
          repeat: true,
          target:
            el(
              'button',
            ),
        },
      ),
    ).toBe(
      false,
    );
  });

  it('does not throw for a target that is not an element', () => {
    expect(
      isHeldOnControl(
        {
          ...held,
          target:
            null,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      isHeldOnControl(
        {
          ...held,
          target:
            {},
        },
      ),
    ).toBe(
      false,
    );
  });
});
