import { z } from 'zod';

/**
 * Shared vocabulary + validation for the bug-bounty program. Imported by the
 * public submission form, the reward table on /security, the server functions
 * that persist reports, and the admin review page — so the categories, tiers,
 * and rules stay in lockstep everywhere.
 */

// ─── Categories (submission form + reward table) ────────────────────────────
export const SECURITY_CATEGORIES = [
  { value: 'RCE', label: 'Remote code execution' },
  { value: 'AUTH_BYPASS', label: 'Authentication bypass / account takeover' },
  { value: 'ACCESS_CONTROL', label: 'Broken access control / IDOR' },
  { value: 'SSRF', label: 'Server-side request forgery (SSRF)' },
  { value: 'INJECTION', label: 'Injection (SQL / command)' },
  { value: 'XSS', label: 'Cross-site scripting (XSS)' },
  { value: 'PAYMENTS', label: 'Payment / entitlement manipulation' },
  { value: 'DATA_EXPOSURE', label: 'Sensitive data / secret exposure' },
  { value: 'CSRF', label: 'Cross-site request forgery (CSRF)' },
  { value: 'OPEN_REDIRECT', label: 'Open redirect / phishing' },
  { value: 'OTHER', label: 'Something else' },
] as const;

export const SECURITY_CATEGORY_VALUES = SECURITY_CATEGORIES.map((c) => c.value);

export function securityCategoryLabel(value: string): string {
  return SECURITY_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

// ─── Reporter-suggested severity ────────────────────────────────────────────
export const SECURITY_SEVERITIES = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
] as const;

export const SECURITY_SEVERITY_VALUES = SECURITY_SEVERITIES.map((s) => s.value);

// ─── Review workflow statuses (admin panel) ─────────────────────────────────
export const SECURITY_REPORT_STATUSES = [
  'NEW',
  'TRIAGING',
  'ACCEPTED',
  'RESOLVED',
  'DUPLICATE',
  'NOT_APPLICABLE',
] as const;

export type SecurityReportStatus = (typeof SECURITY_REPORT_STATUSES)[number];

export const SECURITY_STATUS_LABELS: Record<SecurityReportStatus, string> = {
  NEW: 'New',
  TRIAGING: 'Triaging',
  ACCEPTED: 'Accepted',
  RESOLVED: 'Resolved',
  DUPLICATE: 'Duplicate',
  NOT_APPLICABLE: 'Not applicable',
};

// ─── Reward tiers (headline table on /security) ─────────────────────────────
export interface RewardTier {
  severity: string;
  label: string;
  reward: string;
  blurb: string;
  examples: string;
}

export const REWARD_TIERS: RewardTier[] = [
  {
    severity: 'critical',
    label: 'Critical',
    reward: '$500,000–$5,000,000',
    blurb: 'A break that could compromise the platform itself or its users at scale.',
    examples:
      'Remote code execution on production infrastructure · full authentication bypass · mass account takeover · extraction of the production database or platform secrets.',
  },
  {
    severity: 'high',
    label: 'High',
    reward: '$50,000–$500,000',
    blurb: "Serious access to data or systems you shouldn't be able to reach.",
    examples:
      "SQL/command injection · SSRF reaching internal services or cloud metadata · stored XSS in another user's session · IDOR exposing another user's private data · privilege escalation to admin · payment or entitlement manipulation.",
  },
  {
    severity: 'medium',
    label: 'Medium',
    reward: '$5,000–$50,000',
    blurb: 'A real flaw with a meaningful, but bounded, impact.',
    examples:
      'CSRF on sensitive actions · reflected XSS · authorization gaps with limited scope · open redirects usable for phishing · rate-limit bypasses that enable abuse.',
  },
  {
    severity: 'low',
    label: 'Low',
    reward: '$25–$5,000',
    blurb: 'A genuine issue with a realistic, if narrow, path to harm.',
    examples:
      'Self-XSS with a credible escalation · low-impact information disclosure · security misconfigurations with a demonstrated effect.',
  },
  {
    severity: 'informational',
    label: 'Informational',
    reward: '$100–$1,000',
    blurb: 'A useful, original hardening observation without a demonstrated exploit path.',
    examples:
      'A reproducible security hygiene improvement · a narrow information leak with no sensitive content · a defense-in-depth gap that helps prevent future vulnerabilities.',
  },
];

