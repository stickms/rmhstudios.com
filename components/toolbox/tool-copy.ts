import type { TFunction } from 'i18next';
import {
  Binary,
  Braces,
  CalendarRange,
  CaseSensitive,
  Clock,
  Contrast,
  Dices,
  Diff,
  Fingerprint,
  Globe2,
  Hash,
  KeyRound,
  Landmark,
  Receipt,
  Regex,
  Shuffle,
  Table,
  Timer,
  Type,
  FileCode2,
  type LucideIcon,
} from 'lucide-react';
import type { ToolCategory } from '@/lib/toolbox/catalog';

/**
 * The translated name and one-line description of each tool, and its icon.
 *
 * Every key is written out literally so `i18next-parser` can find it: a key built
 * from the slug (`tool-${slug}-name`) would never reach `locales/en/tools.json`.
 */
export interface ToolCopy {
  name: string;
  description: string;
  icon: LucideIcon;
}

export function toolCopy(t: TFunction, slug: string): ToolCopy {
  switch (slug) {
    case 'text-stats':
      return {
        name: t('tool-text-stats-name', { ns: 'toolbox', defaultValue: 'Text statistics' }),
        description: t('tool-text-stats-desc', {
          ns: 'toolbox',
          defaultValue: 'Count words, characters and sentences, and estimate reading time.',
        }),
        icon: Type,
      };
    case 'case':
      return {
        name: t('tool-case-name', { ns: 'toolbox', defaultValue: 'Case converter' }),
        description: t('tool-case-desc', {
          ns: 'toolbox',
          defaultValue: 'Turn text into camelCase, snake_case, kebab-case, Title Case and more.',
        }),
        icon: CaseSensitive,
      };
    case 'diff':
      return {
        name: t('tool-diff-name', { ns: 'toolbox', defaultValue: 'Text diff' }),
        description: t('tool-diff-desc', {
          ns: 'toolbox',
          defaultValue: 'Compare two texts line by line and see what was added or removed.',
        }),
        icon: Diff,
      };
    case 'json':
      return {
        name: t('tool-json-name', { ns: 'toolbox', defaultValue: 'JSON formatter' }),
        description: t('tool-json-desc', {
          ns: 'toolbox',
          defaultValue: 'Validate, format, minify and sort JSON, with the exact position of any error.',
        }),
        icon: Braces,
      };
    case 'csv':
      return {
        name: t('tool-csv-name', { ns: 'toolbox', defaultValue: 'CSV and JSON converter' }),
        description: t('tool-csv-desc', {
          ns: 'toolbox',
          defaultValue: 'Convert CSV to JSON and back, with quoted fields and any delimiter.',
        }),
        icon: Table,
      };
    case 'regex':
      return {
        name: t('tool-regex-name', { ns: 'toolbox', defaultValue: 'Regex tester' }),
        description: t('tool-regex-desc', {
          ns: 'toolbox',
          defaultValue: 'Test a regular expression, inspect its groups and preview a replacement.',
        }),
        icon: Regex,
      };
    case 'encode':
      return {
        name: t('tool-encode-name', { ns: 'toolbox', defaultValue: 'Encoder and decoder' }),
        description: t('tool-encode-desc', {
          ns: 'toolbox',
          defaultValue: 'Base64, URL, HTML entity and hex encoding, both ways.',
        }),
        icon: FileCode2,
      };
    case 'hash':
      return {
        name: t('tool-hash-name', { ns: 'toolbox', defaultValue: 'Hash generator' }),
        description: t('tool-hash-desc', {
          ns: 'toolbox',
          defaultValue: 'SHA-1, SHA-256, SHA-384 and SHA-512 of text or a file, and checksum checks.',
        }),
        icon: Hash,
      };
    case 'ids':
      return {
        name: t('tool-ids-name', { ns: 'toolbox', defaultValue: 'ID generator' }),
        description: t('tool-ids-desc', {
          ns: 'toolbox',
          defaultValue: 'Generate UUIDs, ULIDs and nano IDs, and read the time inside one.',
        }),
        icon: Fingerprint,
      };
    case 'cron':
      return {
        name: t('tool-cron-name', { ns: 'toolbox', defaultValue: 'Cron helper' }),
        description: t('tool-cron-desc', {
          ns: 'toolbox',
          defaultValue: 'Check a cron expression field by field and see when it runs next.',
        }),
        icon: Timer,
      };
    case 'contrast':
      return {
        name: t('tool-contrast-name', { ns: 'toolbox', defaultValue: 'Contrast checker' }),
        description: t('tool-contrast-desc', {
          ns: 'toolbox',
          defaultValue: 'Check a text and background colour pair against WCAG 2.2.',
        }),
        icon: Contrast,
      };
    case 'base':
      return {
        name: t('tool-base-name', { ns: 'toolbox', defaultValue: 'Number base converter' }),
        description: t('tool-base-desc', {
          ns: 'toolbox',
          defaultValue: 'Binary, octal, decimal, hex and any base to 36, with signed integers.',
        }),
        icon: Binary,
      };
    case 'loan':
      return {
        name: t('tool-loan-name', { ns: 'toolbox', defaultValue: 'Loan calculator' }),
        description: t('tool-loan-desc', {
          ns: 'toolbox',
          defaultValue: 'Monthly payment, total interest and a full repayment schedule.',
        }),
        icon: Landmark,
      };
    case 'split-bill':
      return {
        name: t('tool-split-bill-name', { ns: 'toolbox', defaultValue: 'Bill splitter' }),
        description: t('tool-split-bill-desc', {
          ns: 'toolbox',
          defaultValue: 'Add tax and tip, then split a bill evenly or by shares.',
        }),
        icon: Receipt,
      };
    case 'timestamp':
      return {
        name: t('tool-timestamp-name', { ns: 'toolbox', defaultValue: 'Timestamp converter' }),
        description: t('tool-timestamp-desc', {
          ns: 'toolbox',
          defaultValue: 'Convert Unix timestamps to dates and back.',
        }),
        icon: Clock,
      };
    case 'timezones':
      return {
        name: t('tool-timezones-name', { ns: 'toolbox', defaultValue: 'Time zone converter' }),
        description: t('tool-timezones-desc', {
          ns: 'toolbox',
          defaultValue: 'See one moment in several time zones, for planning across them.',
        }),
        icon: Globe2,
      };
    case 'date-calc':
      return {
        name: t('tool-date-calc-name', { ns: 'toolbox', defaultValue: 'Date calculator' }),
        description: t('tool-date-calc-desc', {
          ns: 'toolbox',
          defaultValue: 'Days between two dates, business days, and adding or subtracting time.',
        }),
        icon: CalendarRange,
      };
    case 'password':
      return {
        name: t('tool-password-name', { ns: 'toolbox', defaultValue: 'Password generator' }),
        description: t('tool-password-desc', {
          ns: 'toolbox',
          defaultValue: 'Strong random passwords and passphrases, made on your device.',
        }),
        icon: KeyRound,
      };
    case 'dice':
      return {
        name: t('tool-dice-name', { ns: 'toolbox', defaultValue: 'Dice roller' }),
        description: t('tool-dice-desc', {
          ns: 'toolbox',
          defaultValue: 'Roll any dice in standard notation, like 4d6kh3 or 2d20+5.',
        }),
        icon: Dices,
      };
    case 'picker':
      return {
        name: t('tool-picker-name', { ns: 'toolbox', defaultValue: 'Random picker' }),
        description: t('tool-picker-desc', {
          ns: 'toolbox',
          defaultValue: 'Draw winners from a list, shuffle it, or split it into teams.',
        }),
        icon: Shuffle,
      };
    default:
      return { name: slug, description: '', icon: Hash };
  }
}

export function categoryLabel(t: TFunction, category: ToolCategory): string {
  switch (category) {
    case 'text':
      return t('category-text', { ns: 'toolbox', defaultValue: 'Text' });
    case 'developer':
      return t('category-developer', { ns: 'toolbox', defaultValue: 'Developer' });
    case 'numbers':
      return t('category-numbers', { ns: 'toolbox', defaultValue: 'Numbers and money' });
    case 'time':
      return t('category-time', { ns: 'toolbox', defaultValue: 'Dates and time' });
    case 'everyday':
      return t('category-everyday', { ns: 'toolbox', defaultValue: 'Everyday' });
  }
}
