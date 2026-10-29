"""Contact sheets of the sample renders: sheet-N.png, with each scene's label under it.

    sheet.py <out dir with render-s-*.png> <render-labels.json>
"""
import json
import os
import sys

from PIL import Image, ImageDraw

out, labels_path = sys.argv[1], sys.argv[2]
labels = json.load(open(labels_path))
names = sorted(n for n in labels if os.path.exists(os.path.join(out, "render-%s.png" % n)))
W, H, COLS, ROWS = 240, 340, 6, 3
for page, start in enumerate(range(0, len(names), COLS * ROWS)):
    sheet = Image.new("RGB", (W * COLS, (H + 18) * ROWS), (29, 27, 25))
    draw = ImageDraw.Draw(sheet)
    for i, name in enumerate(names[start:start + COLS * ROWS]):
        im = Image.open(os.path.join(out, "render-%s.png" % name)).convert("RGB")
        im.thumbnail((W, H))
        x, y = (i % COLS) * W, (i // COLS) * (H + 18)
        sheet.paste(im, (x + (W - im.width) // 2, y))
        draw.text((x + 4, y + H + 2), labels[name], fill=(220, 215, 205))
    sheet.save(os.path.join(out, "sheet-%d.png" % (page + 1)))
print("sheets:", (len(names) + COLS * ROWS - 1) // (COLS * ROWS))
