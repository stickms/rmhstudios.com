// Wisp v1 packet codec: [type u8][streamId u32 LE][payload].
// Layouts verified against the v86 0.5.473 browser client (wisp_network).
// Pure: no I/O, no imports.

export const WISP = {
  CONNECT: 0x01,
  DATA: 0x02,
  CONTINUE: 0x03,
  CLOSE: 0x04,
} as const;

export const CLOSE_REASON = {
  voluntary: 0x02,
  networkError: 0x03,
  invalid: 0x41,
  unreachable: 0x42,
  timeout: 0x43,
  refused: 0x44,
  blocked: 0x48,
  throttled: 0x49,
} as const;

export type WispPacket =
  | {
      type: 'connect';
      streamId: number;
      streamType: 'tcp' | 'udp';
      port: number;
      host: string;
    }
  | {
      type: 'data';
      streamId: number;
      payload: Uint8Array;
    }
  | {
      type: 'continue';
      streamId: number;
      bufferRemaining: number;
    }
  | {
      type: 'close';
      streamId: number;
      reason: number;
    };

const decoder = new TextDecoder('utf-8', {
  fatal: true,
});

/** Returns null for a malformed packet (truncated, unknown type, bad host bytes). */
export function decodePacket(buf: Uint8Array): WispPacket | null {
  if (buf.length < 5) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const streamId = view.getUint32(1, true);
  switch (buf[0]) {
    case WISP.CONNECT: {
      if (buf.length < 8) return null;
      const t = buf[5];
      if (t !== 1 && t !== 2) return null;
      let host: string;
      try {
        host = decoder.decode(buf.subarray(8));
      } catch {
        return null;
      }
      return {
        type: 'connect',
        streamId,
        streamType: t === 1 ? 'tcp' : 'udp',
        port: view.getUint16(6, true),
        host,
      };
    }
    case WISP.DATA:
      // Copy: the incoming frame buffer may be reused by the caller.
      return {
        type: 'data',
        streamId,
        payload: buf.slice(5),
      };
    case WISP.CONTINUE:
      if (buf.length < 9) return null;
      return {
        type: 'continue',
        streamId,
        bufferRemaining: view.getUint32(5, true),
      };
    case WISP.CLOSE:
      if (buf.length < 6) return null;
      return {
        type: 'close',
        streamId,
        reason: buf[5],
      };
    default:
      return null;
  }
}

function header(type: number, streamId: number, payloadLength: number): Uint8Array {
  const out = new Uint8Array(5 + payloadLength);
  out[0] = type;
  new DataView(out.buffer).setUint32(1, streamId >>> 0, true);
  return out;
}

export function encodeData(streamId: number, payload: Uint8Array): Uint8Array {
  const out = header(WISP.DATA, streamId, payload.length);
  out.set(payload, 5);
  return out;
}

export function encodeContinue(streamId: number, bufferRemaining: number): Uint8Array {
  const out = header(WISP.CONTINUE, streamId, 4);
  new DataView(out.buffer).setUint32(5, bufferRemaining >>> 0, true);
  return out;
}

export function encodeClose(streamId: number, reason: number): Uint8Array {
  const out = header(WISP.CLOSE, streamId, 1);
  out[5] = reason & 0xff;
  return out;
}
