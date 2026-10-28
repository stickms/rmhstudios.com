import { describe, expect, it } from 'vitest';
import { useEditor } from '../store';

/** Multi-selection and the batch commit blocks rely on. */
describe('editor selection', () => {
  it('select() replaces the selection; toggleSelect adds and removes', () => {
    const s = useEditor.getState();
    s.select('a');
    expect([...useEditor.getState().selectedIds]).toEqual(['a']);
    s.toggleSelect('b');
    expect([...useEditor.getState().selectedIds].sort()).toEqual(['a', 'b']);
    expect(useEditor.getState().selectedId).toBe('b');
    s.toggleSelect('b');
    expect([...useEditor.getState().selectedIds]).toEqual(['a']);
    expect(useEditor.getState().selectedId).toBe('a');
    s.select(null);
    expect(useEditor.getState().selectedIds.size).toBe(0);
  });

  it('selectMany keeps the last as the inspected panel and de-duplicates', () => {
    useEditor.getState().selectMany(['x', 'y', 'x']);
    expect([...useEditor.getState().selectedIds]).toEqual(['x', 'y']);
    expect(useEditor.getState().selectedId).toBe('y');
  });
});

describe('applyBatch', () => {
  it('commits several files as one history step, coalescing a drag', () => {
    const s = useEditor.getState();
    s.newProject();
    const before = useEditor.getState().past.length;
    s.applyBatch('Move panels', { 'resource/ui/a.res': '"A" {}', 'resource/ui/b.res': '"B" {}' });
    expect(useEditor.getState().past.length).toBe(before + 1);
    expect(useEditor.getState().readText('resource/ui/a.res')).toBe('"A" {}');
    expect(useEditor.getState().readText('resource/ui/b.res')).toBe('"B" {}');
    s.applyBatch('Move panels', { 'resource/ui/a.res': '"A1" {}' }, 'drag:group');
    s.applyBatch('Move panels', { 'resource/ui/a.res': '"A2" {}' }, 'drag:group');
    expect(useEditor.getState().past.length).toBe(before + 2);
    s.undo();
    expect(useEditor.getState().readText('resource/ui/a.res')).toBe('"A" {}');
  });
});

describe('assistant requests', () => {
  it('numbers each request so asking the same thing twice still opens it, and clears when taken', () => {
    const s = useEditor.getState();
    s.clearAssistantRequest();
    s.askAssistant({ prompt: 'a' });
    const first = useEditor.getState().assistantRequest!;
    expect(first).toMatchObject({ prompt: 'a', nonce: expect.any(Number) });
    s.askAssistant({ prompt: 'a' });
    expect(useEditor.getState().assistantRequest!.nonce).toBe(first.nonce + 1);
    s.clearAssistantRequest();
    expect(useEditor.getState().assistantRequest).toBeNull();
  });
});
