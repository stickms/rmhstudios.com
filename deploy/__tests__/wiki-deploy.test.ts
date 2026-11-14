/**
 * The wiki's deploy wiring (docs/wiki.md): the compose service, the MediaWiki
 * image (Dockerfile, env.php, LocalSettings.php, bootstrap, the sign-in
 * extension), the Apache vhost and the DNS record have to agree with each other
 * and with the site, and none of them is exercised by a deploy until someone
 * opts in on the host.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const compose = read('docker-compose.yml');
const deployScript = read('deploy.sh');
const vhost = read('deploy/apache/wiki.rmhstudios.com.conf');
const mainVhost = read('deploy/apache/rmhstudios.conf');
const dockerfile = read('deploy/mediawiki/Dockerfile');
const env = read('deploy/mediawiki/env.php');
const settings = read('deploy/mediawiki/LocalSettings.php');
const bootstrap = read('deploy/mediawiki/bootstrap.sh');
const special = read('deploy/mediawiki/extensions/RMHStudiosLogin/includes/SpecialRMHStudiosLogin.php');
const extension = JSON.parse(read('deploy/mediawiki/extensions/RMHStudiosLogin/extension.json')) as {
  SpecialPages: Record<string, unknown>;
  Hooks: Record<string, string>;
};

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

/** PHP without comments. */
const php = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(#|\/\/).*$/gm, '');

describe('mediawiki compose service', () => {
  // Without comments: the block runs into the next service's header comment.
  const wiki = directives(service('mediawiki'));

  it("sits behind a profile, so the deploy's image pulls and main `up` skip it", () => {
    expect(wiki).toMatch(/profiles:\s*\['wiki'\]/);
  });

  it('is built from deploy/mediawiki on the host, never pulled from a registry', () => {
    expect(wiki).toContain('context: ./deploy/mediawiki');
    expect(wiki).toContain('pull_policy: build');
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

  it("gets the site's own database and auth secret, and nothing else from its env file", () => {
    expect(wiki).toContain('DATABASE_URL: ${DATABASE_URL:-}');
    expect(wiki).toContain('DATABASE_DIRECT_URL: ${DATABASE_DIRECT_URL:-}');
    expect(wiki).toContain('BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:-}');
    expect(wiki).toContain('BETTER_AUTH_URL: ${BETTER_AUTH_URL:-https://rmhstudios.com}');
    expect(wiki).not.toContain('env_file');
    expect(wiki).not.toMatch(/MEDIAWIKI_|WIKIJS_/);
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

  it('leaves no Wiki.js service and no bot-password plumbing behind', () => {
    expect(compose).not.toMatch(/^ {2}wikijs:/m);
    expect(compose).not.toMatch(/requarks|MEDIAWIKI_URL|MEDIAWIKI_BOT/);
  });
});

describe('deploy.sh', () => {
  // The step itself, from its header to the next step's.
  const start = deployScript.indexOf('# ── Step 5b: Wiki');
  const step = deployScript.slice(start, deployScript.indexOf('# ── Step 6: Prune', start));

  it('brings the wiki up after the site has passed its health checks, before pruning', () => {
    expect(start).toBeGreaterThan(deployScript.indexOf('stage health'));
    expect(step.length).toBeGreaterThan(0);
  });

  it('builds it with a fresh base image, then starts it, in production only', () => {
    expect(step).toContain('if [ "$ENVIRONMENT" = "production" ]; then');
    expect(step).toContain('--profile wiki build --pull mediawiki');
    expect(step).toContain('--profile wiki up -d mediawiki');
    expect(step.indexOf('build --pull')).toBeLessThan(step.indexOf('up -d mediawiki'));
  });

  it('never fails, stalls or rolls back the site deploy over the wiki', () => {
    expect(step).toMatch(/timeout \d+ "\$DOCKER_BIN" compose/);
    expect(step).toContain('} 2>/dev/null || log "WARNING: the wiki step failed; the site deploy is unaffected."');
    expect(step).not.toMatch(/\bexit\b|update_deploy_status|rollback_non_web/);
  });

  it('reminds the operator of the one host step it cannot take', () => {
    expect(step).toContain('/etc/apache2/sites-enabled/wiki.rmhstudios.com.conf');
    expect(step).toContain('sudo a2ensite wiki.rmhstudios.com');
  });
});

describe('the image', () => {
  it('ships the configuration, the sign-in extension and the starter pages', () => {
    for (const line of [
      'COPY env.php /usr/local/lib/rmhstudios/env.php',
      'COPY LocalSettings.php /var/www/html/LocalSettings.php',
      'COPY extensions/RMHStudiosLogin /var/www/html/extensions/RMHStudiosLogin',
      'COPY pages /usr/local/share/rmhstudios-wiki/pages',
      'COPY Sidebar.wiki /usr/local/share/rmhstudios-wiki/Sidebar.wiki',
      'COPY bootstrap.sh /usr/local/bin/wiki-bootstrap',
    ]) {
      expect(dockerfile).toContain(line);
    }
  });

  it('brings the database up to date before it serves, and stops if it cannot', () => {
    expect(dockerfile).toContain(
      'CMD ["sh", "-c", "wiki-bootstrap && exec docker-php-entrypoint apache2-foreground"]',
    );
  });

  it('closes the web installer', () => {
    expect(dockerfile).toContain('RedirectMatch 404 ^/mw-config');
  });

  it('starts every starter page and the main page from a file of wikitext', () => {
    const pages = readdirSync(resolve(root, 'deploy/mediawiki/pages'));
    expect(pages).toContain('Main Page.wiki');
    expect(pages.every((name) => name.endsWith('.wiki'))).toBe(true);
    for (const name of pages) {
      const text = read(`deploy/mediawiki/pages/${name}`);
      // Markdown, a leftover template, or tildes MediaWiki would turn into a signature.
      expect(text, name).not.toMatch(/^#{1,6} |\]\(|```|\$\{|~~~/m);
    }
  });

  it('links the sidebar to pages that exist', () => {
    const pages = new Set(
      readdirSync(resolve(root, 'deploy/mediawiki/pages')).map((name) => name.replace(/\.wiki$/, '')),
    );
    const sidebar = read('deploy/mediawiki/Sidebar.wiki');
    for (const [, target] of sidebar.matchAll(/^\*\* ([^|]+)\|/gm)) {
      if (/^https?:|-url$|^mainpage$/.test(target!)) continue;
      expect(pages.has(target!), target).toBe(true);
    }
  });
});

describe('env.php', () => {
  const code = php(env);

  it("reads the site's database, preferring the direct URL PgBouncer cannot pool away", () => {
    expect(code).toContain("getenv( 'DATABASE_DIRECT_URL' ) ?: rmhWikiEnv( 'DATABASE_URL' )");
  });

  it('derives keys from BETTER_AUTH_SECRET, each under its own label', () => {
    expect(code).toContain("hash_hmac( 'sha256', $label, rmhWikiEnv( 'BETTER_AUTH_SECRET' ) )");
    expect(code).toContain("const RMH_WIKI_SECRET_LABEL = 'rmhstudios wiki secret key v1';");
    expect(code).toContain("const RMH_WIKI_LOGIN_LABEL = 'rmhstudios wiki sign-in v1';");
  });
});

describe('LocalSettings.php', () => {
  const code = php(settings);

  it('holds no secret: the database password and the keys come from env.php', () => {
    expect(code).toContain("$wgDBpassword = $rmhDatabase['password'];");
    expect(code).toContain('$wgSecretKey = rmhWikiKey( RMH_WIKI_SECRET_LABEL );');
    expect(code).toContain('$wgRMHStudiosLoginKey = rmhWikiKey( RMH_WIKI_LOGIN_LABEL );');
    expect(code).not.toMatch(/\$wg(DBpassword|SecretKey|UpgradeKey|RMHStudiosLoginKey)\s*=\s*'/);
  });

  it("keeps its tables in their own schema of the site's Postgres database", () => {
    expect(code).toContain("$wgDBtype = 'postgres';");
    expect(code).toContain("$wgDBmwschema = 'mediawiki';");
    expect(code).toContain("$wgDBprefix = '';");
  });

  it('runs the classic Vector skin with Wikipedia URLs and the sign-in extension', () => {
    expect(code).toContain("$wgDefaultSkin = 'vector';");
    expect(code).toContain("$wgArticlePath = '/wiki/$1';");
    expect(code).toContain("wfLoadExtension( 'RMHStudiosLogin' );");
  });

  it('lets everyone read, signed-in members edit, and nobody sign up outside rmhstudios.com', () => {
    expect(code).toContain("$wgGroupPermissions['*']['createaccount'] = false;");
    expect(code).toContain("$wgGroupPermissions['*']['autocreateaccount'] = true;");
    expect(code).toMatch(/foreach \( \[ 'edit', 'createpage', 'createtalk',[^\]]*\] as \$right \) \{\s*\$wgGroupPermissions\['\*'\]\[\$right\] = false;/);
    expect(code).toMatch(/foreach \( \[ 'edit', 'createpage', 'createtalk',[^\]]*\] as \$right \) \{\s*\$wgGroupPermissions\['user'\]\[\$right\] = true;/);
    expect(code).not.toMatch(/\['\*'\]\['read'\]\s*=\s*false/);
  });

  it("holds new accounts to Wikipedia's autoconfirm bar before they can move pages", () => {
    expect(code).toContain('$wgAutoConfirmAge = 4 * 86400;');
    expect(code).toContain('$wgAutoConfirmCount = 10;');
    expect(code).toContain("$wgGroupPermissions['autoconfirmed'][$right] = true;");
  });

  it('keeps no state in the container: no uploads, no mail', () => {
    expect(code).toContain('$wgEnableUploads = false;');
    expect(code).toContain('$wgEnableEmail = false;');
  });
});

describe('signing in', () => {
  it('sends every login and sign-up to the rmhstudios.com sign-in', () => {
    expect(extension.SpecialPages).toHaveProperty('RMHStudiosLogin');
    expect(extension.Hooks).toHaveProperty('SpecialPageBeforeExecute');
    const hooks = read('deploy/mediawiki/extensions/RMHStudiosLogin/includes/Hooks.php');
    expect(hooks).toContain("[ 'Userlogin', 'CreateAccount' ]");
  });

  it('asks the site at the path the site serves, with the state it will check', () => {
    expect(special).toContain("'/api/wiki/sso?' . http_build_query( [ 'state' => $state ] )");
    expect(read('lib/wiki/wiki.contract.ts')).toContain("path: '/api/wiki/sso'");
  });

  it('accepts a pass once, in the session that asked for it', () => {
    expect(special).toContain('$session->remove( self::SESSION_KEY );');
    expect(special).toContain("Pass::verify( $pass, $key, (string)( $pending['state'] ?? '' ), time() )");
  });

  it('makes site admins wiki administrators, and only them', () => {
    expect(special).toContain("private const ADMIN_GROUPS = [ 'sysop', 'interface-admin' ];");
    expect(special).toContain('$this->syncAdminGroups( $user, $claims[\'admin\'] );');
  });

  it('never redirects off the wiki after signing in', () => {
    expect(special).toContain('$title->isExternal()');
  });
});

describe('the startup script', () => {
  const script = bootstrap
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');

  it('never puts a password on a command line, where the host process list shows it', () => {
    expect(script).toContain('--dbpassfile "$tmp/dbpass"');
    expect(script).toContain('--passfile "$tmp/adminpass"');
    expect(script).not.toMatch(/--(dbpass|pass|installdbpass|installdbuser)\s/);
    expect(script).toContain('umask 077');
    expect(script).toMatch(/trap 'rm -rf "\$tmp"'/);
  });

  it('installs and imports the starter pages only into an empty schema', () => {
    expect(script).toMatch(/if \[ "\$\(cat "\$tmp\/installed"\)" = "yes" \]/);
    expect(script).toContain("to_regclass('\\''mediawiki.page'\\'')");
    expect(script).toContain('--dbschema mediawiki');
    const install = script.indexOf('maintenance/run.php install');
    const imports = script.indexOf('importTextFiles');
    const fi = script.indexOf('\nfi\n');
    expect(install).toBeLessThan(imports);
    expect(imports).toBeLessThan(fi);
  });

  it('runs update.php only when MediaWiki or its settings changed, because it signs everyone out', () => {
    // update.php empties the objectcache table, where the sessions live.
    expect(script).toContain('fingerprint="$(cat includes/Defines.php LocalSettings.php | sha256sum | cut -c1-64)"');
    const guard = script.indexOf('if [ "$(cat "$tmp/applied")" = "$fingerprint" ]; then');
    const update = script.indexOf('maintenance/run.php update --quick');
    expect(guard).toBeGreaterThan(0);
    expect(update).toBeGreaterThan(guard);
    expect(script.match(/maintenance\/run\.php update/g)).toHaveLength(1);
    expect(script).toContain('INSERT INTO updatelog (ul_key, ul_value)');
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

  it('documents the only two wiki variables, both optional, and nothing the wiki no longer reads', () => {
    const example = read('.env.example');
    for (const name of ['WIKI_PUBLIC_URL', 'PORT_WIKI']) expect(example, name).toContain(`# ${name}=`);
    expect(example).not.toMatch(/MEDIAWIKI_|WIKIJS_/);
    // Everything env.php reads is a setting the site already has, or one of those.
    for (const [, name] of env.matchAll(/(?:rmhWikiEnv|getenv)\( '(\w+)'/g)) {
      expect(['DATABASE_URL', 'DATABASE_DIRECT_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'WIKI_PUBLIC_URL']).toContain(
        name,
      );
    }
  });
});
