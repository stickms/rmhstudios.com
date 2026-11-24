#!/usr/bin/env python3
"""
Reads the AAMC MSAR "Reports for Applicants and Advisors" PDFs into raw, row-level JSON for parse-msar-reports.ts.

  python3 -I scripts/medschools/msar_extract.py <pdf-dir> <out-dir> [report-id ...]

Needs `pdfplumber` (and Pillow, which it pulls in). It reads local files only and makes no request: the PDFs are
downloaded by hand (see data/medschools/msar-reports.json for the method and the permission note) and never committed.

Why this and not `pdftotext`: most MSAR tables carry Yes / No / Case-by-Case as small IMAGES (green tick, red cross,
yellow dot), which pdftotext renders as nothing, and a school's name wraps over two or three lines, which `-layout`
interleaves with the neighbouring columns. Here every table is read cell by cell from its ruled grid: a cell's text is
the words whose centre lies inside it, and an icon is classified from the pixels of its own bounding box in a rendering
of the page (green = yes, red = no, yellow = case-by-case, an all-white image = blank). A pixel colour the classifier
does not recognise stops the run; it is never guessed.

Output per report: `<out-dir>/r<id>.json` = { id, pages, header, rows: [ { page, state, name, cells: {<col>: text},
icons: {<col>: "yes"|"no"|"case"|"blank"} } ] }, and for the Applications Accepted report one row per school with the
four sub-rows under `sub`.
"""
import collections
import json
import os
import re
import subprocess
import sys

import pdfplumber

# column index -> key; "icon:" prefix marks a column that holds an image. Column 0 is the state, column 1 the name,
# unless the report says otherwise (the PREview table has no state column).
REPORTS = {
    # Applications Accepted: sub-rows (one per applicant type) inside one school block.
    6996: {'name_col': 1, 'sub': {2: 'label', 3: 'icon:policy', 4: 'text:info'}},
    7031: {'name_col': 1, 'cols': {2: 'icon:accepts', 3: 'text:details'}},
    7036: {'name_col': 1, 'cols': {2: 'text:latest', 3: 'text:oldest'}},
    7046: {'name_col': 0, 'cols': {1: 'text:policy'}, 'no_state': True},
    7026: {'name_col': 1, 'cols': {2: 'icon:committee', 3: 'icon:packets', 4: 'icon:individual'}},
    7071: {
        'name_col': 1,
        'cols': {
            2: 'text:in_total', 3: 'text:in_tuition', 4: 'text:in_insurance',
            5: 'text:out_total', 6: 'text:out_tuition', 7: 'text:out_insurance',
        },
    },
    7066: {
        'name_col': 1,
        'cols': {
            2: 'text:in_state', 3: 'text:out_state', 4: 'icon:required', 5: 'text:refundable_by', 6: 'text:due',
            7: 'icon:refundable', 8: 'icon:applied',
        },
    },
    7061: {'name_col': 1, 'cols': {2: 'text:aid_pct', 3: 'text:debt'}},
    7051: {
        'name_col': 1,
        'cols': {2: 'text:format', 3: 'text:invitations', 4: 'text:day', 5: 'text:regional', 6: 'text:video'},
    },
    7056: {'name_col': 1, 'cols': {2: 'text:positions', 3: 'text:offers', 4: 'text:procedures'}},
    7011: {
        'name_col': 1,
        'cols': {2: 'icon:required', 3: 'text:fee', 4: 'text:sent_to', 5: 'icon:waiver', 6: 'text:deadline'},
    },
    15766: {
        'name_col': 1,
        'cols': {2: 'icon:upward', 3: 'icon:accelerated', 4: 'icon:supplemental', 5: 'text:info'},
    },
}

CTX = ''
DPI = 100
SCALE = DPI / 72.0


def classify_icon(img, bbox):
    """green -> yes, red -> no, yellow -> case, nothing coloured -> blank. Anything else raises."""
    # Inset a quarter on every side: the image box can touch the cell border, and a coloured rule is not an icon.
    ix, iy = (bbox[2] - bbox[0]) / 4, (bbox[3] - bbox[1]) / 4
    x0, y0, x1, y1 = [int(round(v * SCALE)) for v in (bbox[0] + ix, bbox[1] + iy, bbox[2] - ix, bbox[3] - iy)]
    crop = img.crop((x0, y0, max(x1, x0 + 1), max(y1, y0 + 1)))
    px = [q for q in crop.getdata() if max(q[:3]) - min(q[:3]) > 60]
    if len(px) < 8:
        return 'blank'
    r = sum(q[0] for q in px) / len(px)
    g = sum(q[1] for q in px) / len(px)
    b = sum(q[2] for q in px) / len(px)
    if g > r + 20 and g > b + 20:
        return 'yes'
    if r > g + 40 and r > b + 40 and g < 150:
        return 'no'
    if r > 200 and g > 170 and b < 120:
        return 'case'
    raise SystemExit(f'unrecognised icon colour ({r:.0f},{g:.0f},{b:.0f}) at {bbox} on {CTX}')