// ─── Per-category requirements (detail table on /security) ──────────────────
export interface CategoryBounty {
  category: string;
  max: string;
  requirement: string;
}

export const CATEGORY_BOUNTIES: CategoryBounty[] = [
  {
    category: 'Remote code execution',
    max: '$5,000,000',
    requirement:
      'Run arbitrary code on RMH Studios production servers. Needs a working proof-of-concept that does not rely on already-compromised credentials.',
  },
  {
    category: 'Authentication bypass / account takeover',
    max: '$5,000,000',
    requirement:
      "Sign in as another user or defeat our passkey / OAuth / session checks without their help. Zero-click and reproducible at scale reaches the top of the range.",
  },
  {
    category: 'Broken access control / IDOR',
    max: '$500,000',
    requirement:
      "Read or change another user's private data or resources by manipulating identifiers. The reward scales with the sensitivity and volume of data reached.",
  },
  {
    category: 'Server-side request forgery (SSRF)',
    max: '$500,000',
    requirement:
      'Coerce our servers into requests to internal services or cloud metadata. You must demonstrate reaching a genuinely non-public target.',
  },
  {
    category: 'Injection (SQL / command)',
    max: '$500,000',
    requirement:
      "Inject into a database or shell through unsanitised input, with a PoC that reads or alters data you shouldn't be able to reach.",
  },
  {
    category: 'Stored cross-site scripting (XSS)',
    max: '$500,000',
    requirement:
      'Achieve persistent script execution in another user’s session. Provide the payload and the exact page it fires on.',
  },
  {
    category: 'Payment / entitlement manipulation',
    max: '$500,000',
    requirement:
      "Obtain paid features, coins, or subscriptions without paying, or change another user's balance or entitlements.",
  },
  {
    category: 'Sensitive data / secret exposure',
    max: '$500,000',
    requirement:
      'Expose secrets, tokens, or other users’ personal data. Report the exact endpoint and stop — never exfiltrate data at scale.',
  },
  {
    category: 'CSRF / reflected XSS',
    max: '$50,000',
    requirement:
      'Force a state-changing request cross-site, or reflect script execution from a request parameter. Include a working exploit page.',
  },
  {
    category: 'Open redirect & phishing vectors',
    max: '$50,000',
    requirement:
      'Redirect our users to an attacker-controlled destination from a trusted rmhstudios.com URL.',
  },
  {
    category: 'Defense-in-depth / security hardening',
    max: '$1,000',
    requirement:
      'Show an original, reproducible improvement that reduces real security risk but does not yet provide an exploit path. Eligible acknowledgements start at $100.',
  },
];

// ─── Submission validation ──────────────────────────────────────────────────
export const securityReportInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(6, 'Give your report a short, specific title (at least 6 characters).')
    .max(160, 'Please keep the title under 160 characters.'),
  category: z
    .string()
    .refine((v) => SECURITY_CATEGORY_VALUES.includes(v as never), 'Choose a category.'),
  severity: z
    .string()
    .refine((v) => SECURITY_SEVERITY_VALUES.includes(v as never), 'Choose a severity.'),
  affectedArea: z
    .string()
    .trim()
    .max(300, 'Please keep the affected area under 300 characters.')
    .optional()
    .default(''),
  description: z
    .string()
    .trim()
    .min(40, 'Please include clear reproduction steps and impact (at least 40 characters).')
    .max(8000, 'Please keep the write-up under 8000 characters.'),
  reporterName: z
    .string()
    .trim()
    .max(120, 'Please keep your name under 120 characters.')
    .optional()
    .default(''),
  reporterEmail: z
    .union([z.string().trim().email('Enter a valid email, or leave it blank.').max(200), z.literal('')])
    .optional()
    .default(''),
  // Honeypot — real people never see or fill this. Bots do.
  company: z.string().max(0).optional().default(''),
});

export type SecurityReportInput = z.infer<typeof securityReportInputSchema>;
