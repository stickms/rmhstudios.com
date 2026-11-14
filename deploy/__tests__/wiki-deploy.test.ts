/**
 * The wiki's deploy wiring (docs/wiki.md): the compose service, the MediaWiki
 * image (Dockerfile, LocalSettings.php, bootstrap), the Apache vhost and the
 * DNS record have to agree with each other and with the site, and none of them
 * is exercised by a deploy until someone opts in on the host.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const compose = read('docker-compose.yml');
const vhost = read('deploy/apache/wiki.rmhstudios.com.conf');
const mainVhost = read('deploy/apache/rmhstudios.conf');

// One service's block: from "  name:" to the next two-space-indented key.
function service(name: string) {
  const start = compose.search(new RegExp(`^  ${name}:\\s*$`, 'm'));
  if (start < 0) throw new Error(`No ${name} service in docker-compose.yml`);
  const rest = compose.slice(start + 1);
  const next = rest.search(/^ {2}[a-z][\w-]*:\s*$/m);
  return next < 0 ? rest : rest.slice(0, next);
}

/** Directives only: comments describe things the config must not do. */
const directives = (conf: string) =>
  conf
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');

const settings = read('deploy/mediawiki/LocalSettings.php');
const dockerfile = read('deploy/mediawiki/Dockerfile');
const bootstrap = read('deploy/mediawiki/bootstrap.sh');

describe('mediawiki compose service', () => {
  // Without comments: the block runs into the next service's header comment.
  const wiki = directives(service('mediawiki'));

  it('is opt-in, so a deploy cannot crash-loop on a stack without the wiki database', () => {
    expect(wiki).toMatch(/profiles:\s*\['wiki'\]/);
  });

  it('is built from deploy/mediawiki on the host, never pulled from a registry', () => {
    expect(wiki).toContain('context: ./deploy/mediawiki');
    expect(wiki).toContain('pull_policy: build');
    expect(wiki).toMatch(/image: rmhstudios-mediawiki:1\.\d+\s*$/m);
  });

  it('builds on a pinned MediaWiki LTS line, never a floating tag, with the Postgres driver', () => {
    const from = /^FROM (\S+)/m.exec(dockerfile)?.[1];
    expect(from).toMatch(/^mediawiki:1\.\d+$/);
    // The compose tag names the same line the Dockerfile pins.
    expect(wiki).toContain(`image: rmhstudios-${from!}`);
    expect(dockerfile).toContain('docker-php-ext-install -j "$(nproc)" pgsql');
  });

  it('publishes its port on loopback only: Apache is the one way in', () => {
    const ports = wiki.match(/^\s+- '[^']*:80'$/gm) ?? [];
    expect(ports).toHaveLength(1);
    expect(ports[0]).toContain("'127.0.0.1:${PORT_WIKI:-7010}:80'");
  });

  it('uses its own database and takes its secrets from the environment', () => {
    expect(wiki).toContain('MEDIAWIKI_DB_NAME: ${MEDIAWIKI_DB_NAME:-mediawiki}');
    expect(wiki).toContain('MEDIAWIKI_DB_PASS: ${MEDIAWIKI_DB_PASS:-}');
    expect(wiki).toContain('MEDIAWIKI_SECRET_KEY: ${MEDIAWIKI_SECRET_KEY:-}');
    // Not the site's database or credentials.
    expect(wiki).not.toContain('DATABASE_URL');
    expect(wiki).not.toContain('env_file');
  });

  it('drops every capability but the three Apache needs to bind :80 and become www-data', () => {
    expect(wiki).toMatch(/cap_drop:\s*- ALL/);
    const added = /cap_add:\s*((?:\s*- \w+)+)/.exec(wiki)?.[1]?.match(/\w+/g);
    expect(added?.sort()).toEqual(['NET_BIND_SERVICE', 'SETGID', 'SETUID']);
    expect(wiki).toContain('no-new-privileges:true');
  });

  it('is bounded and restarts on its own', () => {
    expect(wiki).toMatch(/mem_limit:\s*\d+m/);
    expect(wiki).toContain('restart: unless-stopped');
    expect(wiki).toContain('healthcheck:');
  });

  it('is reachable from web by compose DNS on its container port', () => {
    expect(service('web')).toContain('MEDIAWIKI_URL=${MEDIAWIKI_URL:-http://mediawiki}');
  });

  it('leaves no Wiki.js service behind', () => {
    expect(compose).not.toMatch(/^ {2}wikijs:/m);
    expect(compose).not.toContain('requarks');
  });
});