def lines_text(words):
    """Words of one cell -> text: lines by vertical position, a trailing hyphen joins its line to the next."""
    if not words:
        return ''
    words = sorted(words, key=lambda w: (round(w['top'] / 3), w['x0']))
    lines, cur, cur_top = [], [], None
    for w in words:
        if cur_top is None or abs(w['top'] - cur_top) > 3:
            if cur:
                lines.append(cur)
            cur, cur_top = [w], w['top']
        else:
            cur.append(w)
    if cur:
        lines.append(cur)
    out = ''
    prev_url_fragment = False
    for ln in lines:
        s = ' '.join(w['text'] for w in sorted(ln, key=lambda w: w['x0']))
        # A URL wrapped at the cell edge arrives as one long token per line, with no hyphen: join those without a space.
        url_fragment = len(ln) == 1 and len(s) >= 20 and re.match(r'^(https?://|www\.|[\w.-]+/[\w/.-]*)', s) is not None
        if out and prev_url_fragment and len(ln) == 1 and '/' in s or (out and prev_url_fragment and len(ln) == 1 and not s[0].isupper() and url_fragment is False and ' ' not in s and len(s) < 20):
            out += s
        elif out and re.search(r'\S-$', out) and not re.search(r'\s-$', out):
            out += s
        else:
            out = (out + ' ' + s) if out else s
        prev_url_fragment = url_fragment or (prev_url_fragment and len(ln) == 1 and ' ' not in s)
    return re.sub(r'\s+', ' ', out).strip()


def col_edges(table):
    xs = sorted({round(c[0], 1) for c in table.cells} | {round(c[2], 1) for c in table.cells})
    merged = []
    for x in xs:
        if not merged or x - merged[-1] > 2:
            merged.append(x)
    return merged


def separators(page, xa, xb, y0, y1):
    """y positions of horizontal rules that span the column [xa, xb] inside the table."""
    ys = set()
    for e in page.edges:
        if e['orientation'] != 'h':
            continue
        if e['x0'] <= xa + 3 and e['x1'] >= xb - 3 and y0 - 2 <= e['top'] <= y1 + 2:
            ys.add(round(e['top'], 1))
    out = []
    for y in sorted(ys):
        if not out or y - out[-1] > 2:
            out.append(y)
    return out


def in_box(w, x0, x1, y0, y1):
    cx, cy = (w['x0'] + w['x1']) / 2, (w['top'] + w['bottom']) / 2
    return x0 <= cx <= x1 and y0 <= cy <= y1


