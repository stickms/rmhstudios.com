/**
 * The frame loader (docs/csp.md, "Frames that run user code"): the `/vibe-frame` response,
 * the Nitro header plugin leaving its policy alone, and both ends of the postMessage
 * protocol. The browser behaviour (policy inheritance, import maps, opaque origin) is
 * proven in a real Chromium by testing/e2e/vibe-frame-csp.mjs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import securityHeadersPlugin from '@/server/nitro/security-headers';
import { buildFramePolicy } from '@/lib/csp/policy.server';
import { frameLoaderHeaders, frameLoaderResponse } from '@/lib/rmhvibe/frame-response.server';
import { FRAME_LOADER_HTML, FRAME_LOADER_SCRIPT, FRAME_TAG, FRAME_URL } from '@/lib/rmhvibe/frame-protocol';
import { parseBridgeMessage } from '@/lib/rmhvibe/bridge';
import { attachFrameDocument } from '@/lib/rmhvibe/frame-loader';

describe('GET /vibe-frame response', () => {
  it('carries its own policy and the hardening headers', async () => {
    const res = frameLoaderResponse();
    expect(res.headers.get('Content-Security-Policy')).toBe(buildFramePolicy());
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(await res.text()).toBe(FRAME_LOADER_HTML);
    expect(FRAME_URL).toBe('/vibe-frame');
    expect(Object.keys(frameLoaderHeaders())).not.toContain('Content-Security-Policy-Report-Only');
  });

  it('has exactly one inline classic script (a module script would forbid the page import map)', () => {
    const scripts = [...FRAME_LOADER_HTML.matchAll(/<script\b([^>]*)>/g)];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]![1]).not.toMatch(/type\s*=/);
  });
});

describe('Nitro security-headers plugin on the frame response', () => {
  function run(initial: Record<string, string>) {
    const headers = new Headers(initial);
    let handler: ((res: unknown, event: unknown) => void) | null = null;
    securityHeadersPlugin({ hooks: { hook: (n, fn) => void (n === 'response' && (handler = fn)) } });
    handler!({ headers }, { req: { url: 'https://rmhstudios.com/x', headers: new Headers() } });
    return headers;
  }

  it('adds neither the site report-only policy, the reporting endpoint nor a second policy', () => {
    const h = run({
      ...frameLoaderHeaders(),
      // what mintRequestCspNonce sets inside Start's request scope
      'Content-Security-Policy-Report-Only': "default-src 'self'; script-src 'nonce-abc'",
      'Reporting-Endpoints': 'csp="/api/csp-report"',
    });
    expect(h.get('Content-Security-Policy')).toBe(buildFramePolicy());
    expect(h.has('Content-Security-Policy-Report-Only')).toBe(false);
    expect(h.has('Reporting-Endpoints')).toBe(false);
  });

  it('still decorates an ordinary page', () => {
    const h = run({ 'content-type': 'text/html' });
    expect(h.get('Content-Security-Policy')).toContain('frame-ancestors');
    expect(h.get('Content-Security-Policy')).not.toContain('sandbox');
    expect(h.has('Content-Security-Policy-Report-Only')).toBe(true);
  });
});

/** Run the loader's script against fake globals. */
function runLoader(parentIsSelf = false) {
  const posted: unknown[] = [];
  const parent = { postMessage: (m: unknown) => posted.push(m) };
  const listeners = new Map<string, ((e: unknown) => void)[]>();
  const doc = {
    calls: [] as string[],
    open() {
      this.calls.push('open');
      listeners.clear(); // document.open() erases the window's listeners
    },
    write(h: string) {
      this.calls.push(`write:${h}`);
    },
    close() {
      this.calls.push('close');
    },
  };
  const win: Record<string, unknown> = {
    addEventListener: (t: string, fn: (e: unknown) => void) => listeners.set(t, [...(listeners.get(t) ?? []), fn]),
    parent,
  };
  if (parentIsSelf) win.parent = win;
  new Function('window', 'document', FRAME_LOADER_SCRIPT)(win, doc);
  const send = (source: unknown, data: unknown) => (listeners.get('message') ?? []).forEach((fn) => fn({ source, data }));
  return { posted, doc, parent, win, send, listeners };
}

