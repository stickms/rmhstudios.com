import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Chapter, Passage } from './manuscript/types';
import { renderPassageZh, renderPassageEn } from './render/typeset';
import type { LeafPair } from './render/types';

const __dir = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(__dir, 'render/epic.css'), 'utf8');

// numerals for Chinese page labels
const ZH_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
function toZhNum(n: number): string {
  if (n <= 10) return ZH_DIGITS[n];
  if (n < 20) return '十' + (n % 10 === 0 ? '' : ZH_DIGITS[n % 10]);
  const t = Math.floor(n / 10), o = n % 10;
  return ZH_DIGITS[t] + '十' + (o === 0 ? '' : ZH_DIGITS[o]);
}

/** Measure whether a textbox of given side fits its 800×1100 leaf without overflow. */
async function fits(page: Page, side: 'verso' | 'recto', innerHtml: string): Promise<boolean> {
  return page.evaluate(
    ([sideArg, html, css]) => {
      const host = document.getElementById('measure')!;
      host.className = `leaf ${sideArg}`;
      host.innerHTML = `<div class="textbox" id="tb">${html}</div>`;
      const tb = document.getElementById('tb')!;
      // overflow if content exceeds the textbox in the writing direction
      const overX = tb.scrollWidth > tb.clientWidth + 1;
      const overY = tb.scrollHeight > tb.clientHeight + 1;
      return !(overX || overY);
    },
    [side, innerHtml, CSS] as const,
  );
}

export async function paginate(chapters: Chapter[], _opts?: { numberByJuan?: boolean }): Promise<LeafPair[]> {
  const browser: Browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 1100 } });
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}
     #measure{position:absolute;left:0;top:0}</style></head>
     <body><section id="measure" class="leaf verso"></section></body></html>`,
  );

  const leaves: LeafPair[] = [];
  let pageNo = 0;

  try {
    for (const ch of chapters) {
      const juan = `卷${toZhNum(ch.n)}`;
      // every chapter opens a fresh leaf; first passage is the heading then the couplet
      const queue: Passage[] = [
        { type: 'heading', zh: ch.title.zh, en: ch.title.en },
        ch.couplet,
        ...ch.passages,
      ];

      let i = 0;
      while (i < queue.length) {
        let versoHtml = '';
        let rectoHtml = '';
        let placed = 0;

        // greedily add passages while BOTH sides still fit
        while (i + placed < queue.length) {
          const p = queue[i + placed];
          const nextVerso = versoHtml + renderPassageZh(p);
          const nextRecto = rectoHtml + renderPassageEn(p);
          const okZh = await fits(page, 'verso', nextVerso);
          const okEn = await fits(page, 'recto', nextRecto);
          if (okZh && okEn) {
            versoHtml = nextVerso;
            rectoHtml = nextRecto;
            placed++;
          } else {
            break;
          }
        }

        // guarantee progress: if nothing fit, force-place one passage (oversize passage)
        if (placed === 0) {
          versoHtml = renderPassageZh(queue[i]);
          rectoHtml = renderPassageEn(queue[i]);
          placed = 1;
        }

        pageNo++;
        leaves.push({
          versoHtml,
          rectoHtml,
          juan,
          pageZh: toZhNum(pageNo),
          pageEn: String(pageNo),
        });
        i += placed;
      }
    }
  } finally {
    await browser.close();
  }
  return leaves;
}
