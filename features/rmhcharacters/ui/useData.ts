import { useEffect, useState } from 'react';
import { loadDnd5e, loadPf2e } from '@features/rmhcharacters/engine/data';
import type { Dnd5eData, Pf2eData } from '@features/rmhcharacters/engine/types';

/** The rules data for a system, fetched on first use (`null` while it loads). */
export function useDnd5eData(): Dnd5eData | null {
  const [data, setData] = useState<Dnd5eData | null>(null);
  useEffect(() => {
    let live = true;
    void loadDnd5e().then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, []);
  return data;
}

export function usePf2eData(): Pf2eData | null {
  const [data, setData] = useState<Pf2eData | null>(null);
  useEffect(() => {
    let live = true;
    void loadPf2e().then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, []);
  return data;
}

/** Save a text file through a temporary object URL. */
export function downloadText(filename: string, mime: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
