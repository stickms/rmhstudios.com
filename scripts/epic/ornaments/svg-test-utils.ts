type Tag = { name: string; selfClosing: boolean; closing: boolean };

/** Yield element tags in document order, skipping comments and declarations. */
function* tags(svg: string): Generator<Tag> {
  const n = svg.length;
  let i = 0;
  while (i < n) {
    const lt = svg.indexOf('<', i);
    if (lt === -1) break;
    if (svg.startsWith('<!--', lt)) {
      const end = svg.indexOf('-->', lt + 4);
      if (end === -1) throw new Error('unterminated comment');
      i = end + 3;
      continue;
    }
    if (svg[lt + 1] === '?' || svg[lt + 1] === '!') {
      const end = svg.indexOf('>', lt);
      if (end === -1) throw new Error('unterminated declaration');
      i = end + 1;
      continue;
    }
    // scan to the matching '>', ignoring '>' inside quoted attribute values
    let j = lt + 1;
    let quote = '';
    for (; j < n; j++) {
      const c = svg[j];
      if (quote) { if (c === quote) quote = ''; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
    }
    if (j >= n) throw new Error('unterminated tag');
    const inner = svg.slice(lt + 1, j).trim();
    i = j + 1;
    const closing = inner.startsWith('/');
    const selfClosing = inner.endsWith('/');
    const name = inner.replace(/^\//, '').replace(/\/$/, '').trim().split(/[\s/]/)[0];
    if (!name) throw new Error('empty tag name');
    yield { name, selfClosing: selfClosing && !closing, closing };
  }
}

export function assertValidSvg(svg: string): void {
  const stack: string[] = [];
  let root = '';
  let sawElement = false;
  for (const t of tags(svg)) {
    if (t.closing) {
      const top = stack.pop();
      if (top !== t.name) throw new Error(`mismatched </${t.name}> (expected </${top ?? 'nothing'}>)`);
    } else {
      sawElement = true;
      if (stack.length === 0 && !root) root = t.name;
      if (!t.selfClosing) stack.push(t.name);
    }
  }
  if (!sawElement) throw new Error('no elements found');
  if (stack.length) throw new Error(`unclosed tags: ${stack.join(', ')}`);
  if (root !== 'svg') throw new Error(`expected <svg> root, got <${root}>`);
}
