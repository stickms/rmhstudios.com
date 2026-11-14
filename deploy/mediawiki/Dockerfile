# MediaWiki for wiki.rmhstudios.com (docs/wiki.md).
#
# The official image plus what this site needs:
#   - PHP's `pgsql` extension: the wiki lives in the site's Postgres database
#     (schema `mediawiki`), and the stock image ships the MySQL driver only;
#   - Wikipedia's short URLs (/wiki/Page_title) in Apache;
#   - a small Apache: a handful of workers, so the wiki holds at most that many
#     database connections (scripts/db-connection-budget.mjs counts them);
#   - this site's LocalSettings.php, the RMHStudiosLogin extension (sign in with
#     rmhstudios.com), the starter pages, and the startup script.
#
# No secret is baked in: the database URL and the auth secret come from the
# environment at run time, so the image is safe to build anywhere. Built on the
# VPS by `docker compose --profile wiki up -d --build mediawiki`; it is not part
# of the CI image build, because the wiki is opt-in.
#
# Pinned to the 1.43 long-term-support line. Moving to the next LTS is a
# deliberate change here; the startup script runs update.php on the new version.
FROM mediawiki:1.43

RUN set -eux; \
    savedAptMark="$(apt-mark showmanual)"; \
    apt-get update; \
    apt-get install -y --no-install-recommends libpq-dev; \
    docker-php-ext-install -j "$(nproc)" pgsql; \
    # Keep the client library, drop the headers and the build tools.
    apt-mark auto '.*' > /dev/null; \
    apt-mark manual $savedAptMark; \
    ldd "$(php -r 'echo ini_get("extension_dir");')"/pgsql.so \
      | awk '/=>/ { so = $(NF-1); if (index(so, "/usr/local/") == 1) next; gsub("^/(usr/)?", "", so); print so }' \
      | sort -u | xargs -r dpkg-query --search | cut -d: -f1 | sort -u | xargs -rt apt-mark manual; \
    apt-get purge -y --auto-remove -o APT::AutoRemove::RecommendsImportant=false; \
    rm -rf /var/lib/apt/lists/*; \
    php -m | grep -qx pgsql

# /wiki/Page_title is index.php with the title as path info ($wgArticlePath).
# Eight workers at most: each one is at most one database connection.
RUN printf '%s\n' \
      'ServerName localhost' \
      'Alias /wiki /var/www/html/index.php' \
      '# The installer and the upgrader are run from the shell (bootstrap.sh), never the web.' \
      'RedirectMatch 404 ^/mw-config(/|$)' \
      > /etc/apache2/conf-available/mediawiki.conf \
 && a2enconf mediawiki \
 && printf '%s\n' \
      '<IfModule mpm_prefork_module>' \
      '    StartServers 2' \
      '    MinSpareServers 2' \
      '    MaxSpareServers 4' \
      '    MaxRequestWorkers 8' \
      '    MaxConnectionsPerChild 1000' \
      '</IfModule>' \
      > /etc/apache2/mods-available/mpm_prefork.conf

COPY env.php /usr/local/lib/rmhstudios/env.php
COPY LocalSettings.php /var/www/html/LocalSettings.php
COPY extensions/RMHStudiosLogin /var/www/html/extensions/RMHStudiosLogin
COPY pages /usr/local/share/rmhstudios-wiki/pages
COPY Sidebar.wiki /usr/local/share/rmhstudios-wiki/Sidebar.wiki
COPY bootstrap.sh /usr/local/bin/wiki-bootstrap
RUN chmod -R a+rX /usr/local/lib/rmhstudios /usr/local/share/rmhstudios-wiki \
      /var/www/html/LocalSettings.php /var/www/html/extensions/RMHStudiosLogin \
 && chmod 0755 /usr/local/bin/wiki-bootstrap

# Bring the database up to date, then serve. A failed bootstrap stops the
# container rather than serving a wiki that cannot reach its tables.
CMD ["sh", "-c", "wiki-bootstrap && exec docker-php-entrypoint apache2-foreground"]