describe('LocalSettings.php', () => {
  const php = settings.replace(/^\s*(#|\/\/|\*).*$/gm, '');

  it('holds no secret: the database password and the secret key are read from the environment', () => {
    expect(php).toContain("$wgDBpassword = rmhWikiEnv( 'MEDIAWIKI_DB_PASS' );");
    expect(php).toContain("$wgSecretKey = rmhWikiEnv( 'MEDIAWIKI_SECRET_KEY' );");
    expect(php).not.toMatch(/\$wg(DBpassword|SecretKey|UpgradeKey)\s*=\s*'/);
  });

  it('runs on Postgres and the classic Vector skin', () => {
    expect(php).toContain("$wgDBtype = 'postgres';");
    expect(php).toContain("$wgDefaultSkin = 'vector';");
    expect(php).toContain("$wgArticlePath = '/wiki/$1';");
  });

  it('lets everyone read and nobody but sysops write', () => {
    expect(php).toContain("$wgGroupPermissions['*']['createaccount'] = false;");
    expect(php).toMatch(/foreach \( \[ '\*', 'user', 'autoconfirmed' \] as \$group \)/);
    for (const right of ['edit', 'createpage', 'move', 'upload']) expect(php).toContain(`'${right}'`);
    expect(php).toContain("$wgGroupPermissions['sysop'][$right] = true;");
    expect(php).not.toMatch(/\['\*'\]\['read'\]\s*=\s*false/);
  });

  it('keeps no state in the container: no uploads, no mail', () => {
    expect(php).toContain('$wgEnableUploads = false;');
    expect(php).toContain('$wgEnableEmail = false;');
  });

  it('is what the image ships, and the web installer is closed', () => {
    expect(dockerfile).toContain('COPY LocalSettings.php /var/www/html/LocalSettings.php');
    expect(dockerfile).toContain('RedirectMatch 404 ^/mw-config');
  });
});

describe('wiki-bootstrap', () => {
  const script = bootstrap
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');

  it('is baked into the image', () => {
    expect(dockerfile).toContain('COPY bootstrap.sh /usr/local/bin/wiki-bootstrap');
  });

  it('never puts a password on a command line, where the host process list shows it', () => {
    expect(script).toContain('--dbpassfile "$tmp/dbpass"');
    expect(script).toContain('--passfile "$tmp/adminpass"');
    expect(script).not.toMatch(/--(dbpass|pass|installdbpass|installdbuser)\s/);
    expect(script).toContain('umask 077');
    expect(script).toMatch(/trap 'rm -rf "\$tmp"'/);
  });

  it('installs only into an empty database, and always runs update.php', () => {
    expect(script).toMatch(/if \[ "\$installed" = "yes" \]/);
    expect(script).toContain('php maintenance/run.php update --quick');
  });

  it('issues a bot password with only the grants the admin page uses, revoking the old one', () => {
    expect(script).toContain('grants="basic,highvolume,editpage,editprotected,createeditmovepage,delete,editinterface"');
    expect(script).toMatch(/DELETE FROM bot_passwords WHERE bp_app_id/);
    expect(script).toContain('echo "MEDIAWIKI_BOT_USER=$admin@$app_id"');
  });
});

describe('wiki.rmhstudios.com vhost', () => {
  const conf = directives(vhost);

  it('serves the subdomain and nothing else', () => {
    expect(conf.match(/^\s*ServerName\s+(\S+)/m)?.[1]).toBe('wiki.rmhstudios.com');
    expect(conf).not.toMatch(/ServerAlias/);
  });

  it('proxies to the port compose publishes', () => {
    const port = /Define WIKI_UPSTREAM_PORT (\d+)/.exec(conf)?.[1];
    expect(port).toBe(/PORT_WIKI:-(\d+)/.exec(service('mediawiki'))?.[1]);
    expect(conf).toContain('ProxyPass        / http://localhost:${WIKI_UPSTREAM_PORT}/');
    expect(conf).toContain('ProxyPassReverse / http://localhost:${WIKI_UPSTREAM_PORT}/');
    expect(conf).toContain('ProxyPreserveHost On');
  });

  it('tells MediaWiki the visitor is on HTTPS', () => {
    expect(conf).toContain('RequestHeader set X-Forwarded-Proto "https"');
  });

  it('is its own site: it proxies to the wiki only, never to the main app', () => {
    const upstreams = [...conf.matchAll(/ProxyPass(?:Reverse)?\s+\S+\s+(\S+)/g)].map((m) => m[1]);
    expect(upstreams.length).toBeGreaterThan(0);
    for (const upstream of upstreams) expect(upstream).toContain('${WIKI_UPSTREAM_PORT}');
    expect(conf).not.toMatch(/WEB_UPSTREAM|700[15]|7015/);
  });

  it('sends the baseline security headers', () => {
    for (const header of [
      'X-Content-Type-Options "nosniff"',
      'X-Frame-Options "SAMEORIGIN"',
      'Strict-Transport-Security',
      'Referrer-Policy',
    ]) {
      expect(conf).toContain(header);
    }
  });

  it('is not shadowed by the main vhost', () => {
    const main = directives(mainVhost);
    expect(main).not.toMatch(/ServerAlias[^\n]*(\*|wiki)/);
  });
});

describe('DNS and environment', () => {
  it('has a proxied record for the wiki host', () => {
    const dns = read('deploy/terraform/dns.tf');
    const record = dns.slice(dns.indexOf('resource "cloudflare_record" "wiki"'));
    expect(record).toContain('name    = var.wiki_host');
    // The vhost is :80 only; Cloudflare must terminate TLS.
    expect(record).toMatch(/proxied = true/);
    expect(read('deploy/terraform/variables.tf')).toContain('default     = "wiki.rmhstudios.com"');
  });

  it('documents every variable the wiki reads', () => {
    const example = read('.env.example');
    const names = [
      'MEDIAWIKI_BOT_USER',
      'MEDIAWIKI_BOT_PASSWORD',
      'MEDIAWIKI_URL',
      'WIKI_PUBLIC_URL',
      'MEDIAWIKI_SECRET_KEY',
      'MEDIAWIKI_SERVER',
      'MEDIAWIKI_DB_HOST',
      'MEDIAWIKI_DB_PORT',
      'MEDIAWIKI_DB_USER',
      'MEDIAWIKI_DB_PASS',
      'MEDIAWIKI_DB_NAME',
      'PORT_WIKI',
    ];
    for (const name of names) expect(example, name).toContain(`# ${name}=`);
    // Every variable the container and LocalSettings.php read is one of them.
    for (const [, name] of settings.matchAll(/rmhWikiEnv\( '(\w+)'/g)) expect(names).toContain(name);
    expect(example).not.toContain('WIKIJS_');
  });
});
