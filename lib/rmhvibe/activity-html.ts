// Discord Activity rewrite for stored vibe HTML. Inside an Activity every
// request must go through https://<application-id>.discordsays.com, so the
// site origin (CSP meta, importmap, RMHVibeAI endpoint) and esm.sh baked into
// the HTML are pointed at the proxy. Client-safe: no node imports.
//
// jsdelivr (legacy pages' CSP) is deliberately left alone: it has no Discord
// URL mapping, so those scripts won't load inside an Activity.

const DISCORD_PROXY_ORIGIN =
  /^https:\/\/\d{6,25}\.discordsays\.com$/;

/** True only for a genuine Discord Activity proxy origin. */
export function isDiscordProxyOrigin(
  origin: string,
): boolean {
  return DISCORD_PROXY_ORIGIN.test(
    origin,
  );
}

function escapeRegExp(
  s: string,
): string {
  return s.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
}

export function adaptVibeHtmlForProxy(
  html: string,
  opts: {
    siteOrigin: string;
    proxyOrigin: string;
    esmPrefix: string;
  },
): string {
  if (
    !isDiscordProxyOrigin(
      opts.proxyOrigin,
    )
  )
    return html;
  const site =
    opts.siteOrigin.replace(
      /\/+$/,
      '',
    );
  let out =
    html;
  if (
    site
  ) {
    // Followed by a delimiter so a longer host sharing the prefix
    // (rmhstudios.community) is not touched.
    out =
      out.replace(
        new RegExp(
          `${escapeRegExp(site)}(?=[/"' ;,>\\s]|$)`,
          'g',
        ),
        () =>
          opts.proxyOrigin,
      );
  }
  // A bare esm.sh host source (CSP) gets a trailing slash: a CSP source with a
  // path and no trailing slash matches only that exact URL, not what is under it.
  return out
    .replace(
      /https:\/\/esm\.sh(?=\/)/g,
      () =>
        opts.proxyOrigin +
        opts.esmPrefix,
    )
    .replace(
      /https:\/\/esm\.sh(?![\w.-])/g,
      () =>
        `${opts.proxyOrigin}${opts.esmPrefix}/`,
    );
}
