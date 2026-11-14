# MediaWiki for wiki.rmhstudios.com (docs/wiki.md).
#
# The official image plus the three things it lacks for this site:
#   - PHP's `pgsql` extension: the wiki keeps everything in its own database on
#     the host Postgres, and the stock image ships the MySQL driver only;
#   - Wikipedia's short URLs (/wiki/Page_title) in Apache;
#   - this site's LocalSettings.php and the first-run setup script.
#
# LocalSettings.php holds no secret: it reads the database password and the
# secret key from the environment, so the image is safe to build anywhere.
# Built on the VPS by `docker compose --profile wiki up -d --build mediawiki`;
# it is not part of the CI image build, because the wiki is opt-in.
#
# Pinned to the 1.43 long-term-support line. Moving to the next LTS is a
# deliberate change here, followed by the bootstrap script (it runs update.php).
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
RUN printf '%s\n' \
      'ServerName localhost' \
      'Alias /wiki /var/www/html/index.php' \
      '# The installer and the upgrader are run from the shell (bootstrap.sh), never the web.' \
      'RedirectMatch 404 ^/mw-config(/|$)' \
      > /etc/apache2/conf-available/mediawiki.conf \
 && a2enconf mediawiki

COPY LocalSettings.php /var/www/html/LocalSettings.php
COPY bootstrap.sh /usr/local/bin/wiki-bootstrap
RUN chmod 0644 /var/www/html/LocalSettings.php && chmod 0755 /usr/local/bin/wiki-bootstrap