def read_report(pdf_path, rid, cfg):
    pdf = pdfplumber.open(pdf_path)
    rows = []
    dropped_headers = 0
    global CTX
    for pno, page in enumerate(pdf.pages, start=1):
        CTX = f'r{rid} page {pno}'
        tables = page.find_tables()
        if not tables:
            continue
        table = max(tables, key=lambda t: (t.bbox[2] - t.bbox[0]) * (t.bbox[3] - t.bbox[1]))
        words = page.extract_words(keep_blank_chars=False, use_text_flow=False)
        xs = col_edges(table)
        tx0, ty0, tx1, ty1 = table.bbox
        has_icons = any(v.startswith('icon:') for v in list((cfg.get('cols') or cfg.get('sub') or {}).values()))
        img = page.to_image(resolution=DPI).original.convert('RGB') if has_icons else None
        # Section label above the table ("USA" / "CAN"): rows under CAN are Canadian schools.
        above = [w['text'] for w in words if w['bottom'] <= ty0 + 1 and w['top'] >= ty0 - 25]
        region = 'CAN' if 'CAN' in above else 'USA'
        ncol = cfg['name_col']
        seps = separators(page, xs[ncol], xs[ncol + 1], ty0, ty1)
        # header: the first interval (the column titles). Data blocks are the intervals below it.
        for a, b in zip(seps, seps[1:]):
            if b - a < 6:
                continue
            nm = [w for w in words if in_box(w, xs[ncol], xs[ncol + 1], a, b)]
            name = lines_text(nm)
            if not name or name in ('Medical School Name', 'Medical School', 'State'):
                dropped_headers += 1
                continue
            state = ''
            if not cfg.get('no_state'):
                state = lines_text([w for w in words if in_box(w, xs[0], xs[1], a, b)])
            row = {'page': pno, 'region': region, 'state': state, 'name': name, 'y': [round(a, 1), round(b, 1)]}
            if 'sub' in cfg:
                subs = []
                lab_c = [c for c, v in cfg['sub'].items() if v == 'label'][0]
                lab_seps = separators(page, xs[lab_c], xs[lab_c + 1], a - 1, b + 1)
                for sa, sb in zip(lab_seps, lab_seps[1:]):
                    if sb - sa < 6 or sa < a - 2 or sb > b + 2:
                        continue
                    s = {}
                    for c, spec in cfg['sub'].items():
                        kind, _, key = spec.partition(':')
                        if spec == 'label':
                            s['label'] = lines_text([w for w in words if in_box(w, xs[c], xs[c + 1], sa, sb)])
                        elif kind == 'text':
                            s[key] = lines_text([w for w in words if in_box(w, xs[c], xs[c + 1], sa, sb)])
                        else:
                            ims = [
                                im for im in page.images
                                if xs[c] <= (im['x0'] + im['x1']) / 2 <= xs[c + 1] and sa <= (im['top'] + im['bottom']) / 2 <= sb
                            ]
                            if len(ims) != 1:
                                raise SystemExit(f'r{rid} p{pno} {name!r} {s.get("label")!r}: {len(ims)} icons in the cell')
                            s[key] = classify_icon(img, (ims[0]['x0'], ims[0]['top'], ims[0]['x1'], ims[0]['bottom']))
                    subs.append(s)
                row['sub'] = subs
            else:
                cells, icons = {}, {}
                for c, spec in cfg['cols'].items():
                    kind, _, key = spec.partition(':')
                    if kind == 'text':
                        cells[key] = lines_text([w for w in words if in_box(w, xs[c], xs[c + 1], a, b)])
                    else:
                        ims = [
                            im for im in page.images
                            if xs[c] <= (im['x0'] + im['x1']) / 2 <= xs[c + 1] and a <= (im['top'] + im['bottom']) / 2 <= b
                        ]
                        if len(ims) > 1:
                            raise SystemExit(f'r{rid} p{pno} {name!r}: {len(ims)} icons in the {key} cell')
                        icons[key] = (
                            classify_icon(img, (ims[0]['x0'], ims[0]['top'], ims[0]['x1'], ims[0]['bottom']))
                            if ims else 'blank'
                        )
                row['cells'] = cells
                row['icons'] = icons
            rows.append(row)
    return {'id': rid, 'pages': len(pdf.pages), 'rows': rows}


def preview_policies(pdf_path, rows):
    """The PREview table is an Excel export whose cells overflow: a wrapped second line ("process") sits in the stream
    after its own cell but at a position inside the NEXT row's cell, hidden by clipping. Position-based reading then mixes
    two rows' characters. The text layer keeps each cell contiguous, so this report's policy is read from `pdftotext
    -raw` instead: the text between one school's name and the next school's name on the same page."""
    by_page = collections.defaultdict(list)
    for r in rows:
        by_page[r['page']].append(r)
    for pno, prs in by_page.items():
        raw = subprocess.run(
            ['pdftotext', '-raw', '-f', str(pno), '-l', str(pno), pdf_path, '-'],
            check=True, capture_output=True, text=True,
        ).stdout
        text = re.sub(r'\s+', ' ', raw)
        squeezed, idx = '', []
        for i, ch in enumerate(text):
            if not ch.isspace():
                squeezed += ch
                idx.append(i)
        pos = 0
        starts = []
        for r in prs:
            key = re.sub(r'\s+', '', r['name'])
            at = squeezed.find(key, pos)
            if at < 0:
                raise SystemExit(f'r7046 page {pno}: {r["name"]!r} not found in the text layer')
            starts.append((idx[at], idx[at + len(key) - 1] + 1))
            pos = at + len(key)
        for i, r in enumerate(prs):
            end_of_name = starts[i][1]
            next_start = starts[i + 1][0] if i + 1 < len(prs) else len(text)
            r['cells']['policy'] = text[end_of_name:next_start].strip()


def main():
    pdf_dir, out_dir = sys.argv[1], sys.argv[2]
    only = {int(x) for x in sys.argv[3:]}
    os.makedirs(out_dir, exist_ok=True)
    for rid, cfg in REPORTS.items():
        if only and rid not in only:
            continue
        path = os.path.join(pdf_dir, f'r{rid}.pdf')
        data = read_report(path, rid, cfg)
        if rid == 7046:
            preview_policies(path, data['rows'])
        with open(os.path.join(out_dir, f'r{rid}.json'), 'w') as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        icons = collections.Counter()
        for r in data['rows']:
            for v in (r.get('icons') or {}).values():
                icons[v] += 1
            for s in r.get('sub') or []:
                icons[s.get('policy', '-')] += 1
        print(f'r{rid}: {len(data["rows"])} rows, icons {dict(icons)}')


if __name__ == '__main__':
    main()
