import { prisma } from '@/lib/prisma.server';
import { SITE_SHORTCUTS } from '@/lib/shortcuts/registry';
import {
  DEFAULT_KEYBOARD_PREFS,
  sanitizePrefs,
  type KeyboardPrefs,
} from '@/lib/shortcuts/bindings';

const KNOWN_IDS: ReadonlySet<string> = new Set(SITE_SHORTCUTS.map((s) => s.id));

/** A stored row, normalised: unknown ids and malformed sequences are dropped. */
export function parseKeyboardRow(
  row: {
    singleKeys: string;
    overrides: unknown;
  } | null,
): KeyboardPrefs {
  return row ? sanitizePrefs(row, KNOWN_IDS) : DEFAULT_KEYBOARD_PREFS;
}

export async function getKeyboardPrefs(userId: string): Promise<KeyboardPrefs> {
  const row = await prisma.keyboardPreference.findUnique({
    where: {
      userId,
    },
    select: {
      singleKeys: true,
      overrides: true,
    },
  });
  return parseKeyboardRow(row);
}

export async function saveKeyboardPrefs(
  userId: string,
  prefs: KeyboardPrefs,
): Promise<KeyboardPrefs> {
  const data = {
    singleKeys: prefs.singleKeys,
    overrides: prefs.overrides,
  };
  const row = await prisma.keyboardPreference.upsert({
    where: {
      userId,
    },
    create: {
      userId,
      ...data,
    },
    update: data,
    select: {
      singleKeys: true,
      overrides: true,
    },
  });
  return parseKeyboardRow(row);
}
