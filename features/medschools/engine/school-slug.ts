/** Registry identifiers used in school URLs, API requests and curated school data. */
export const SCHOOL_SLUG_MAX_LENGTH = 80;
export const SCHOOL_SLUG_PATTERN = `[a-z0-9-]{1,${SCHOOL_SLUG_MAX_LENGTH}}`;
export const SCHOOL_SLUG_RE = new RegExp(`^${SCHOOL_SLUG_PATTERN}$`);
