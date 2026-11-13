/**
 * The wiki's deploy wiring (docs/wiki.md): the compose service, the Apache
 * vhost and the DNS record have to agree with each other and with the site,
 * and none of them is exercised by a deploy until someone opts in on the host.
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

describe('wikijs compose service', () => {
  // Without comments: the block runs into the next service's header comment.
  const wiki = directives(service('wikijs'));

  it('is opt-in, so a deploy cannot crash-loop on a stack without the wiki database', () => {
    expect(wiki).toMatch(/profiles:\s*\['wiki'\]/);
  });

  it('runs Wiki.js 2 pinned to a minor line, never a floating or 3.x tag', () => {
    expect(wiki).toMatch(/image: ghcr\.io\/requarks\/wiki:2\.\d+\s*$/m);
  });

  it('publishes its port on loopback only: Apache is the one way in', () => {
    const ports = wiki.match(/^\s+- '[^']*:3000'$/gm) ?? [];
    expect(ports).toHaveLength(1);
    expect(ports[0]).toContain("'127.0.0.1:${PORT_WIKI:-7010}:3000'");
  });

  it('uses its own database and takes the password from the environment', () => {
    expect(wiki).toContain('DB_TYPE: postgres');
    expect(wiki).toContain('DB_NAME: ${WIKIJS_DB_NAME:-wikijs}');
    expect(wiki).toContain('DB_PASS: ${WIKIJS_DB_PASS:-}');
    // Not the site's database or credentials.
    expect(wiki).not.toContain('DATABASE_URL');
    expect(wiki).not.toContain('env_file');
  });

  it('is bounded and restarts on its own', () => {
    expect(wiki).toMatch(/mem_limit:\s*\d+m/);
    expect(wiki).toContain('restart: unless-stopped');
    expect(wiki).toContain('healthcheck:');
  });

  it('is reachable from web by compose DNS on its container port', () => {
    expect(service('web')).toContain('WIKIJS_URL=${WIKIJS_URL:-http://wikijs:3000}');
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
    expect(port).toBe(/PORT_WIKI:-(\d+)/.exec(service('wikijs'))?.[1]);
    expect(conf).toContain('ProxyPass        / http://localhost:${WIKI_UPSTREAM_PORT}/');
    expect(conf).toContain('ProxyPassReverse / http://localhost:${WIKI_UPSTREAM_PORT}/');
    expect(conf).toContain('ProxyPreserveHost On');
  });

  it('tells Wiki.js the visitor is on HTTPS, and upgrades its websocket', () => {
    expect(conf).toContain('RequestHeader set X-Forwarded-Proto "https"');
    expect(conf).toMatch(/ProxyPass\s+\/graphql-subscriptions .* upgrade=websocket/);
    // The specific path has to come before the catch-all, or it never matches.
    expect(conf.indexOf('/graphql-subscriptions')).toBeLessThan(conf.indexOf('ProxyPass        / '));
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
    for (const name of [
      'WIKIJS_API_KEY',
      'WIKIJS_URL',
      'WIKI_PUBLIC_URL',
      'WIKIJS_LOCALE',
      'WIKIJS_DB_HOST',
      'WIKIJS_DB_PORT',
      'WIKIJS_DB_USER',
      'WIKIJS_DB_PASS',
      'WIKIJS_DB_NAME',
      'PORT_WIKI',
    ]) {
      expect(example, name).toContain(`# ${name}=`);
    }
  });
});
