import { describe, expect, it } from 'vitest';
import { classifyMedia } from '../blog-media';

const ID = 'dQw4w9WgXcQ';

describe('classifyMedia', () => {
  it('treats plain images as images', () => {
    expect(classifyMedia('https://cdn.example.com/a.png')).toEqual({ kind: 'image' });
    expect(classifyMedia('/uploads/a.jpg')).toEqual({ kind: 'image' });
  });

  it('detects video files, ignoring query and hash', () => {
    for (const ext of ['mp4', 'webm', 'mov', 'MP4']) {
      expect(classifyMedia(`/blog/clip.${ext}`)).toEqual({ kind: 'video', src: `/blog/clip.${ext}` });
    }
    expect(classifyMedia('https://x.test/v.webm?t=1#frag').kind).toBe('video');
    expect(classifyMedia('https://x.test/v.png?file=a.mp4').kind).toBe('image');
  });

  it('detects YouTube URL shapes', () => {
    const urls = [
      `https://www.youtube.com/watch?v=${ID}&t=5`,
      `https://youtube.com/watch?v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}?si=abc`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
    ];
    for (const u of urls) expect(classifyMedia(u)).toEqual({ kind: 'youtube', videoId: ID });
  });

  it('falls back to image for bad YouTube ids', () => {
    expect(classifyMedia('https://youtu.be/short')).toEqual({ kind: 'image' });
    expect(classifyMedia('https://www.youtube.com/watch?v=')).toEqual({ kind: 'image' });
    expect(classifyMedia(`https://www.youtube.com/watch?v=${ID}x`)).toEqual({ kind: 'image' });
    expect(classifyMedia('https://www.youtube.com/channel/abc')).toEqual({ kind: 'image' });
  });

  it('rejects look-alike hosts', () => {
    expect(classifyMedia(`https://youtube.com.evil.test/watch?v=${ID}`)).toEqual({ kind: 'image' });
    expect(classifyMedia(`https://notyoutube.com/watch?v=${ID}`)).toEqual({ kind: 'image' });
    expect(classifyMedia(`https://evil.test/youtu.be/${ID}`)).toEqual({ kind: 'image' });
  });

  it('never throws on garbage', () => {
    for (const s of ['', '   ', 'http://', '://', 'javascript:alert(1)', 'data:video/mp4;base64,AAA', '\u0000', 'https://[bad']) {
      expect(() => classifyMedia(s)).not.toThrow();
      expect(classifyMedia(s).kind).toBe('image');
    }
    expect(() => classifyMedia(undefined as unknown as string)).not.toThrow();
  });
});
