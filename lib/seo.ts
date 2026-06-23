export const SITE_URL = 'https://rmhstudios.com';

interface SeoConfig {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: string;
}

/**
 * Build a full meta array with OG + Twitter Card tags for use in route head().
 */
export function buildMeta({ title, description, path, image, type = 'website' }: SeoConfig) {
  const url = `${SITE_URL}${path}`;
  const ogImage = image ? (image.startsWith('http') ? image : `${SITE_URL}${image}`) : `${SITE_URL}/images/og/default.png`;

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: type },
    { property: 'og:url', content: url },
    { property: 'og:image', content: ogImage },
    { property: 'og:site_name', content: 'RMH Studios' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: ogImage },
  ];
}

/**
 * Build a canonical link for use in route head().
 */
export function buildCanonical(path: string) {
  return { rel: 'canonical', href: `${SITE_URL}${path}` };
}
