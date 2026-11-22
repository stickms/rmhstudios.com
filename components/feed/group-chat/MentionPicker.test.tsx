// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      o: {
        defaultValue: string;
      },
    ) => o.defaultValue,
  }),
}));
vi.mock('@/components/ui/UserAvatar', () => ({
  UserAvatar: () => null,
}));

import { useMentionPicker } from './MentionPicker';

const members = [
  {
    id: 'me',
    name: 'Me',
    handle: 'me',
    image: null,
  },
  {
    id: 'a',
    name: 'Ann Lee',
    handle: 'ann',
    image: null,
  },
  {
    id: 'b',
    name: 'Bo',
    handle: 'annabel',
    image: null,
  },
  {
    id: 'c',
    name: 'Cy',
    handle: 'cy',
    image: null,
  },
];

type Picker = ReturnType<typeof useMentionPicker>;

/** Render the hook's popover for a draft and hand back what it returned. */
function mount(draft: string) {
  let picker!: Picker;
  function Harness() {
    picker = useMentionPicker({
      members,
      viewerId: 'me',
      draft,
      setDraft: () => undefined,
      inputRef: createRef<HTMLTextAreaElement>(),
      maxLength: 2000,
    });
    return <>{picker.popover}</>;
  }
  const html = renderToString(<Harness />);
  return {
    html,
    picker,
  };
}

const key = (k: string) => {
  const e = {
    key: k,
    preventDefault: vi.fn(),
  };
  return e as unknown as Parameters<Picker['onKeyDown']>[0] & {
    preventDefault: ReturnType<typeof vi.fn>;
  };
};

describe('MentionPicker', () => {
  it('lists matching members as a listbox on `@`, the first option active, the viewer left out', () => {
    const { html, picker } = mount('hi @an');
    expect(html).toContain('role="listbox"');
    expect(html.match(/role="option"/g)).toHaveLength(2);
    expect(html).toContain('id="group-mention-option-0"');
    expect(html).toMatch(/aria-selected="true"[^>]*>|id="group-mention-option-0"[^>]*aria-selected="true"/);
    expect(html).not.toContain('@me<');
    expect(picker.fieldProps).toEqual({
      'aria-expanded': true,
      'aria-controls': 'group-mention-list',
      'aria-activedescendant': 'group-mention-option-0',
    });
  });

  it('is closed when there is no `@word` before the caret or nothing matches', () => {
    for (const draft of ['hello', 'a@b', '@zzz']) {
      const { html, picker } = mount(draft);
      expect(html).not.toContain('role="listbox"');
      expect(picker.open).toBe(false);
      expect(picker.fieldProps).toEqual({
        'aria-expanded': false,
      });
    }
  });

  it('takes arrows, Enter, Tab and Escape while open, and nothing while closed', () => {
    const open = mount('@an').picker;
    for (const k of ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape']) {
      const e = key(k);
      expect(open.onKeyDown(e), k).toBe(true);
      if (k !== 'Escape') expect(e.preventDefault, k).toHaveBeenCalled();
    }
    const letter = key('a');
    expect(open.onKeyDown(letter)).toBe(false);
    const closed = mount('hello').picker;
    const enter = key('Enter');
    expect(closed.onKeyDown(enter)).toBe(false);
    expect(enter.preventDefault).not.toHaveBeenCalled();
  });
});
