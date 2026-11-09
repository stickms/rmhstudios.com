/** A tiny fake DOM for the refraction services: only what they touch, with the bookkeeping the tests assert on. */
export class FakeNode {
  nodeType = 1;
  parentNode: FakeNode | null = null;
  children: FakeNode[] = [];
  attrs = new Map<string, string>();
  style: Record<string, string> & {
    setProperty(k: string, v: string): void;
    removeProperty(k: string): void;
  };
  dataset: Record<string, string> = {};
  constructor(public tagName: string) {
    const store: Record<string, string> = {};
    this.style = Object.assign(store, {
      setProperty(k: string, v: string) {
        store[k] = v;
      },
      removeProperty(k: string) {
        delete store[k];
      },
    });
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  hasAttribute(k: string) {
    return this.attrs.has(k);
  }
  appendChild(n: FakeNode) {
    n.parentNode?.removeChild(n);
    n.parentNode = this;
    this.children.push(n);
    return n;
  }
  prepend(n: FakeNode) {
    n.parentNode?.removeChild(n);
    n.parentNode = this;
    this.children.unshift(n);
  }
  removeChild(n: FakeNode) {
    this.children = this.children.filter((c) => c !== n);
    n.parentNode = null;
    return n;
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
  descendants(): FakeNode[] {
    return this.children.flatMap((c) => [c, ...c.descendants()]);
  }
}

export class FakeDoc {
  body = new FakeNode('body');
  documentElement = new FakeNode('html');
  createElementNS(_ns: string, tag: string) {
    return new FakeNode(tag);
  }
  createElement(tag: string) {
    return new FakeNode(tag);
  }
}
