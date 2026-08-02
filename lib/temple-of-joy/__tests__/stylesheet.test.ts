/**
 * Guards on `components/temple-of-joy/temple-of-joy.css`.
 *
 * Temple of Joy is exempt from the site design tier — it has its own `--toj-*`
 * palette and its own sheet — so `lib/__tests__/design-consistency.test.ts`
 * never looks at it. These are the two rules that sheet has actually been
 * broken by, both of them invisible in review and both of them producing a UI
 * that looks *nearly* right, which is the hardest kind of wrong to find.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SHEET = join(process.cwd(), 'components/temple-of-joy/temple-of-joy.css');
const css = readFileSync(SHEET, 'utf8');

/** Every selector in the sheet, paired with the line it starts on. */
function selectors(): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  // Strip comments first: they contain braces, prose and example CSS.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const re = /(^|[};])\s*([^{};@]+?)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped))) {
    const text = m[2].trim();
    if (!text || text.startsWith('@') || text.startsWith('%')) continue;
    // Inside a keyframes body: `0%`, `from`, `to`.
    if (/^(from|to|[\d.]+%(\s*,\s*[\d.]+%)*)$/.test(text)) continue;
    out.push({ text, line: stripped.slice(0, m.index).split('\n').length });
  }
  return out;
}

describe('temple-of-joy.css', () => {
  /**
   * The bug: `.toj button { padding: 0 }` scores (0,1,1) — one class plus one
   * type — which outranks every single-class rule in a sheet built entirely out
   * of single-class rules. So `.toj-segment`, `.toj-tab` and `.toj-row` all
   * computed to `padding: 0` however much they asked for, and only the ones
   * that happened to carry an extra attribute selector kept theirs. The game
   * shipped a month with no padding inside any button in it, and the sheet
   * looked completely correct: every rule said the right thing.
   *
   * A reset must therefore lose to everything, which means zero specificity,
   * which means `:where()`.
   */
  it('has no element-qualified reset that can outrank a component class', () => {
    const offenders = selectors().filter(({ text }) =>
      text.split(',').some((part) => {
        const s = part.trim();
        if (!s.startsWith('.toj ')) return false;
        // `.toj :where(button)` and `:where(.toj button)` are both fine — a
        // `:where()` around the type selector is exactly the fix.
        const rest = s.slice(5).trim();
        return /^[a-z][a-z0-9]*(\s|:|$)/.test(rest) && !rest.startsWith(':where');
      }),
    );

    expect(
      offenders.map((o) => `${SHEET}:${o.line}  ${o.text}`),
      'A `.toj <element>` rule outranks every `.toj-thing` rule in this sheet. ' +
        'Wrap it in `:where()` so the reset loses to the components it resets.',
    ).toEqual([]);
  });

  /**
   * The other one: space BETWEEN two blocks written as padding on one of them.
   *
   * It looks identical and it is not: padding is part of a box, including for
   * hit-testing. `.toj-panel-note`'s 32px of bottom padding lay on top of the
   * card underneath it, and the top third of every source row in the game
   * stopped answering to a thumb. Nothing about it was visible — the layout was
   * pixel-for-pixel what it should have been.
   *
   * So the blocks that exist only to separate their neighbours use margin. The
   * exception is anything `sticky`, which has to cover what scrolls under it
   * and therefore genuinely wants a box.
   */
  it('spaces stacked panel blocks with margin, not padding', () => {
    const rules = ['.toj-section', '.toj-panel-note'];
    const bad: string[] = [];

    for (const rule of rules) {
      // The base declaration block for this selector, comments removed.
      const re = new RegExp(`(^|\\n)${rule.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'm');
      const body = re.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''))?.[2] ?? '';
      const padding = /(^|;)\s*padding(-block|-top|-bottom)?\s*:\s*([^;]+)/m.exec(body)?.[3];
      if (padding && !/^0(\s|$)/.test(padding.trim())) {
        bad.push(`${rule} sets block padding (${padding.trim()}) — use margin`);
      }
    }

    expect(bad, 'Between-block spacing must be margin: padding is hit-testable.').toEqual([]);
  });
});
