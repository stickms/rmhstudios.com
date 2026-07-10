// Regenerate lib/emoji/shortcodes.json from the gemoji dataset (GitHub
// shortcode names, e.g. "fire" -> 🔥, including aliases like "+1"/"thumbsup").
import { writeFileSync } from 'node:fs';
import { gemoji } from 'gemoji';

const map = {};
for (const entry of gemoji) {
  for (const name of entry.names) map[name] = entry.emoji;
}

writeFileSync(
  new URL('../lib/emoji/shortcodes.json', import.meta.url),
  JSON.stringify(map),
);
console.log(`Wrote ${Object.keys(map).length} shortcodes`);
