// The firewall installer and the recovery script, run against stand-ins for iptables and docker.
// What the stand-ins cannot prove (that real packets are refused) is proven by the real run recorded in
// docs/rmhos.md "Verifying the firewall"; here the rule TEXT and the control flow are pinned.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
const bash = (dir: string, name: string, body: string) => {
  writeFileSync(join(dir, name), `#!/bin/bash\n${body}\n`);
  chmodSync(join(dir, name), 0o755);
};

// ── egress-firewall.sh ────────────────────────────────────────────────────────────────────────────
function firewall(env: Record<string, string> = {}, opts: { forward?: boolean; socket?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rmhos-fw-'));
  dirs.push(dir);
  bash(dir, 'id', 'echo 0');
  // iptables: records -I jumps and answers -C from them; -S shows what the last restore wrote.
  bash(
    dir,
    'iptables',
    `args=("$@"); out=()
for a in "\${args[@]}"; do [ "$a" = -w ] || out+=("$a"); done
set -- "\${out[@]}"
echo "$*" >> "$STATE/calls"
case "$1" in
  -n) exit 0 ;;
esac
case " $* " in
  *' -C '*) shift_args=("$@"); key=$(echo "\${shift_args[*]}" | sed -E 's/(^| )-C / /; s/^ //'); grep -qxF -- "$key" "$STATE/jumps" ;;
  *' -I '*) key="$*"; key="\${key/-I /}"; key=$(echo "$key" | sed -E 's/ [0-9]+ / /'); echo "$key" >> "$STATE/jumps" ;;
  *' -S FORWARD'*) [ "\${MOCK_FORWARD:-1}" = 1 ] && echo '-A FORWARD -j DOCKER-USER' || echo '-P FORWARD ACCEPT' ;;
  *' -S RMHOS-EGRESS'*) grep '^-A RMHOS-EGRESS' "$STATE/restore" | sed 's/-p tcp --dport/-p tcp -m tcp --dport/' ;;
  *' -L DOCKER-USER'*) exit 0 ;;
esac`,
  );
  bash(dir, 'iptables-restore', 'cat >> "$STATE/restore"');
  const state = join(dir, 'state');
  mkdirSync(state);
  writeFileSync(join(state, 'jumps'), '');
  writeFileSync(join(state, 'restore'), '');
  const script = resolve('deploy/rmhos-net/egress-firewall.sh');
  // /var/run/docker.sock is the real path; the script tests it with -S, so pretend via a shim dir only
  // when asked (the check is on the real filesystem, so the "Docker running" case is skipped here).
  void opts.socket;
  const result = spawnSync('bash', [script], {
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      STATE: state,
      MOCK_FORWARD: opts.forward === false ? '0' : '1',
      ...env,
    },
    encoding: 'utf8',
  });
  const read = (f: string) => (existsSync(join(state, f)) ? readFileSync(join(state, f), 'utf8') : '');
  return { result, restore: read('restore'), calls: read('calls'), jumps: read('jumps') };
}

