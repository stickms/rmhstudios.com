import type { Link } from '../protocol';

/** An in-memory byte link with manual delivery, so tests control exactly when and what arrives. */
export class TestLink implements Link {
  open = true;
  onmessage:
    | ((
        data: Uint8Array,
      ) => void)
    | null =
    null;
  onclose:
    | (() => void)
    | null =
    null;
  other!: TestLink;
  inbox: Uint8Array[] =
    [];
  /** Return false to drop a message in transit. */
  filter:
    | ((
        data: Uint8Array,
      ) => boolean)
    | null =
    null;

  send(
    data: Uint8Array,
  ): void {
    if (
      !this
        .open
    )
      return;
    if (
      this
        .filter &&
      !this.filter(
        data,
      )
    )
      return;
    this.other.inbox.push(
      data.slice(),
    );
  }

  /** Deliver everything waiting; returns how many messages arrived. */
  flush(): number {
    let n = 0;
    while (
      this
        .inbox
        .length >
      0
    ) {
      const m =
        this.inbox.shift()!;
      this.onmessage?.(
        m,
      );
      n++;
    }
    return n;
  }

  close(): void {
    if (
      !this
        .open
    )
      return;
    this.open = false;
    this.other.open = false;
    this.onclose?.();
    this.other.onclose?.();
  }
}

export function linkPair(): [
  TestLink,
  TestLink,
] {
  const a =
    new TestLink();
  const b =
    new TestLink();
  a.other =
    b;
  b.other =
    a;
  return [
    a,
    b,
  ];
}

/** Deliver until quiet (a delivery can cause more sends). */
export function settle(
  links: TestLink[],
): void {
  for (
    let i = 0;
    i <
    50;
    i++
  ) {
    let moved = 0;
    for (const l of links)
      moved +=
        l.flush();
    if (
      moved ===
      0
    )
      return;
  }
  throw new Error(
    'network never settled',
  );
}
