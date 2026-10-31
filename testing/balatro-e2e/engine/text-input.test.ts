/**
 * The phone keyboard path (lib/balatro/text-input.ts) against the real engine: a tap on a
 * menu's text field must focus the page's hidden input inside the tap (what makes iOS raise
 * its keyboard), and what is then typed must reach the field as the keypresses Balatro reads.
 * A menu with one text field is opened by the test-only autopilot command `open_text_input`.
 *
 * Chromium runs it with real touch. Firefox has no touch emulation in Playwright: set
 * BALATRO_E2E_FIREFOX=1 (under xvfb-run: headless Firefox has no WebGL here) to run the same
 * flow with a synthetic `touchend` and a mouse click for the game's own tap.
 */
import { firefox, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseTextState } from '../../../lib/balatro/text-input';
import { openEngine, startEngineStack, type EnginePage, type EngineStack } from '../lib/engine-driver';

interface Harness {
  text(): string | null;
}

const readText = (page: Page) =>
  page.evaluate(() => (window as unknown as { __balatroEngine: Harness }).__balatroEngine.text());

async function waitForField(page: Page) {
  for (let i = 0; i < 100; i++) {
    const { field } = parseTextState((await readText(page)) ?? '');
    if (field) return field;
    await page.waitForTimeout(100);
  }
  throw new Error('the text field was never published');
}

const focusedClass = (page: Page) => page.evaluate(() => document.activeElement?.className ?? '');

async function typeIntoField(engine: EnginePage, tap: (x: number, y: number) => Promise<void>) {
  const { page } = engine;
  await engine.call('open_text_input');
  const field = await waitForField(page);
  const frame = (await page.evaluate(() => {
    const r = document.getElementById('frame')!.getBoundingClientRect();
    return { x: r.left, y: r.top };
  })) as { x: number; y: number };
  await tap(frame.x + field.x + field.w / 2, frame.y + field.y + field.h / 2);
  await expect.poll(() => focusedClass(page), { timeout: 5000 }).toBe('balatro-text-input');

  await page.keyboard.type('ab1');
  await expect
    .poll(async () => (await engine.call<{ value: string }>('text_value')).value, { timeout: 5000 })
    .toBe('AB1');
  await page.keyboard.press('Backspace');
  await expect
    .poll(async () => (await engine.call<{ value: string }>('text_value')).value, { timeout: 5000 })
    .toBe('AB');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await engine.call<{ hooked: boolean }>('text_value')).hooked, { timeout: 5000 })
    .toBe(false);
  expect(await focusedClass(page)).not.toBe('balatro-text-input');
}

describe('phone keyboard (chromium, touch)', () => {
  let stack: EngineStack;
  beforeAll(async () => {
    stack = await startEngineStack();
  }, 300_000);
  afterAll(() => stack?.close());

  it('a tap on a text field raises the input, and typing reaches the field', async () => {
    const engine = await openEngine(stack.browser, stack.server.url, { contextOptions: { hasTouch: true } });
    try {
      await typeIntoField(engine, (x, y) => engine.page.touchscreen.tap(x, y));
    } finally {
      await engine.close();
    }
  }, 300_000);
});

describe.skipIf(!process.env.BALATRO_E2E_FIREFOX)('phone keyboard (firefox, synthetic touch)', () => {
  let stack: EngineStack;
  let browser: Browser;
  beforeAll(async () => {
    stack = await startEngineStack();
    browser = await firefox.launch({
      ...(process.env.FIREFOX_PATH ? { executablePath: process.env.FIREFOX_PATH } : {}),
      headless: !process.env.DISPLAY,
      env: { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1' },
      firefoxUserPrefs: { 'gfx.webrender.software': true, 'webgl.forbid-software': false, 'dom.w3c_touch_events.enabled': 1 },
    });
  }, 300_000);
  afterAll(async () => {
    await browser?.close();
    await stack?.close();
  });

  it('a tap on a text field raises the input, and typing reaches the field', async () => {
    const engine = await openEngine(browser, stack.server.url);
    try {
      await typeIntoField(engine, async (x, y) => {
        await engine.page.mouse.click(x, y); // the game's own tap hooks the field
        await engine.page.evaluate(
          ([px, py]) => {
            const canvas = document.getElementById('canvas')!;
            const touch = new Touch({ identifier: 1, target: canvas, clientX: px, clientY: py });
            canvas.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch], bubbles: true }));
          },
          [x, y],
        );
      });
    } finally {
      await engine.close();
    }
  }, 300_000);
});
