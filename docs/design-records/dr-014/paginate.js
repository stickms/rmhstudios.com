/* ══════════════════════════════════════════════════════════════════════════
   A small block-flow paginator.

   The document is authored as one long stream of sections; this splits that
   stream into real, fixed-height .page boxes so the printed folios, running
   heads and table-of-contents page numbers are measured facts rather than
   estimates. Chromium then prints one .page per sheet.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  const SPLITTABLE = new Set(['P', 'PRE', 'UL', 'OL', 'DL', 'TABLE', 'BLOCKQUOTE']);
  const HEADINGS = new Set(['H1', 'H2', 'H3', 'H4']);
  const KEEP_NEXT = new Set(['H1', 'H2', 'H3', 'H4', 'DIV']); // DIV: .lst-title
  const MIN_TAIL = 46; // px of usable space a heading needs to stay put

  const state = { entries: [], pageNo: 0 };

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function makePage(opts) {
    const page = el('div', 'page' + (opts.plain ? ' page--plain' : ''));
    const head = el('div', 'page__head');
    head.appendChild(el('span', 'l', opts.headL || ''));
    head.appendChild(el('span', 'r', opts.headR || ''));
    const bodyEl = el('div', 'page__body');
    const foot = el('div', 'page__foot');
    page.appendChild(head);
    page.appendChild(bodyEl);
    page.appendChild(foot);
    if (opts.numbered) {
      state.pageNo += 1;
      const n = state.pageNo;
      const folio = el('span', 'folio', String(n));
      const mark = el('span', 'mk', opts.footL || '');
      if (n % 2 === 0) {
        foot.appendChild(folio);
        foot.appendChild(mark);
      } else {
        foot.appendChild(mark);
        foot.appendChild(folio);
      }
      page.dataset.folio = String(n);
    }
    return { page, body: bodyEl, head };
  }

  const fits = (body) => body.scrollHeight <= body.clientHeight + 0.5;

  /* Split a text-bearing block so the largest word-prefix that fits stays
     behind and the rest is returned as a fresh block. */
  function splitText(node, body) {
    const words = node.innerHTML.split(/(\s+)/);
    if (words.length < 5) return null;
    let lo = 0;
    let hi = words.length;
    const original = node.innerHTML;
    while (lo < hi - 1) {
      const mid = Math.floor((lo + hi) / 2);
      node.innerHTML = words.slice(0, mid).join('');
      if (fits(body)) lo = mid;
      else hi = mid;
    }
    if (lo <= 1) {
      node.innerHTML = original;
      return null;
    }
    node.innerHTML = words.slice(0, lo).join('');
    if (!fits(body)) {
      node.innerHTML = original;
      return null;
    }
    const rest = node.cloneNode(false);
    rest.innerHTML = words.slice(lo).join('').replace(/^\s+/, '');
    rest.classList.add('cont');
    return rest.textContent.trim() ? rest : null;
  }

  /* Split by child elements (list items, table rows, pre lines). */
  function splitChildren(node, body, kids, rebuild) {
    let keep = kids.length;
    while (keep > 0) {
      rebuild(node, kids.slice(0, keep));
      if (fits(body)) break;
      keep -= 1;
    }
    if (keep <= 0) {
      rebuild(node, kids);
      return null;
    }
    if (keep === kids.length) return null;
    const rest = node.cloneNode(false);
    rest.classList.add('cont');
    rebuild(rest, kids.slice(keep));
    return rest;
  }

  function splitPre(node, body) {
    const lines = node.innerHTML.split('\n');
    if (lines.length < 4) return null;
    let keep = lines.length;
    const original = node.innerHTML;
    while (keep > 1) {
      node.innerHTML = lines.slice(0, keep).join('\n');
      if (fits(body)) break;
      keep -= 1;
    }
    if (keep <= 1) {
      node.innerHTML = original;
      return null;
    }
    if (keep === lines.length) return null;
    node.innerHTML = lines.slice(0, keep).join('\n');
    const rest = node.cloneNode(false);
    rest.className = node.className + ' cont';
    rest.innerHTML = lines.slice(keep).join('\n');
    return rest;
  }

  function splitTable(node, body) {
    const thead = node.querySelector('thead');
    const tbody = node.querySelector('tbody');
    if (!tbody) return null;
    const rows = Array.from(tbody.rows);
    if (rows.length < 3) return null;
    let keep = rows.length;
    while (keep > 1) {
      while (tbody.rows.length > keep) tbody.deleteRow(tbody.rows.length - 1);
      if (fits(body)) break;
      keep -= 1;
    }
    if (keep <= 1 || keep >= rows.length) {
      // restore
      rows.forEach((r) => tbody.appendChild(r));
      return null;
    }
    const rest = node.cloneNode(false);
    rest.className = node.className;
    const cap = node.querySelector('caption');
    if (cap) {
      const c = cap.cloneNode(true);
      c.innerHTML = c.innerHTML + ' <span style="font-weight:400;letter-spacing:0">(cont.)</span>';
      rest.appendChild(c);
    }
    if (thead) rest.appendChild(thead.cloneNode(true));
    const nb = document.createElement('tbody');
    rows.slice(keep).forEach((r) => nb.appendChild(r));
    rest.appendChild(nb);
    return rest;
  }

  function trySplit(node, body) {
    const tag = node.tagName;
    if (!SPLITTABLE.has(tag)) return null;
    if (node.classList.contains('nosplit')) return null;
    if (tag === 'P' || tag === 'BLOCKQUOTE') return splitText(node, body);
    if (tag === 'PRE') return splitPre(node, body);
    if (tag === 'TABLE') return splitTable(node, body);
    if (tag === 'UL' || tag === 'OL') {
      const kids = Array.from(node.children);
      if (kids.length < 2) return null;
      return splitChildren(node, body, kids, (host, set) => {
        while (host.firstChild) host.removeChild(host.firstChild);
        set.forEach((k) => host.appendChild(k));
      });
    }
    if (tag === 'DL') {
      const kids = Array.from(node.children);
      if (kids.length < 4) return null;
      return splitChildren(node, body, kids, (host, set) => {
        while (host.firstChild) host.removeChild(host.firstChild);
        set.forEach((k) => host.appendChild(k));
      });
    }
    return null;
  }

  /**
   * Flow a stream of sections into pages.
   * @param {HTMLElement} stream  container whose children are <section>s
   * @param {object} opts { numbered, book }
   */
  function flow(stream, opts) {
    const book = opts.book;
    const sections = Array.from(stream.children);

    for (const section of sections) {
      const headL = section.dataset.headL || '';
      const headR = section.dataset.headR || '';
      const footL = section.dataset.footL || '';
      const plain = section.classList.contains('plain-page');
      const full = section.classList.contains('full-page');

      let cur = makePage({ numbered: opts.numbered, headL, headR, footL, plain });
      book.appendChild(cur.page);

      if (full) {
        while (section.firstChild) cur.body.appendChild(section.firstChild);
        cur.body.querySelectorAll('[data-level]').forEach((n) => {
          state.entries.push({
            level: n.dataset.level,
            text: (n.dataset.tocText || n.textContent).trim(),
            no: n.dataset.no || '',
            page: cur.page.dataset.folio ? Number(cur.page.dataset.folio) : null,
          });
        });
        continue;
      }

      const queue = Array.from(section.children);
      while (queue.length) {
        const node = queue.shift();
        cur.body.appendChild(node);

        if (HEADINGS.has(node.tagName) || node.classList.contains('lst-title')) {
          if (node.dataset.toc !== 'skip') {
            state.entries.push({
              level: node.dataset.level || node.tagName.toLowerCase(),
              text: (node.dataset.tocText || node.textContent).trim(),
              no: node.dataset.no || '',
              page: cur.page.dataset.folio ? Number(cur.page.dataset.folio) : null,
            });
          }
        }

        if (fits(cur.body)) continue;

        // Overflow. Try to split; otherwise move the whole block onward.
        const rest = trySplit(node, cur.body);
        if (rest) {
          queue.unshift(rest);
          const next = makePage({ numbered: opts.numbered, headL, headR, footL, plain });
          book.appendChild(next.page);
          cur = next;
          continue;
        }

        cur.body.removeChild(node);
        // The block never fitted here; if the page is empty it will never fit,
        // so leave it and accept the overflow rather than loop forever.
        if (!cur.body.firstChild) {
          cur.body.appendChild(node);
          continue;
        }
        // Pull a trailing heading along with the block it introduces.
        const trail = [];
        let last = cur.body.lastElementChild;
        while (
          last &&
          (KEEP_NEXT.has(last.tagName) || last.classList.contains('lst-title')) &&
          (HEADINGS.has(last.tagName) || last.classList.contains('lst-title'))
        ) {
          trail.unshift(last);
          cur.body.removeChild(last);
          last = cur.body.lastElementChild;
        }
        const next = makePage({ numbered: opts.numbered, headL, headR, footL, plain });
        book.appendChild(next.page);
        // Re-point the recorded page for any heading we just moved.
        for (const h of trail) {
          const txt = (h.dataset.tocText || h.textContent).trim();
          for (let i = state.entries.length - 1; i >= 0; i--) {
            if (state.entries[i].text === txt) {
              state.entries[i].page = next.page.dataset.folio
                ? Number(next.page.dataset.folio)
                : null;
              break;
            }
          }
          next.body.appendChild(h);
        }
        next.body.appendChild(node);
        cur = next;
        if (!fits(cur.body)) {
          const r2 = trySplit(node, cur.body);
          if (r2) queue.unshift(r2);
        }
      }

      // Widow control: a heading stranded at the very bottom of a page.
      const lastKid = cur.body.lastElementChild;
      if (
        lastKid &&
        (HEADINGS.has(lastKid.tagName) || lastKid.classList.contains('lst-title')) &&
        cur.body.clientHeight - lastKid.offsetTop - lastKid.offsetHeight < MIN_TAIL
      ) {
        cur.body.removeChild(lastKid);
        const next = makePage({ numbered: opts.numbered, headL, headR, footL, plain });
        book.appendChild(next.page);
        next.body.appendChild(lastKid);
        const txt = (lastKid.dataset.tocText || lastKid.textContent).trim();
        for (let i = state.entries.length - 1; i >= 0; i--) {
          if (state.entries[i].text === txt) {
            state.entries[i].page = next.page.dataset.folio
              ? Number(next.page.dataset.folio)
              : null;
            break;
          }
        }
      }
    }
  }

  window.RMHBook = {
    run() {
      const book = document.getElementById('book');
      const front = document.getElementById('front');
      const bodyStream = document.getElementById('flow');
      const tocStream = document.getElementById('toc-stream');

      // Pages must be measured while attached to the document, so every flow
      // target is a live host that is relocated into #book afterwards.
      const host = (id) => {
        const h = document.createElement('div');
        h.id = id;
        document.body.appendChild(h);
        return h;
      };

      // 1. body, numbered from 1 — its folios do not depend on front matter.
      const bodyHost = host('h-body');
      flow(bodyStream, { numbered: true, book: bodyHost });
      const bodyPages = Array.from(bodyHost.children);
      const total = state.pageNo;

      // 2. build the contents from measured entries.
      const toc = document.createElement('div');
      toc.appendChild(buildToc(state.entries));
      const tocHost = host('h-toc');
      flow(toc, { numbered: false, book: tocHost });

      // 3. assemble: cover + colophon + contents + body.
      const frontHost = host('h-front');
      Array.from(front.children).forEach((sec) => {
        const one = document.createElement('div');
        one.appendChild(sec);
        flow(one, { numbered: false, book: frontHost });
      });
      Array.from(frontHost.children).forEach((p) => book.appendChild(p));
      Array.from(tocHost.children).forEach((p) => book.appendChild(p));
      bodyPages.forEach((p) => book.appendChild(p));
      [bodyHost, tocHost, frontHost].forEach((h) => h.remove());

      front.remove();
      bodyStream.remove();
      if (tocStream) tocStream.remove();

      document.title = 'Redesigning the Home Button — RMH Studios';
      window.__RMH_STATS__ = {
        bodyPages: total,
        totalPages: book.children.length,
        entries: state.entries.length,
      };
      return window.__RMH_STATS__;
    },
  };

  function buildToc(entries) {
    const sec = document.createElement('section');
    sec.dataset.headL = 'Redesigning the Home Button';
    sec.dataset.headR = 'Contents';
    const h = el('div', 'toc-h', 'Contents');
    h.dataset.toc = 'skip';
    sec.appendChild(h);
    for (const e of entries) {
      if (e.level === 'part') {
        const row = el('div', 'toc-row toc-row--part');
        row.innerHTML =
          `<span class="t">${e.text}</span><span class="d"></span><span class="pg">${e.page ?? ''}</span>`;
        sec.appendChild(row);
      } else if (e.level === 'h1') {
        const row = el('div', 'toc-row');
        row.innerHTML =
          `<span class="n">${e.no}</span><span class="t">${e.text}</span><span class="d"></span><span class="pg">${e.page ?? ''}</span>`;
        sec.appendChild(row);
      } else if (e.level === 'h2') {
        const row = el('div', 'toc-row toc-row--sub');
        row.innerHTML =
          `<span class="t">${e.text}</span><span class="d"></span><span class="pg">${e.page ?? ''}</span>`;
        sec.appendChild(row);
      }
    }
    return sec;
  }
})();