describe('egress-firewall.sh', () => {
  it('writes the positive sentinel before the drop of its own /24, and the drops after it', () => {
    const { result, restore } = firewall();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const lines = restore.split('\n');
    const sentinel = lines.findIndex((l) =>
      l.includes('-A RMHOS-EGRESS -d 192.0.2.1/32 -p tcp --dport 9 -j REJECT --reject-with tcp-reset'),
    );
    const dropNet = lines.findIndex((l) => l.includes('-A RMHOS-EGRESS -d 192.0.2.0/24 -j DROP'));
    const established = lines.findIndex((l) => l.includes('ESTABLISHED,RELATED'));
    expect(sentinel).toBeGreaterThan(established);
    expect(dropNet).toBeGreaterThan(sentinel);
    expect(result.stdout).toContain('FORWARD reaches DOCKER-USER');
  });

  it('fails loudly when FORWARD does not reach DOCKER-USER and Docker is running', () => {
    if (!existsSync('/var/run/docker.sock')) return; // the fatal branch needs a Docker socket on this host
    const { result } = firewall({}, { forward: false });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('FORWARD does not jump to DOCKER-USER');
  });

  it('only warns about a missing FORWARD jump while Docker is not running (boot order)', () => {
    if (existsSync('/var/run/docker.sock')) return;
    const { result } = firewall({}, { forward: false });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('WARNING: FORWARD has no DOCKER-USER jump yet');
  });

  it('adds no source NAT unless RMHOS_EGRESS_SNAT_TO is set', () => {
    const { result, calls } = firewall();
    expect(result.status).toBe(0);
    expect(calls).not.toContain('SNAT');
    expect(result.stdout).toContain("leaves from the host's own address");
  });

  it('inserts one SNAT rule for the subnet before Docker masquerade when RMHOS_EGRESS_SNAT_TO is set, once', () => {
    const { result, calls, jumps } = firewall({ RMHOS_EGRESS_SNAT_TO: '203.0.113.50' });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(calls).toContain(
      '-t nat -I POSTROUTING 1 -s 172.31.86.0/24 ! -d 172.31.86.0/24 -j SNAT --to-source 203.0.113.50',
    );
    expect(jumps).toContain('-t nat POSTROUTING -s 172.31.86.0/24 ! -d 172.31.86.0/24 -j SNAT --to-source 203.0.113.50');
  });

  it('refuses a malformed SNAT address', () => {
    const { result } = firewall({ RMHOS_EGRESS_SNAT_TO: 'not-an-ip' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('RMHOS_EGRESS_SNAT_TO must be an IPv4 address');
  });
});

// ── recover.sh ─────────────────────────────────────────────────────────────────────────────────────
function recover(
  o: { probe: 'ok' | 'fail'; healthy: boolean; secret?: string; label?: string },
) {
  const dir = mkdtempSync(join(tmpdir(), 'rmhos-recover-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'deploy/rmhos-net'), { recursive: true });
  mkdirSync(join(dir, 'bin'));
  const script = readFileSync(resolve('deploy/rmhos-net/recover.sh'), 'utf8');
  writeFileSync(join(dir, 'deploy/rmhos-net/recover.sh'), script);
  bash(
    join(dir, 'deploy/rmhos-net'),
    'probe-firewall.sh',
    `echo probed >> "$MOCK_ROOT/calls"; [ "$MOCK_PROBE" = ok ]`,
  );
  bash(join(dir, 'bin'), 'curl', '[ "$MOCK_HEALTHY" = 1 ]');
  bash(
    join(dir, 'bin'),
    'docker',
    `echo "$*" >> "$MOCK_ROOT/calls"
case "$*" in
  *' ps -aq rmhos-net'*) echo hubcid ;;
  inspect*) echo "$MOCK_LABEL" ;;
esac
exit 0`,
  );
  writeFileSync(
    join(dir, '.env.production'),
    `RMHOS_NET_TICKET_SECRET=${o.secret ?? 'a'.repeat(40)}\n`,
  );
  const result = spawnSync('bash', [join(dir, 'deploy/rmhos-net/recover.sh')], {
    env: {
      ...process.env,
      PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
      DOCKER_BIN: join(dir, 'bin/docker'),
      MOCK_ROOT: dir,
      MOCK_PROBE: o.probe,
      MOCK_HEALTHY: o.healthy ? '1' : '0',
      MOCK_LABEL: o.label ?? '',
    },
    encoding: 'utf8',
  });
  const calls = existsSync(join(dir, 'calls')) ? readFileSync(join(dir, 'calls'), 'utf8') : '';
  return { result, calls };
}

describe('recover.sh', () => {
  it('stops a RUNNING hub when the firewall proof fails, and exits non-zero', () => {
    const { result, calls } = recover({ probe: 'fail', healthy: true });
    expect(result.status).toBe(1);
    expect(calls).toContain('stop rmhos-net');
    expect(calls).not.toContain('up -d');
    expect(result.stdout).toContain('stopping the hub');
  });

  it('keeps a stopped hub stopped when the proof fails', () => {
    const { result, calls } = recover({ probe: 'fail', healthy: false });
    expect(result.status).toBe(1);
    expect(calls).not.toContain('up -d');
    expect(result.stdout).toContain('the hub stays down');
  });

  it('always runs the probe, and leaves a healthy proven hub alone (no up, no stop)', () => {
    const { result, calls } = recover({ probe: 'ok', healthy: true });
    expect(result.status).toBe(0);
    expect(calls).toContain('probed');
    expect(calls).not.toContain('up -d');
    expect(calls).not.toContain('stop rmhos-net');
  });

  it('starts a down hub behind a proven firewall, keeping the fingerprint label it already had', () => {
    const { result, calls } = recover({ probe: 'ok', healthy: false, label: 'abc123' });
    expect(result.status, result.stdout).toBe(0);
    expect(calls).toContain('--profile rmhos-net up -d --no-build rmhos-net');
    expect(calls).toContain('rmhos.hub-fingerprint');
  });

  it.each(['', '"short"', 'x'.repeat(31)])('does nothing for the secret %j', (secret) => {
    const { result, calls } = recover({ probe: 'ok', healthy: false, secret });
    expect(result.status).toBe(0);
    expect(calls).toBe('');
  });
});
