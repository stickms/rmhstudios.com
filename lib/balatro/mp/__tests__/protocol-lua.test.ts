/**
 * protocol.lua is generated from bridge-protocol.ts (scripts/balatro/gen-lua-protocol.ts)
 * and must never drift from it. Regenerate with `pnpm balatro:gen-protocol`.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_LUA_PATH,
  PROTOCOL_TS_PATH,
  generateProtocolLua,
  generateProtocolTs,
} from '../../../../scripts/balatro/gen-lua-protocol';

describe('rmh_mp/protocol.lua', () => {
  it('is up to date with bridge-protocol.ts', () => {
    const onDisk = readFileSync(PROTOCOL_LUA_PATH, 'utf8');
    expect(
      onDisk === generateProtocolLua(),
      'protocol.lua is stale — run `pnpm balatro:gen-protocol`',
    ).toBe(true);
  });

  it('is deterministic', () => {
    expect(generateProtocolLua()).toBe(generateProtocolLua());
  });

  it('bridge-schema.gen.ts (the browser codec\'s copy) is up to date too', () => {
    const onDisk = readFileSync(PROTOCOL_TS_PATH, 'utf8');
    expect(
      onDisk === generateProtocolTs(),
      'bridge-schema.gen.ts is stale — run `pnpm balatro:gen-protocol`',
    ).toBe(true);
    expect(generateProtocolTs()).toBe(generateProtocolTs());
  });
});