describe('loader script', () => {
  it('announces itself once and writes only the first document from its parent', () => {
    const l = runLoader();
    expect(l.posted).toEqual([{ [FRAME_TAG]: 'ready' }]);
    l.send({}, { [FRAME_TAG]: 'html', html: 'FROM-A-STRANGER' });
    l.send(l.parent, { id: 1, rmhvibe: 1 });
    l.send(l.parent, { [FRAME_TAG]: 'html', html: 42 });
    expect(l.doc.calls).toEqual([]);
    l.send(l.parent, { [FRAME_TAG]: 'html', html: '<p>hi</p>' });
    expect(l.doc.calls).toEqual(['open', 'write:<p>hi</p>', 'close']);
    // the message listener is gone after open(): a second document cannot be written
    l.send(l.parent, { [FRAME_TAG]: 'html', html: '<p>again</p>' });
    expect(l.doc.calls).toHaveLength(3);
  });

  it('reports `loaded` from the written document, registered after open()', () => {
    const l = runLoader();
    l.send(l.parent, { [FRAME_TAG]: 'html', html: 'x' });
    expect(l.posted).toHaveLength(1);
    (l.listeners.get('load') ?? []).forEach((fn) => fn({}));
    expect(l.posted[1]).toEqual({ [FRAME_TAG]: 'loaded' });
  });

  it('does nothing at the top level', () => {
    const l = runLoader(true);
    expect(l.posted).toEqual([]);
    expect(l.listeners.size).toBe(0);
  });
});

describe('bridge isolation', () => {
  it('the bridge ignores loader messages (both come from the same contentWindow)', () => {
    for (const kind of ['ready', 'loaded', 'html'])
      expect(parseBridgeMessage({ [FRAME_TAG]: kind, html: 'x' })).toBeNull();
  });
});

describe('host helper', () => {
  afterEach(() => vi.unstubAllGlobals());

  function setup() {
    const listeners: ((e: unknown) => void)[] = [];
    vi.stubGlobal('window', {
      addEventListener: (_: string, fn: (e: unknown) => void) => listeners.push(fn),
      removeEventListener: (_: string, fn: (e: unknown) => void) => listeners.splice(listeners.indexOf(fn), 1),
    });
    const post = vi.fn();
    const contentWindow = { postMessage: post };
    const frame = { contentWindow } as unknown as HTMLIFrameElement;
    const emit = (source: unknown, data: unknown) => [...listeners].forEach((fn) => fn({ source, data }));
    return { listeners, post, contentWindow, frame, emit };
  }

  it('posts the document once, to the registered frame only, and reports loaded after that', () => {
    const t = setup();
    const onLoaded = vi.fn();
    const detach = attachFrameDocument(t.frame, () => '<p>doc</p>', onLoaded);
    t.emit({}, { [FRAME_TAG]: 'ready' }); // another window
    expect(t.post).not.toHaveBeenCalled();
    t.emit(t.contentWindow, { [FRAME_TAG]: 'loaded' }); // loaded before html was sent: ignored
    expect(onLoaded).not.toHaveBeenCalled();
    t.emit(t.contentWindow, { rmhvibe: 1, id: 3 }); // a bridge message is not ours
    expect(t.post).not.toHaveBeenCalled();
    t.emit(t.contentWindow, { [FRAME_TAG]: 'ready' });
    t.emit(t.contentWindow, { [FRAME_TAG]: 'ready' });
    expect(t.post).toHaveBeenCalledTimes(1);
    expect(t.post).toHaveBeenCalledWith({ [FRAME_TAG]: 'html', html: '<p>doc</p>' }, '*');
    t.emit(t.contentWindow, { [FRAME_TAG]: 'loaded' });
    expect(onLoaded).toHaveBeenCalledTimes(1);
    detach();
    expect(t.listeners).toHaveLength(0);
    t.emit(t.contentWindow, { [FRAME_TAG]: 'ready' });
    expect(t.post).toHaveBeenCalledTimes(1);
  });
});
