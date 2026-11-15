// The relay hub dials the internet for strangers. These assertions keep it in its
// sandbox: a change that widens its network, privileges or secrets fails here.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const repo = join(__dirname, '..', '..', '..');
const compose = parse(readFileSync(join(repo, 'docker-compose.yml'), 'utf8'), {
  merge: true,
}) as {
  services: Record<string, Record<string, unknown>>;
  networks: Record<
    string,
    {
      ipam?: {
        config?: {
          subnet?: string;
        }[];
      };
    }
  >;
};
const firewall = readFileSync(join(repo, 'deploy/rmhos-net/egress-firewall.sh'), 'utf8');
const hub = compose.services['rmhos-net'] as Record<string, unknown>;

const SUBNET = '172.31.86.0/24';
const BLOCKED_V4 = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '100.64.0.0/10',
  '0.0.0.0/8',
  '224.0.0.0/4',
  '240.0.0.0/4',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
];

function envKeys(env: unknown): string[] {
  if (Array.isArray(env)) return env.map((e) => String(e).split('=')[0] as string);
  return Object.keys((env ?? {}) as object);
}

describe('rmhos-net compose service', () => {
  it('exists', () => {
    expect(hub).toBeDefined();
  });

  it('joins only the rmhos-egress network, and nothing else joins it', () => {
    expect(hub.networks).toEqual(['rmhos-egress']);
    for (const [name, svc] of Object.entries(compose.services)) {
      if (name === 'rmhos-net') continue;
      const nets = svc.networks;
      const joined = Array.isArray(nets) ? nets : Object.keys((nets ?? {}) as object);
      expect(joined, `${name} must not join rmhos-egress`).not.toContain('rmhos-egress');
    }
  });

  it('has no IPv6 on the egress network, whatever the daemon default is', () => {
    expect(
      (compose.networks['rmhos-egress'] as { enable_ipv6?: boolean }).enable_ipv6,
    ).toBe(false);
  });

  it('logs to journald under the rmhos-net tag, so the abuse record outlives the container', () => {
    expect(hub.logging).toEqual({ driver: 'journald', options: { tag: 'rmhos-net' } });
  });

  it('pins the network subnet to the one the firewall matches', () => {
    expect(compose.networks['rmhos-egress']?.ipam?.config?.[0]?.subnet).toBe(SUBNET);
  });

  it('is read-only, capability-free and unprivileged', () => {
    expect(hub.read_only).toBe(true);
    expect(hub.cap_drop).toEqual(['ALL']);
    expect(hub.security_opt).toContain('no-new-privileges:true');
    const user = String(hub.user ?? '');
    expect(user).not.toBe('');
    expect(user.split(':')[0]).not.toMatch(/^(0|root)$/);
    expect(hub.privileged).toBeUndefined();
  });

  it('pins its resource limits and never restarts on its own', () => {
    expect(hub.user).toBe('65534:65534');
    expect(hub.pids_limit).toBe(256);
    expect(hub.mem_limit).toBe('256m');
    expect(hub.cpus).toBe(0.5);
    expect(hub.tmpfs).toEqual(['/tmp']);
    // After a reboot the hub must not return before the firewall is re-proven.
    expect(hub.restart).toBe('no');
  });

  it('sits behind the rmhos-net profile so the fleet up never starts it or creates its network', () => {
    expect(hub.profiles).toEqual(['rmhos-net']);
  });

  it('gets no env file and no site secrets', () => {
    expect(hub.env_file).toBeUndefined();
    const keys = envKeys(hub.environment);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(k).toMatch(/^RMHOS_NET_/);
      expect(k).not.toMatch(/DATABASE|REDIS|BETTER_AUTH|S3_|R2_|STRIPE|DISCORD|OPENAI|ANTHROPIC/);
    }
  });

  it('mounts only the read-only deny-list directory and has no route back to the host', () => {
    // The one exception: the optional deny-list directory, read-only.
    expect(hub.volumes).toEqual(['./deploy/rmhos-net/deny:/deny:ro']);
    expect(hub.extra_hosts).toBeUndefined();
    expect(hub.network_mode).toBeUndefined();
  });

  it('publishes on loopback only', () => {
    expect(hub.ports).toEqual(['127.0.0.1:${PORT_RMHOS_NET:-7009}:7009']);
  });
});

describe('egress firewall script', () => {
  it('matches the compose subnet and drops every private range', () => {
    expect(firewall).toContain(SUBNET);
    for (const cidr of BLOCKED_V4) expect(firewall, cidr).toContain(cidr);
  });

  it('is idempotent and fails loudly', () => {
    expect(firewall).toContain('set -euo pipefail');
    expect(firewall).toContain('RMHOS-EGRESS');
    expect(firewall).toContain('DOCKER-USER');
    expect(firewall).toMatch(/-C DOCKER-USER/); // the jump is only inserted when absent
    expect(firewall).toContain('ESTABLISHED,RELATED');
  });
});
