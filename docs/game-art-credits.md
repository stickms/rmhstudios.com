# Game card pack: attributions

All 19 cards, icons and banners are original vector artwork drawn in SVG by `scripts/` (rendered with headless Chromium). The only third-party assets are open-licensed fonts from Google Fonts (SIL Open Font License 1.1), downloaded from https://github.com/google/fonts (path `ofl/<family>/...`, raw files at https://raw.githubusercontent.com/google/fonts/main/ofl/<family>/). The OFL permits commercial use and embedding in artwork; no attribution is required.

No official Valve / Counter-Strike / Half-Life / Portal files are used in the card art. (The 3D games load Valve models and maps at run time from the site's own Steam-sourced asset channels, and Hearthworks does the same for its character skins; nothing of that is committed here. See `docs/tf2-game.md` and `public/models/hearthworks/CREDITS.md`.) The three ports (csgo, half-life-2, portal) mimic the franchise look only (orange/black lambda, sand-and-orange Dust II look, white Aperture-style test chamber with orange and blue portal rings), all drawn from scratch. Steam key art was looked at for reference during planning but was neither used nor shipped; nothing from it is in any output.

| Game | Font(s) used (Google Fonts, OFL 1.1) | Source path (google/fonts `ofl/`) | Changes |
|---|---|---|---|
| altair | Michroma, Jost | michroma/Michroma-Regular.ttf, jost/Jost[wght].ttf | Title offset in cyan/magenta for a glitch look |
| csgo | Teko, Jost | teko/Teko[wght].ttf, jost/Jost[wght].ttf | Stroked and shadowed |
| daily-puzzles | Lilita One, Fredoka | lilitaone/LilitaOne-Regular.ttf, fredoka/Fredoka[wdth,wght].ttf | Stroked, drop shadow |
| dream-rift | Press Start 2P, Silkscreen | pressstart2p/PressStart2P-Regular.ttf, silkscreen/Silkscreen-Bold.ttf | Offset colour shadow |
| gabriels-horn | Cinzel, Jost | cinzel/Cinzel[wght].ttf, jost/Jost[wght].ttf | Gold gradient fill, stroke |
| half-life-2 | Barlow Condensed, Jost | barlowcondensed/BarlowCondensed-ExtraBold.ttf, jost/Jost[wght].ttf | "A" replaced with a drawn lambda mark |
| house-always-wins | Abril Fatface, Cinzel, Limelight | abrilfatface/AbrilFatface-Regular.ttf, cinzel/Cinzel[wght].ttf, limelight/Limelight-Regular.ttf | Gold gradient, red shadow |
| kowloon-knockout | Bungee, ZCOOL KuaiLe, Jost | bungee/Bungee-Regular.ttf, zcoolkuaile/ZCOOLKuaiLe-Regular.ttf, jost/Jost[wght].ttf | Neon glow; Chinese text is simplified (font has no traditional 龍/賽) |
| laundry-sort | Lilita One, Fredoka | as above | Stroked, drop shadow |
| neon-driftway | Exo 2 (Italic), Jost | exo2/Exo2-Italic[wght].ttf, jost/Jost[wght].ttf | Gradient fill, neon glow |
| nightrail | Michroma, Jost | as above | Neon glow |
| portal | Jost | jost/Jost[wght].ttf | "O" replaced with a drawn blue portal ring |
| rmhbox | Titan One, Fredoka | titanone/TitanOne-Regular.ttf, fredoka/Fredoka[wdth,wght].ttf | Two-colour wordmark, stroke |
| slice-it | Archivo, Bodoni Moda, IBM Plex Mono | archivo/Archivo[wdth,wght].ttf, bodonimoda/BodoniModa-Italic[wght].ttf | "SLICE" cut on a diagonal in Archivo (width 125, weight 900) with a Bodoni Moda italic "it!"; outlines converted to paths (`public/images/games/logos/slice-it-cut.svg` (renamed from `slice-it.svg` so a cached copy of the old neon logo cannot be served at the same URL)) |
| synapse-storm | Exo 2 (Italic), Jost, Orbitron | orbitron/Orbitron[wght].ttf | Neon glow |
| temple-of-joy | Cinzel, Jost | cinzel/Cinzel[wght].ttf | Gold gradient, stroke, shadow |
| velum2099 | Orbitron, Jost | orbitron/Orbitron[wght].ttf | Gradient fill, neon glow |
| versecraft | Great Vibes, Cinzel, Cormorant Garamond Italic | greatvibes/GreatVibes-Regular.ttf, cormorantgaramond/CormorantGaramond-Italic[wght].ttf | Pink glow |
| void-breaker | Black Ops One, Jost | blackopsone/BlackOpsOne-Regular.ttf | Gold gradient, orange glow |

Local copies are in `dl/fonts/` (downloaded, untrusted data; only used as font files by Chromium and by fontTools for text measuring).

---

## Logos, design schemes and fonts (2026-11-04)

Per-game logos live in `public/images/games/logos/<id>.svg|webp`, the design-scheme specs a menu is built
from in `docs/game-design-schemes/<id>.json`, and the self-hosted OFL fonts (woff2 + their `OFL.txt`) in
`components/shared/game-fonts/` with ready `@font-face` rules in `fonts.css` — import it from a game's CSS with
`@import '../shared/game-fonts/fonts.css';` so Vite hashes and serves the files. All 21 families are SIL Open
Font License 1.1, from https://github.com/google/fonts (`ofl/<family>/`): Orbitron, Audiowide, Bungee, Press
Start 2P, Silkscreen, Cinzel, Black Ops One, Teko, Barlow Condensed, Lilita One, Titan One, Great Vibes, Abril
Fatface, Limelight, ZCOOL KuaiLe, Exo 2, Michroma, Jost, Fredoka, Cormorant Garamond, IBM Plex Mono.


---

## Card, icon and banner redesign v2 (2026-11-04)

The cards and icons were rebuilt from real sourced material (museum, library and archive scans, NASA imagery, CC0 photography) treated as print work, with per-game typography. Credits per designer batch follow. The "Marlon Jack" cards (RMHbox, Versecraft and the app cards) are kept as they were; they gained banners, and five apps without a card got new ones in the same style, reusing the faces already in the existing cards.

### ATTRIBUTIONS-daily-puzzles.md

# Attributions — daily-puzzles, gabriels-horn, house-always-wins, kowloon-knockout, laundry-sort

All images were downloaded into `<id>/assets/` (untrusted, read only with `python3 -I`). Build scripts live in `scripts/<id>/`; shared helpers in `scripts/_tools/`. No CC-BY / CC-BY-SA / editorial-only material is used.

## daily-puzzles
- **"Cross Word Puzzle Book, 1st series" (New York, 1924), Puzzle No. 2 "Try and Do It" by W. W. Foster, printed p. 19 (scan page n30)** — Internet Archive item `crosswordpuzzleb00unse`, https://archive.org/details/crosswordpuzzleb00unse (page image: `https://archive.org/download/crosswordpuzzleb00unse/page/n30_w2000.jpg`). Licence: public domain (1924 US publication; item flagged "Library of Congress is unaware of any copyright restrictions"). Changes: cropped hard, light flattened, re-inked as two plates (violet lines/numerals, pink black-squares, offset for misregistration), dust and grain added. Used for both card and icon.
- Fonts (SIL OFL, Google Fonts): Abril Fatface, Alfa Slab One, Bungee, Playfair Display (900 italic), Chonburi, Anton, Bowlby One, Rozha One, Fascinate (ransom-note title tiles); Special Elite and Courier Prime (typed slip, caption).

## gabriels-horn
- **Jusepe de Ribera (Lo Spagnoletto), "Saint Jerome Hearing the Trumpet of the Last Judgment", etching and engraving, ca. 1621** — The Metropolitan Museum of Art, Open Access (CC0), object 397952, https://www.metmuseum.org/art/collection/search/397952 (image `https://images.metmuseum.org/CRDImages/dp/original/DP836406.jpg`). Changes: cropped to the angel with the horn, converted to a line-ink plate printed as gold foil (with foil dropouts) on aubergine, plus a lilac under-print and offset ghost; lattice (card-back harlequin) is procedural. Used for card and icon.
- (Also downloaded for evaluation, NOT used: Dürer "The Seven Angels with the Trumpets" (Met 388122), Jean Duvet "The Angel sounding the Sixth Trumpet" (Met 386219).)
- Fonts (SIL OFL): UnifrakturMaguntia (title, "G" icon), IM Fell English / IM Fell English SC (text, captions, card index "7").

## house-always-wins
- **Carol M. Highsmith, "Neon casino sign, Las Vegas, Nevada"** (LC-DIG-highsm-17922), Library of Congress Prints & Photographs Division, https://www.loc.gov/item/2011636116/ . Rights: "No known restrictions on publication"; Highsmith donated her photography to the public (public-domain dedication). Downloaded via IIIF `service:pnp:highsm:17900:17922`. Changes: cropped, mapped through an oxblood/gold gradient, halftone screen overlay, torn lower edge, grain. Used for card strip and icon background.
- (Also downloaded, NOT used: Highsmith "Vintage slot machine at the Casino Legends Hall of Fame" (LoC 2011631860).)
- Title bulbs: procedural dot-matrix marquee built from the Alfa Slab One letterforms. "Marker no. 0777 / $1,000,000" stub is invented game flavour text (the game's Debt mechanic).
- Fonts (SIL OFL): Alfa Slab One, IBM Plex Mono, Playfair Display (900 italic).

## kowloon-knockout
- **Wonderlane, "Neon sign of the world, day time, a street, 1990 – the last decade of Colonial Hong Kong, soon to be returned to China"** — Flickr, https://www.flickr.com/photos/71401718@N00/14469754044 , licence CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/; located via Openverse). Changes: cropped, contrast-lifted, converted to a two-plate halftone (hot pink + yellow, offset for misregistration) on near-black stock; torn black paper strip and a torn yellow "wheat-paste" sheet added; card also carries a small credit line. Used for card and icon background.
- (Also downloaded for evaluation, NOT used: rawpixel "Free Hong Kong neon nights" (provenance unclear), Unsplash-on-Wikimedia "Big city bunting", rawpixel/Wikimedia Temple Street view.)
- Fonts (SIL OFL): Big Shoulders Display 900 ("KNOCKOUT", vertical "KOWLOON"), Zhi Mang Xing (brush hanzi 九龙 / 九龙淘汰赛), DotGothic16, Share Tech Mono (small print).

## laundry-sort
- **Frederic Edwin Church, "Laundry Hung Out to Dry"** — Cooper Hewitt, Smithsonian Design Museum, Smithsonian Open Access (CC0), https://collection.cooperhewitt.org/view/objects/asitem/id/22895 (image id `CHSDM-Chd764`, `https://ids.si.edu/ids/download?id=CHSDM-Chd764`). Changes: cropped to the clothesline, converted to a navy halftone plate with a hue-selected yellow plate for the yellow garments, torn lower edge.
- **"1919 advertisement for Voss washing machine"** (newspaper ad, Neidig Bros., Ltd.), Flickr user Matthew Paul Argall – Old Ads, https://www.flickr.com/photos/159358942@N07/30801587858 , Public Domain Mark 1.0. Changes: machine cropped from the ad, line art converted to a navy ink plate on transparent, laid over a misregistered yellow disc. Used for the card and the icon (drum).
- (Also downloaded for evaluation, NOT used: Wells' Smoke Shop postcard "Wash-Day at a Mountain Home, Asheville" (Flickr, PDM), 1954/1919 Washrite/Washing-machine ads.)
- Fonts (SIL OFL): Shrikhand (title, labels), Space Mono (small print).

## Fonts source
Google Fonts (OFL), fetched as WOFF2 via the Google Fonts CSS API into `scripts/_tools/fonts/<id>/`.


### ATTRIBUTIONS-neon-driftway.md

# Attributions: neon-driftway, nightrail, slice-it, synapse-storm (game-art-v2)

All sourced assets are public domain / CC0. No CC-BY or CC-BY-SA material is used. Fonts are SIL OFL from Google Fonts (google/fonts on GitHub).
Everything is re-printed: toned, halftoned or line-screened, cropped, grained and composited; nothing is used as found.

## neon-driftway
- **"Long exposure traffic line night"** (motorway light trails, portrait). rawpixel Public Domain / CC0 collection (found via Openverse, licence `cc0`).
  Page: https://www.rawpixel.com/image/433091/free-photo-image-highway-long-exposure-light-traffic-lights
  Local copy: `neon-driftway/assets/a1.jpg` (683 x 1024 WebP as served by rawpixel).
  Changes: upscaled to card size; split into a cyan screen (white trails) and a pink screen (red trails) and re-printed as 6.5 px AM halftones with a 2-3 px misregistration, screen-blended on near-black stock; top rows blanked; paper fibre, scan dust, fold creases, grain. Type, speed-limit plate and header strip are original.
  Note: Openverse metadata is the only licence evidence; the original photographer is not named there (rawpixel filename hints at a CC0 stock photographer).

## nightrail
- **"Chicago, Illinois. One of the yards of the Chicago and Northwestern Railroad at night. The light streaks are caused by lantern of men going in and out of the yard office"**, Dec. 1942, FSA/OWI collection, Library of Congress, LC-USW3-012681-D (negative frame OWI-12681-D).
  https://www.loc.gov/pictures/collection/fsa/item/2017836467/ (file `.../8d11258v.jpg`). Rights: "No known restrictions" (US Government FSA/OWI photograph, public domain).
  Local copy: `nightrail/assets/8d11258v.jpg`.
  Changes: monochrome negative scan (including its film rebate and handwritten frame number) tritone-mapped (black-plum / violet / amber / cream), rotated 1.6 degrees, laid on plum card stock with a print shadow, masking tape and a torn cream timetable strip added; icon is a crop of the signal lamp from the same frame.

## slice-it
- **"Portrait of Sid Catlett, New York, N.Y., ca. Mar. 1947"**, William P. Gottlieb, Library of Congress, Music Division, item 2023867522 (`musgottlieb-01181`).
  https://www.loc.gov/item/2023867522/ Rights: per the photographer's wishes the Gottlieb collection entered the public domain on 16 Feb 2010. LoC adds that rights of privacy and publicity may apply to the people depicted.
  Local copy: `slice-it/assets/gottlieb_catlett_2400.jpg` (IIIF derivative, 2360 x 2400).
  Changes: cropped hard to the raised arm, stick and cymbals (the face is deliberately outside the card crop); converted to wavy line-screens (oscilloscope / record-groove feel) in cyan (upper) and pink (lower), cut along a diagonal and the two halves slid apart; the title is sliced on the same line; vinyl ring-wear, creases, dust and grain added. The credit line is printed on the card.

## synapse-storm
- **S. Ramon y Cajal, "Histologie du systeme nerveux de l'homme et des vertebres", trad. L. Azoulay, Paris 1909, tome 1**, Internet Archive item `b21270879_001`, page index n204 (Fig. 60, "Cellules pyramidales geantes; chien age de 10 jours").
  https://archive.org/details/b21270879_001 (page image `https://archive.org/download/b21270879_001/page/n204_w1600.jpg`). Public domain by age (author d. 1934, book 1909); archive.org lists the item as "copyright not evaluated".
  Local copy: `synapse-storm/assets/b21270879_001_n204.jpg`.
  Changes: cropped to Fig. 60 and its caption, re-toned to ink-on-aged-paper, torn edges and foxing added, cyan spot ink over nucleus A and pink over nucleus B (misregistered), taped to the card. Icon is a crop of cell A with the lightning below overprinted in pink.
- **"lightning bolt storm"** (night lightning, portrait). rawpixel Public Domain / CC0 collection (via Openverse, licence `cc0`; sourced from Wikimedia).
  https://www.rawpixel.com/image/3285791/free-photo-image-nature-storm-lightning
  Local copy: `synapse-storm/assets_lightning/l_rawpixel_3285791.webp`.
  Changes: high-pass extracted into pink filaments and white-hot core, sky glow re-printed as a cyan halftone, over a violet underlay on near-black stock.

## Fonts (SIL Open Font License, Google Fonts)
Big Shoulders Stencil Display, IBM Plex Mono (nightrail, neon-driftway, slice-it); Racing Sans One (neon-driftway); Syne, Abril Fatface (slice-it); Pirata One, Share Tech Mono, IM Fell Pica Italic (synapse-storm).

## Rebuild
Scripts: `scripts/common/print.py` (halftone, line-screen, paper, torn edge, crease, ink helpers), `scripts/common/shot.js` (Playwright type layer), and `scripts/<id>/{bg,compose,build,icon}.py`. Type layers live in `<id>/work/type.html`. Run `bg.py` (or `build.py` for slice-it), render `type.html` with `shot.js`, then `compose.py`, then `icon.py`, using `python3 -I`.


### ATTRIBUTIONS-temple-of-joy.md

# Attributions: temple-of-joy, velum2099, void-breaker, hearthworks (card + icon v2)

No attribution is legally required for any asset below (all CC0 / public domain / OFL); credit is recorded anyway.
Originals are kept in `game-art-v2/_a_temple`, `_a_velum`, `_a_void`, `_a_hearth`; build scripts in `game-art-v2/scripts/<id>/` (shared helpers in `scripts/tvvh_common/`, which also holds the OFL font files used).

## temple-of-joy
- **Smiling figure (Sonriente)**, Classic Veracruz, 600-1000 CE, ceramic. The Metropolitan Museum of Art, Michael C. Rockefeller Memorial Collection, Bequest of Nelson A. Rockefeller, 1979 (object 313386). https://www.metmuseum.org/art/collection/search/313386 ; image https://images.metmuseum.org/CRDImages/ao/original/DP104829.jpg. Licence: The Met Open Access, CC0.
  Changes: cut out of the grey studio backdrop (saturation mask + flood fill), luminance re-mapped to a brown/gold tritone, shadow halftone screen added, cream die-cut border, paper-grain and film-grain overlay. Used on the card (hero) and, cropped to the face, on the icon.
- Everything else (sunburst, rubber stamp with deadpan smiley, ticket stub, barcode, paper) was drawn procedurally. The barcode is decorative and encodes nothing.
- Fonts (SIL OFL 1.1, Google Fonts): Ultra, UnifrakturMaguntia, Space Mono, Instrument Serif.

## velum2099
- **Alone in Tokyo III** (Flickr id 47956673191), photograph, Wikimedia Commons file `Alone in Tokyo III (47956673191).jpg`, https://commons.wikimedia.org/wiki/File:Alone_in_Tokyo_III_(47956673191).jpg. Licence shown on Commons: CC0 1.0. (Photographer credit is on the Commons file page; the metadata API was rate-limited when this was written, so it is not copied here.)
  Changes: cropped hard on the figure, regraded, split into two light-ink halftone plates (cyan 15 deg, magenta 75 deg, 8 px cell), magenta plate misregistered 7/-5 px, screened onto near-black stock with a dim ghost of the photo; grain. A 960 px derivative was the source (Wikimedia throttled larger downloads), upscaled under the halftone.
- Receipt, stamp, 配達中 ("out for delivery"), kanji and all text: typeset by us; details (timer 02:14, combo x4, 12,400 yen) are taken from the game's own HUD.
- Fonts (OFL): Dela Gothic One, DotGothic16 (subsetted), IBM Plex Mono.

## void-breaker
- **Cat's Eye Nebula (NGC 6543)**, Hubble Space Telescope image, NASA Image and Video Library id `GSFC_20171208_Archive_e002155`. https://images.nasa.gov/details/GSFC_20171208_Archive_e002155 . Credit line: NASA, ESA, HEIC and The Hubble Heritage Team (STScI/AURA). Licence: NASA media, not copyrighted (public domain; NASA media usage guidelines).
  Changes: two crops (tight on the eye for the "O" of VOID and the icon; wide for the arena disc), mapped to an obsidian-to-gold ramp with a 6-9 px halftone screen. Used at two scales.
- Hazard stripes, orbit ticks, 12 shards, red enemy triangle: drawn by us.
- Fonts (OFL): Big Shoulders Stencil Display, Chakra Petch, IBM Plex Mono.
- Not used: a Cellarius "Harmonia Macrocosmica" plate (Wikimedia was throttling downloads; the Internet Archive copy found is CC BY-NC-ND and therefore excluded).

## hearthworks
- **Bird's-Eye View of a French Chateau and Formal Garden**, Anonymous, French, 18th century, drawing. The Met, Gift of Leni and Peter May, 2024 (object 913662). https://www.metmuseum.org/art/collection/search/913662 . Licence: The Met Open Access, CC0.
  Changes: cropped to the parterres and house, mapped to a deep-teal / pale-aqua duotone, set in an arched seed-packet window. Also the icon's background.
- **The Vegetable Garden** (Vilmorin-Andrieux, English edition, 1920 printing), Internet Archive item `vegetablegardeni00vilm` (https://archive.org/details/vegetablegardeni00vilm); wood-engraved plates from pages n222 (carrots), n138 (turnip beet), n258 (celery), n162 (cabbage). Internet Archive rights note: "The Library of Congress is unaware of any copyright restrictions for this item"; published 1920 or earlier, so US public domain.
  Changes: engraving isolated by ink mask and hole-filled silhouette, flat pastel spot colours (mint, butter, peach, powder blue) printed slightly misregistered under the teal line work, die-cut paper border. The turnip is also the icon.
- Type and layout by us. Fonts (OFL): Fraunces (SOFT/WONK axes), DM Mono.


### ATTRIBUTIONS.md

# Game art v2 (altair, csgo, half-life-2, portal, dream-rift): asset attributions

All source files were downloaded into `_assets/<id>/` and are used only as image data. Build scripts are in `scripts/<id>/build.py` (shared helpers in `scripts/common/tex.py`, renderer `scripts/render.cjs`).
No Valve key art, logos or press-kit files were used. The lambda and the portal rings are redrawn from scratch in the franchise's own visual language.

## altair
- **Interior view of the living quarters of the research submarine "Ben Franklin" (PX-15)**, NASA / Marshall Space Flight Center, 1969. NASA image library id `6900903` (catalogued as "Skylab"). https://images-assets.nasa.gov/image/6900903/6900903~orig.jpg. Licence: NASA media, public domain (US Government work), no attribution required.
  Changes: cropped, cyan/black duotone, amber kept from the lamp, magenta misregistered plate and "echo" afterimages of the distant figure, scanlines, horizontal glitch slices, grain; type and star chart added. The star chart uses real coordinates for Alshain, Altair and Tarazed.
- Fonts (SIL OFL 1.1, google/fonts): Syne, Space Mono.

## csgo
- **Jerusalem, Damascus Gate** (G. Eric and Edith Matson Photograph Collection, Library of Congress, Prints & Photographs Division). Item https://www.loc.gov/item/2019704438/ (master TIFF `matpc/15000/15028u.tif`). Rights advisory: "No known restrictions on publication".
  Changes: cropped; black halftone, flat orange plate and blue sky halftone (3-ink print simulation); misregistration; paper texture; type, crosshair, plan sketch and barcode added.
  Note: the LoC date is given as 1925 but the vehicles suggest the 1940s. The "no known restrictions" statement is LoC's and is not a PD certification.
- Fonts (OFL): Saira Stencil One, Courier Prime. Big Shoulders Stencil Display was loaded but is only a secondary face.

## half-life-2
- **Standard Elevator, 1 Saint Clair Street, Buffalo, NY** (Historic American Engineering Record, photo file `350161pv`), Library of Congress. Item https://www.loc.gov/item/ny1669/. HAER/HABS documentation is a US Government work (public domain).
  Changes: cropped, black halftone plus misregistered orange plate on a grey paper stock; type and lambda disc added.
- Fonts (OFL): Big Shoulders Display, Share Tech Mono.

## portal
- **Dawn Spacecraft Processing** (a worker in a clean-room "bunny suit" beside the wrapped spacecraft), NASA / Kennedy Space Center, 2007-04-10, NASA id `KSC-07PD-0861`. https://images-assets.nasa.gov/image/KSC-07PD-0861/KSC-07PD-0861~orig.jpg. Licence: NASA media, public domain.
  Changes: two elliptical crops (one flipped), local-contrast boost, blue and orange halftone monotones inside "portal" windows, paper grid; type added.
- Fonts (OFL): Archivo (variable, wdth + wght), Space Mono.

## dream-rift
- **Wild Geese Flying under the Full Moon**, Utagawa Hiroshige, ca. 1833. The Metropolitan Museum of Art, Joseph Pulitzer Bequest, 1918, object 36742. https://www.metmuseum.org/art/collection/search/36742 (image DP121523). Licence: The Met Open Access, CC0.
  Changes: recoloured into the game's violet/lilac with cyan wing patches and pink seals, progressively pixelated toward the bottom, grain; pixel bullet rings (own drawing), type and seal added.
- Fonts (OFL): Pixelify Sans, DotGothic16, Silkscreen.


### jack/ATTRIBUTIONS.md

# Attributions: Marlon Jack banners and cards

## Imagery
No third-party photographs, textures or clip-art were downloaded or used. Every prop (cardboard-free vector
scenes, bibs, film strip, house, ladder, calculator, TF2-style poster, palm fronds, circuit traces, waveforms)
is drawn in HTML/SVG/PIL by `scripts/`.

All face imagery is cropped / restyled from the owner's existing cards in `scratchpad/oldcards/` (not invented):
- `rmhbox.webp`: photo cut-out with box (banner rmhbox, unaltered apart from scaling)
- `versecraft.webp`: illustrated figure cut out with GrabCut (banner versecraft)
- `rmhcode.webp`: photoreal portrait (banner rmhcode as a feathered crop; cut-out with GrabCut for the new cards, then
  restyled as halftone / posterised screenprint / violet duotone)
- `rmhmusic.webp`: watercolour portrait + palms (banner rmhmusic, multiplied onto generated paper)
- `rmhstudy.webp`: line-art dial; `rmhtype.webp`: line-art key; `rmhtube.webp`: vector portrait (also used as the source
  for the 1-bit LCD dither in rmhcalculator and the attic-window portrait in rmhhomes)
- `rmhstrategies.webp`: only the "Sahur" wooden-bat character, the clock and the card's text content were reused. The
  card's two human portraits are real public figures, NOT the face; they were deliberately left out of the banner.
- `rmhdle.webp`: brain + speech-bubble glyph, re-extracted and recoloured. `rmhconnections` / `rmhstudio`: re-built, faceless.

## Fonts (all SIL OFL 1.1, from Google Fonts via fonts.googleapis.com, stored in `fonts/`)
Inter, Montserrat, Poppins, JetBrains Mono, Josefin Sans, Kalam, Cinzel, Cinzel Decorative, Cormorant Garamond, Exo 2, Sora,
Share Tech Mono, VT323, Unbounded, Anton, Alfa Slab One, Oswald, Special Elite, Bricolage Grotesque, Space Grotesk,
Fraunces, Chivo Mono, Archivo, and a few unused extras (Krona One, Doto, DM Sans/Serif, Rye, Bungee, Syncopate, Caveat,
Rubik Mono One, Big Shoulders Display).

## Tools
Python PIL/numpy, OpenCV (GrabCut, installed in a separate dir, MIT/Apache-2.0), headless Chromium via Playwright. No licence-encumbered stock assets.
The TF2 card mimics the franchise's red/blue poster look with original artwork and no official assets or logos.

## Art round 3 (2026-11-05): app cards, banners, icons and logos; text-free library banners

Each batch below is the agent's own attribution file, verbatim apart from heading levels. Third-party assets are CC0 / public domain / "no known restrictions" or open-licensed as stated; face imagery is the owner's own existing artwork. Sources were chosen for clear licences; where a source carries only "no known restrictions" (Library of Congress) or NASA's public-domain-with-credit terms, the entry says so.

### App art v3, batch A (Dunesday, TF2 Hub, Calculator, Homes)

#### Attributions: app art v3, batch A (dunesday, rmh-tf2-hud, rmhcalculator, rmhhomes)

Build scripts: `scripts/` (Python PIL/numpy/OpenCV + headless Chromium). Intermediate layers: `work/`. Downloaded originals: `_assets/<name>/` (treated as image data only).

##### The face (owner's own imagery, not third-party)
"Marlon Jack" is the owner's recurring face, taken only from the owner's existing cards (no new likeness was generated):
- Photo cut-out (head and neck, GrabCut, from the `rmhcode` card): `game-art-v2/jack/work/face_photo_cut.png`. Restyled per app as two-plate halftones (dunesday: umber + teal misregistered plate; rmh-tf2-hud: red/blue split-ink halftone; rmhhomes: green + ochre plates).
- Owner's illustrated portrait (from the `rmhtube` card): `game-art-v2/jack/work/face_vec.png`. Restyled as a 1-bit Atkinson-dithered LCD image (rmhcalculator).
- Only cropping, tone-mapping, halftone/dither and colour were applied. No warping or body edits.

##### Third-party images
| Asset (exact title) | Creator / source | URL | Licence | Used in | Changes |
|---|---|---|---|---|---|
| "The Active Dunes of Nili Patera" (PIA18244, medium JPEG) | NASA/JPL-Caltech/Univ. of Arizona (HiRISE, Mars Reconnaissance Orbiter) | https://images-assets.nasa.gov/image/PIA18244/PIA18244~medium.jpg (record: https://images.nasa.gov/details/PIA18244) | NASA media, public domain for non-commercial/educational use with credit; NASA imagery is not copyrighted (https://www.nasa.gov/nasa-brand-center/images-and-media/) | dunesday card, banner, icon, film frame | Rotated/cropped, converted to greyscale and gradient-mapped to a teal-to-amber duotone, grain added |
| "[Elphinstone winning Washington Marathon. #27 runner...]" (LC-USZ62-29325), Bain News Service | George Grantham Bain Collection, Library of Congress | https://www.loc.gov/pictures/item/2022641196/ | "No known restrictions on publication" (LoC rights statement; 1911 photograph, public domain) | dunesday film strip | Cropped to the runner, sepia gradient map |
| "Start of Brooklyn marathon" (LC-USZ62-111275), 1909 | Bain Collection, Library of Congress | https://www.loc.gov/pictures/item/94506955/ | "No known restrictions on publication" (public domain) | dunesday film strip | Cropped to the crowd, sepia gradient map |
| "[Dorando in the Marathon. Marathon runner going down crowded city street. London?]" (LC-USZ62-33733), ca. 1910 | Bain Collection, Library of Congress | https://www.loc.gov/pictures/item/2022652734/ | "No known restrictions on publication" (public domain) | dunesday film strip | Cropped, sepia gradient map |
| "8-Foot High Speed Tunnel (HST)" (LRC-1957-B701_P-00959), 1957 | NASA Langley Research Center | https://images-assets.nasa.gov/image/LRC-1957-B701_P-00959/LRC-1957-B701_P-00959~large.jpg | NASA media, public domain (credit NASA) | rmh-tf2-hud card, banner, icon backgrounds | Cropped, red and blue split duotone, sunburst and halftone overlay, grain |
| "ERA 1103 UNIVAC 2 Calculating Machine" (GRC-1955-C-39782), 1955 | NASA Lewis (Glenn) Research Center | https://images-assets.nasa.gov/image/GRC-1955-C-39782/GRC-1955-C-39782~medium.jpg | NASA media, public domain (credit NASA) | rmhcalculator card and banner texture | Cropped to the console lettering only (no people), blue duotone, heavily dimmed |
| "HP 9100A Calculator 1968.jpg" | Swtpc6800 (Michael Holley), own work, Wikimedia Commons | https://commons.wikimedia.org/wiki/File:HP_9100A_Calculator_1968.jpg | Public domain (as declared on Commons) | rmhcalculator banner (taped print) | Greyscale, blue duotone, framed as a print with a handwritten caption |
| "Sanborn Fire Insurance Map from Boston, Suffolk County, Massachusetts" (East Boston, vol. 4 sheet 5, 1900) | Sanborn Map Company, LoC Geography and Map Division | https://www.loc.gov/item/sanborn03693_012/ (sheet via IIIF, `03693_05_1900-0005`) | Public domain (LoC: "The content of the Library of Congress online Sanborn Maps Collection is in the public domain") | rmhhomes card map, banner map, icon texture | Cropped; re-graded to the app palette (ink to deep green, buildings to mustard/coral); inverted to cream-on-green for the banner |

Downloaded but not used in the finals (removed): other NASA/LoC candidates were discarded. WPB war posters were rejected for content. HABS drawings were rejected because LoC marks the scans' third-party rights as uncertain.

##### Drawn in-house (no third-party source)
Race bib, film strip perforations, pins, HUD panels, crosshair, 7-segment digits, calculator body, solar strip, keys, sign boards, cameo frame, map pins, roof logo. TF2 pieces mimic the 2000s team-poster look only; no Valve art, logos or screenshots were used. Plasma/grain textures are procedural.

##### Fonts (all SIL Open Font License 1.1, from https://github.com/google/fonts, `ofl/` tree; files in `fonts/`)
| Font | Used for | Source path |
|---|---|---|
| Limelight (Eduardo Tunni) | dunesday title + logo | ofl/limelight |
| Big Shoulders Display (Patric King / Chicago Design Initiative) | dunesday bib numerals and labels | ofl/bigshouldersdisplay |
| DM Mono (Colophon Foundry) | dunesday bib small print | ofl/dmmono |
| Holtwood One SC (Vernon Adams) | rmh-tf2-hud title + logo | ofl/holtwoodonesc |
| Teko (Indian Type Foundry) | rmh-tf2-hud HUD labels and numerals | ofl/teko |
| Unbounded (NaN) | rmhcalculator title + logo | ofl/unbounded |
| IBM Plex Mono (IBM) | rmhcalculator LCD text, keys; rmhhomes tags | ofl/ibmplexmono |
| Reenie Beanie (James Grieshaber) | rmhcalculator handwritten caption | ofl/reeniebeanie |
| Syne (Bonjour Monde) | rmhcalculator "=" key on the icon | ofl/syne |
| Young Serif (Bastien Sozeau) | rmhhomes title, sign, logo | ofl/youngserif |

Other fonts fetched during selection but unused (Bevan, Black Ops One, Bowlby One, Chonburi, Gloock, Rozha One, Orbitron, Staatliches, Bebas Neue, Oswald, Courier Prime, Caveat, Rubik Mono One, Sixtyfour, Big Shoulders Stencil) are also OFL and not part of any output.

##### Text changes on the cards
- dunesday: removed the clipped "DUNE: PART III" (now "DUNE: PART THREE", matching the catalog); "MARATHON" bib band keeps MCU / DUNE flanks; "18-12" now "18·12".
- rmh-tf2-hud: title kept as "TF2 HUB" with "RMH" above; the tagline no longer overlaps its subline ("BUILD YOUR OWN HUD" / "PLAY · HUD EDITOR · LOADOUT BUILDER · WORKSHOP").
- rmhcalculator, rmhhomes: copy unchanged. The homes tagline row adds "FILTER / SAVE / ALERTS" (from the catalog description).

### App art v3, batch B (Ladder, Music, Study, Type)

#### Attributions: batch B (RMH Ladder, RMH Music, RMH Study, RMH Type)

Everything below was downloaded to `_assets/<name>/` (each with a `meta.json` holding the licence data returned by the
source API) and treated as image data only. Only public-domain / CC0 material is used. All assets were fetched on
2026-11-05 through the Wikimedia Commons API and the Metropolitan Museum Open Access API.

##### Face imagery (owner's own, not third party)
Every face is derived from the owner's existing "Marlon Jack" cards (`scratchpad/oldcards/`, previous cut-outs in
`game-art-v2/jack/work/`). Nothing was generated or invented.
- rmhladder: GrabCut photo cut-out (`face_photo_cut.png`, from the owner's rmhcode card), re-treated as a violet/lime
  halftone (badge, banner) and a 3-level posterised version (icon).
- rmhmusic: the owner's watercolour portrait from the original rmhmusic card, multiplied onto new paper/wash backgrounds.
- rmhstudy: the line-art face from the owner's original rmhstudy card, re-extracted (4x, thresholded to a clean ink mask,
  dial ticks removed) and recoloured navy.
- rmhtype: the line-art face from the owner's original rmhtype card, re-extracted the same way and recoloured black.

##### Third-party assets

| # | Title | Creator / source | URL | Licence | Used in | Changes |
|---|-------|------------------|-----|---------|---------|---------|
| 1 | "The Ladder" (salted paper print, April 1844) | William Henry Fox Talbot; The Metropolitan Museum of Art, Bequest of Maurice B. Sendak, 2012 (obj. 306335) | https://www.metmuseum.org/art/collection/search/306335 | CC0 (Met Open Access, public domain) | rmhladder card + banner | Cropped to the ladder, converted to a violet tritone duotone with grain; level labels (STAFF ... INTERN) and leader lines added on top. |
| 2 | "Sailors or Laborers Wanted" for Washington Navy Yard, City of Washington Gazette, 1 Dec 1819 | Newspaper advertisement (1819), Library of Congress scan, via Wikimedia Commons | https://commons.wikimedia.org/wiki/File:%22Sailors_or_Laborers_Wanted%22_for_Washington_Navy_Yard,_City_of_Washington_Gazette_1_Dec_1819.jpg | Public domain (Commons) | rmhladder card | Recoloured to deep violet ink on cream paper; placed as a taped clipping with a new caption. |
| 3 | "Palm Tree, Nassau" (watercolour, 1898) | Winslow Homer; The Met, Amelia B. Lazarus Fund, 1910 (obj. 11131) | https://www.metmuseum.org/art/collection/search/11131 | CC0 (Met Open Access) | rmhmusic card + banner | Palm crown cut from the sky by darkness mask, slightly saturated, mirrored/rotated and multiplied into the washes. |
| 4 | Church sonata K. 274, autograph score, f. 1r | Wolfgang Amadeus Mozart; Staatsbibliothek zu Berlin, via Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Mozart_-_Church_sonata_K._274_-_autograph,_Staatsbibliothek_zu_Berlin,_f._1r.png | Public domain (Commons) | rmhmusic card + banner | Cropped, desaturated and lifted to a faint manuscript texture under procedurally generated watercolour washes. |
| 5 | 12in-Vinyl-LP-Record-Angle.jpg | Evan-Amos, via Wikimedia Commons | https://commons.wikimedia.org/wiki/File:12in-Vinyl-LP-Record-Angle.jpg | Public domain (Commons) | rmhmusic card, banner, icon | Cut out as a disc, recoloured to blue, groove contrast boosted, yellow label repainted; used as a pale record behind the portrait and as the icon's record. |
| 6 | "Fleurs Tropicales et Palmiers (Tropical Flowers and Palm Trees)" (block-printed cotton, 1787) | Oberkampf Manufactory; The Met, Rogers Fund, 1937 (obj. 226246) | https://www.metmuseum.org/art/collection/search/226246 | CC0 (Met Open Access) | rmhmusic card | Cropped to a strip, mapped to a navy/sky duotone, faded into the bottom edge. |
| 7 | Stoppuhr hanhart.jpg (mechanical stopwatch) | Stefan (StefanPohl), via Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Stoppuhr_hanhart.jpg | Public domain (released by the author, Commons) | rmhstudy card + banner | Cut out of its background, mapped to a navy cyanotype tone, case clipped to a circle; the centre of the dial (including the maker's logo) is covered by the owner's face dial; amber second hand added. |
| 8 | 2ND DECK CASEMATE, ADDITIONAL DECK PROTECTION, 3 DEC. 1925 (blueprint, battleship Texas) | US Navy (Thompson), via Wikimedia Commons | https://commons.wikimedia.org/wiki/File:2ND_DECK_CASEMATE,_ADDITIONAL_DECK_PROTECTION,_3_DEC._1925.jpg | Public domain (Commons) | rmhstudy card + banner | Two crops, recoloured to the app's navy and pale-blue, darkened under a veil so it acts only as texture. |
| 9 | Underwood Standard Typewriter No. 5 (colored) | Anonymous advertisement illustration (Motion Picture Magazine), via Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Underwood_Standard_Typewriter_No._5_(colored).jpg | Public domain (Commons) | rmhtype card + banner | Cropped to the key rows only (no brand lettering), converted to graphite monochrome, edge-masked. |

##### Fonts (all from Google Fonts, https://github.com/google/fonts)

| Font | Designer | Licence | Used for |
|------|----------|---------|----------|
| Big Shoulders Display | Patric King | SIL OFL 1.1 (`ofl/bigshouldersdisplay`) | rmhladder chips, badge role, level labels, logo |
| Big Shoulders Stencil Display | Patric King | SIL OFL 1.1 (`ofl/bigshouldersstencildisplay`) | rmhstudy "STUDY" and CTA |
| Anton | Vernon Adams | SIL OFL 1.1 (`ofl/anton`) | rmhladder and rmhstudy card titles |
| Instrument Serif (Italic) | Rodrigo Fuenzalida, Jordan Egstad | SIL OFL 1.1 (`ofl/instrumentserif`) | rmhmusic tagline |
| IBM Plex Mono | Mike Abbink, Bold Monday | SIL OFL 1.1 (`ofl/ibmplexmono`) | body/data text across the batch |
| DM Mono | Colophon Foundry | SIL OFL 1.1 (`ofl/dmmono`) | rmhmusic time stamps and sub-line |
| Tourney | Tyler Finck, ETC | SIL OFL 1.1 (`ofl/tourney`) | rmhstudy logo |
| Yellowtail | Brian J. Bonislawsky (Astigmatic) | Apache License 2.0 (`apache/yellowtail`) | rmhmusic title and logo |
| Special Elite | Brian J. Bonislawsky (Astigmatic) | Apache License 2.0 (`apache/specialelite`) | rmhtype title, typed text, key legends, logo |

Yellowtail and Special Elite are published by Google Fonts under Apache 2.0 rather than the OFL; both permit use and
embedding in artwork. No other fonts are used in the finished images (extra files in `fonts/` are loaded but unused).

##### Tools
Python (PIL, numpy, OpenCV GrabCut/threshold), headless Chromium via Playwright for layout and type. All noise, paper
grain, watercolour washes, halftone dots, keycaps, badge, ladder and chart/UI shapes are generated by `scripts/`.

### App art v3, batch C (Tube, Connections, RMHdle, Studio)

#### Attributions: batch C (rmhtube, rmhconnections, rmhdle, rmhstudio)

All third-party images were downloaded as untrusted data into `_assets/<name>/` and processed only as pixels.
Licence statements below are those published by the source/aggregator (Openverse record, LOC rights field).

##### Owner imagery (Marlon Jack face, rmhtube only)
- Source: the owner's existing vector portrait on the current RmhTube card (`public/images/games/rmhtube.webp`),
  via the previous artist's crop `game-art-v2/jack/work/face_vec_head.png`. Cut out with a flood-fill mask and re-treated as a
  three-plate screenprint (cream paper plate, offset red halftone plate, ink line plate) plus CRT scanlines / RGB split.
  No new likeness was generated. Used in `cards/rmhtube`, `banners/rmhtube`, `icons/rmhtube`.

##### Photographs, maps and textures
| Asset (`_assets/`) | Exact title | Creator / source | URL | Licence | Changes |
|---|---|---|---|---|---|
| tube_old_projector | "Old Film Projector" | Gary Lee Todd, Ph.D. (Flickr) | https://www.flickr.com/photos/101561334@N08/17028682361 | CC0 1.0 | GrabCut/threshold cut-out, gradient-map duotone (black-red-cream); used in rmhtube banner |
| tube_loc_projectionist | "[Motion picture projectionist operating new sound projector in theater projection booth]", c1926, LC-USZ62-49229 | Library of Congress, Prints & Photographs Division | https://www.loc.gov/pictures/item/2006686775/ | LOC rights field: "No known restrictions on publication. No renewal in the U.S. Copyright Office" | Red duotone; crops as film-strip frames (rmhtube card); blurred texture (rmhtube banner) |
| studio_nagra | "Reel-to-reel tape recorder reels used" (Kudelski/Nagra recorder, Smithsonian NMAAHC object) | via rawpixel (Smithsonian Open Access) | https://www.rawpixel.com/image/9851410/photo-image-art-vintage-tape | CC0 1.0 (as listed on Openverse/rawpixel; Smithsonian Open Access) | Inverted to an X-ray negative, cyan-to-violet gradient map with orange accent; cropped (studio card, banner, icon) |
| studio_mixer | "Mixing console" | freestocks.org (Flickr) | https://www.flickr.com/photos/135396164@N05/25668265836 | CC0 1.0 | Cyan/violet duotone, orange cables kept; faded into ground (studio card, banner) |
| studio_loc_voa | "[Men seated in control room at the Voice of America radio broadcasting studio]", 28 May 1976, LC-DIG-ppmsca-86224, Warren K. Leffler (U.S. News & World Report Magazine Collection) | Library of Congress | https://www.loc.gov/pictures/item/2024630431/ | LOC rights field: "No known restrictions on publication" | Cropped border, heavy blur, blue duotone; calm left texture of studio banner |
| dle_news | "Crosswords newspaper" | via rawpixel | https://www.rawpixel.com/image/5902029/photo-image-public-domain-pen-newspaper | CC0 1.0 (as listed on Openverse/rawpixel) | Indigo duotone, darkened, cropped (rmhdle card/banner/icon ground) |
| dle_tiles | "Crossword game" (wooden letter tiles) | via rawpixel | https://www.rawpixel.com/image/6026244/crossword-game-free-public-domain-cc0-photo | CC0 1.0 (as listed on Openverse/rawpixel) | A blank-wood patch cropped and used as tile-face texture, tinted with multiply (logo and tiles) |
| dle_brain | "Brain: dissection showing gyri, seen from above" (hand-coloured anatomical plate, XV) | via rawpixel (digitised public-domain plate) | https://www.rawpixel.com/image/13970624/image-art-ocean-sea | CC0 1.0 (as listed on Openverse/rawpixel) | Brain cut out with a hand-drawn spline mask, re-mapped to indigo ink / cream, set in a blurple speech bubble |
| conn_cork | "Cork board texture" | via rawpixel | https://www.rawpixel.com/image/5903400/cork-board-texture-free-public-domain-cc0-photo | CC0 1.0 (as listed on Openverse/rawpixel) | Dark violet gradient map blended with 22% of original colour, vignette, grain |
| conn_map | "Old map" (19th-century fortified-city plan) | via rawpixel | https://www.rawpixel.com/image/6035391/old-map-free-public-domain-cc0-photo | CC0 1.0 (as listed on Openverse/rawpixel) | Cropped, tone-mapped to indigo ink on cream, torn-edge clip, pinned behind notes |

Notes: rawpixel items were found via Openverse (licence filter CC0). Where the aggregator lists no creator, none is given here.
Wikimedia Commons was rate-limiting the sandbox and nothing from it was used. Everything else (notes, pins, thread, tiles'
states, film strip, sprockets, test bars, scanlines, waveforms, dust, grain, paper fibre texture) is generated by `scripts/`.

##### Fonts (all SIL Open Font License 1.1; fetched from https://github.com/google/fonts, `ofl/<family>/`, kept in `fonts/`)
- Limelight (Eduardo Tunni): RmhTube logo. https://github.com/google/fonts/tree/main/ofl/limelight
- Instrument Serif (Rodrigo Fuenzalida, Jordan Egstad): RmhTube tagline. .../ofl/instrumentserif
- Share Tech Mono (Carrois Apostrophe): RmhTube timecodes. .../ofl/sharetechmono
- Monoton (Vernon Adams): RMH Studio logo. .../ofl/monoton
- Syne (Bonjour Monde): RMH Studio taglines and chips. .../ofl/syne
- DM Mono (Colophon Foundry): RMH Studio/RMHdle small text. .../ofl/dmmono
- Courier Prime (Quote-Unquote Apps): RMHConnections logo and label text. .../ofl/courierprime
- Jost (Owen Earl): RMHdle tile letters. .../ofl/jost
- Playfair Display (Claus Eggers Sorensen): RMHdle caption. .../ofl/playfairdisplay

##### Tools
Python 3 (PIL, NumPy, OpenCV GrabCut, SciPy splines), headless Chromium via Playwright for type/layout. No generative image models.

### App art v3, batch D (Strategies; RMHcode and RMHbox banners and icons)

#### Batch D attributions (rmhstrategies, rmhcode, rmhbox)

All downloaded files were treated as image data only (each in its own folder under `_assets/`, read with `python3 -I`).
Build scripts: `scripts/`. Work files: `work/`.

##### Owner's own imagery (existing RMH cards, not third-party)
- `rmhbox.webp` card (face-in-box): cut out with an alpha mask (threshold + hole fill), used unaltered in the rmhbox banner and icon (scaled only).
- `rmhcode.webp` card (face): head-and-shoulders cut out with OpenCV GrabCut seeded by a skin/hair colour mask, feathered; cyan rim glow added around it. Face itself not retouched or distorted. Cut off above the chest.
- `rmhstrategies.webp` card: ONLY the "Sahur" wooden-bat figure was reused (a 174px crop, upscaled and sharpened, shown in a gold-ringed roundel). The "03:00 AM" clock is re-typeset in VT323 (not cropped). The two human portraits on that card were NOT used.

##### rmhstrategies
- **A Plan of Operations of the King's Army, under the Command of General Sir William Howe, K.B., in New York and East New Jersey ... 1776**, Claude Joseph Sauthier (engraved by William Faden), Feb 25, 1777. The Metropolitan Museum of Art, Bequest of Charles Allen Munn, 1924, object 384833. https://www.metmuseum.org/art/collection/search/384833 (image DP-44832-001). Licence: The Met Open Access, CC0. Changes: cropped (card: portrait crop that avoids the title cartouche; banner: rotated, strip crop), converted to a warm ink/parchment tone map, vignette, paper grain; vermilion campaign arrows and compass rose added.
- **Knight Chess Piece**, ca. 1250, walrus ivory, The Met, Gift of J. Pierpont Morgan, 1917, object 464233. https://www.metmuseum.org/art/collection/search/464233 (image DP277659). Licence: Met Open Access, CC0. Changes: cut out from the grey studio backdrop (GrabCut), feathered, drop shadow, slight contrast.
- **Manuscript pages showing battle scenes**, early 17th century, ink and pigments on paper, The Met, Rogers Fund, 1980, object 24880. https://www.metmuseum.org/art/collection/search/24880 (image LC-1980_286_1-002). Licence: Met Open Access, CC0. Changes: ONLY the top strip (the trumpeters under a blue sky) was cropped and used as a framed frieze; the battle below was left out.

##### rmhcode
- **16Kb Rope Core Memory Board from Wagner WAC-40.jpg**, Richstraka (own work), Wikimedia Commons. https://commons.wikimedia.org/wiki/File:16Kb_Rope_Core_Memory_Board_from_Wagner_WAC-40.jpg. Licence: CC0. Changes: cropped, mapped to a navy/electric-blue/cyan duotone, shaded, masked and grain added.
- **Macro photograph of the RP2350 microcontroller on a Raspberry Pi Pico 2 board.jpg**, Profpcde (own work), Wikimedia Commons. https://commons.wikimedia.org/wiki/File:Macro_photograph_of_the_RP2350_microcontroller_on_a_Raspberry_Pi_Pico_2_board.jpg. Licence: CC0. Changes: only the copper-trace area (no chip, no logo) cropped, rotated, mirrored, blue duotone, darkened.
- The play-triangle mark is redrawn in SVG from the existing rmhcode card identity.

##### rmhbox
- **Cardboard-546867.jpg** (cardboard amber sheet texture), Humusak, via Pixabay https://pixabay.com/photos/cardboard-amber-sheet-texture-546867/ ; Wikimedia Commons page https://commons.wikimedia.org/wiki/File:Cardboard-546867.jpg. Licence: CC0 (as tagged on Commons). Changes: blurred, blue duotone as the ground texture; a small crop kept natural as the kraft shipping label.
- **Board from a wooden shipping crate with stencil "Glass With Care" and hand lettering "Bath B(?)"**, [1910], Miscellaneous Items in High Demand, Prints & Photographs Division, Library of Congress, LCCN 2010651505. https://www.loc.gov/pictures/item/2010651505/ (file https://cdn.loc.gov/service/pnp/ppmsca/30500/30567v.jpg). LoC rights: "No known restrictions on publication"; Wikimedia Commons tags it Public domain. Changes: cropped to the board, drop shadow, rotated slightly. (A LoC no-known-restrictions statement is not a formal PD certification.)
- Stamps ("FRAGILE", "THIS SIDE UP", arrows pictogram), tape and halftone are original drawings.

##### Fonts (all SIL OFL 1.1, from https://github.com/google/fonts, `ofl/<family>/`; files in `fonts/`)
- Almendra Bold / Regular (ofl/almendra): strategies logo, card title, mode names.
- Cormorant SC Bold (ofl/cormorantsc): card small caps label.
- IM Fell DW Pica and IM Fell DW Pica Italic (ofl/imfelldwpica): card subtitle.
- VT323 (ofl/vt323): "03:00 AM" clock.
- Unbounded (ofl/unbounded): rmhcode logo.
- Martian Mono (ofl/martianmono): rmhcode banner terminal tags.
- Stardos Stencil Bold (ofl/stardosstencil), Black Ops One (ofl/blackopsone): rmhbox stamps and label. (Inter is loaded for a hidden element only.)
Other OFL fonts in `fonts/` were specimen candidates and are not used in the outputs.

##### Tools
Python PIL / numpy / OpenCV (GrabCut), headless Chromium via Playwright. No Valve/brand art, no stock photos beyond those listed.

### Library banners, batch E (Hearthworks, Altair, Counter-Strike, Half-Life 2, Portal)

#### Game banners v3 (E): attributions

No new third-party assets were downloaded or used. Every source below is already credited in the earlier files
(`game-art-v2/ATTRIBUTIONS.md`, `game-art-v2/ATTRIBUTIONS-temple-of-joy.md`, `hearthworks-brand/ATTRIBUTIONS.md`); one line each.
No fonts are used (no text is rendered in any banner). Nothing from Valve (art, logos, key art) is used; csgo, half-life-2 and portal
keep the drawn-from-scratch look (lambda disc, crosshair, portal rings, stick-figure test subject are drawn in code).

| Banner | Asset | Where credited earlier | Changes in this pass |
|---|---|---|---|
| altair | NASA / MSFC, "Ben Franklin" PX-15 interior, NASA id 6900903 (public domain) | game-art-v2/ATTRIBUTIONS.md | Wide re-crop, cyan duotone, magenta misregistration, scanlines, glitch slices, amber doorway and slim echo figure drawn over the real person |
| csgo | Library of Congress, Matson Collection, "Jerusalem, Damascus Gate" (15028u.tif; no known restrictions) | game-art-v2/ATTRIBUTIONS.md | Right-hand tower and battlements re-cropped wide; sky mask rebuilt; black, orange and blue halftone plates on paper; crosshair drawn |
| half-life-2 | Library of Congress / HAER NY-241, "Standard Elevator, Buffalo" (350161pv; US Government work) | game-art-v2/ATTRIBUTIONS.md | Re-cropped, black and orange halftone plates on a grey panel; spire, skyline, fence, lambda disc and crowbar drawn |
| portal | NASA / KSC, "Dawn Spacecraft Processing", KSC-07PD-0861 (public domain) | game-art-v2/ATTRIBUTIONS.md | Two window crops (one flipped) as blue and orange halftone inside drawn portal rings |
| hearthworks | Kenney "Isometric Landscape" and "Isometric Miniature Farm" (CC0), recoloured islets | hearthworks-brand/ATTRIBUTIONS.md | Islets re-laid out and re-scaled for the crop; wordmark, tagline and pills removed |
| hearthworks | The Met Open Access, "Bird's-Eye View of a French Chateau and Formal Garden" (object 913662, CC0), teal duotone plan from game-art-v2/_w_hearth/garden.png | game-art-v2/ATTRIBUTIONS-temple-of-joy.md | Re-used as a faint (about 16 percent) feathered teal engraving texture in the left/middle sky |

Everything else (clouds, cogs, leaves, bubbles, paper, grid, grain, scanlines, rings, figures) is drawn procedurally in `scripts/`.

### Library banners, batch F (Dream Rift, Gabriel's Horn, Kowloon Knockout, Slice It, Synapse Storm)

#### Attributions: game banners v3 (dream-rift, gabriels-horn, kowloon-knockout, slice-it, synapse-storm)

No new third-party assets were used in this round. Every source image was already downloaded and credited in
`game-art-v2/ATTRIBUTIONS*.md` for the cards; the banners re-use them (re-processed for a 1920x640 format).
All are public domain / CC0 as listed there. Fonts are not used (the banners carry no title text).

- dream-rift: Utagawa Hiroshige, "Wild Geese Flying under the Full Moon", ca. 1833, The Met (Open Access, CC0, object 36742). Re-used via the card's recoloured print (violet/cyan/pink, pixel dissolve), here as a feathered oval moon window under the bullet rings. Bullet rings, core and pixel player are the previous banner's own artwork.
- gabriels-horn: Jusepe de Ribera, "Saint Jerome Hearing the Trumpet of the Last Judgment", etching, ca. 1621, The Met (Open Access, CC0, object 397952). Re-used as a faint gold-foil etching (angel, wings, clouds) behind the horn. Horn, dice, cards and sunburst are the previous banner's own artwork; harlequin lattice is procedural.
- kowloon-knockout: Wonderlane, "Neon sign of the world ... Hong Kong 1990" (Flickr, CC0 1.0, https://www.flickr.com/photos/71401718@N00/14469754044). Re-used as a pink halftone texture behind the neon skyline. Neon fighters and kanji signs are the previous banner's own artwork (digits/text on signs unchanged: single kanji props only).
- slice-it: William P. Gottlieb, "Portrait of Sid Catlett, ca. Mar. 1947", Library of Congress (item 2023867522, public domain per the photographer's wishes). Re-used as the card's cyan/pink line-screen of the raised hand, stick and cymbal; the face is outside the crop. Lane, blades, laser and EQ bars are the previous banner's own artwork; groove rings are procedural.
- synapse-storm: S. Ramon y Cajal, "Histologie du systeme nerveux de l'homme et des vertebres" (Paris 1909), Fig. 60, Internet Archive item `b21270879_001` (public domain by age); rawpixel "lightning bolt storm" (CC0 / public domain, https://www.rawpixel.com/image/3285791/free-photo-image-nature-storm-lightning). Re-used as glowing neuron line-art (labels and caption removed) and thin lightning forks. Orb, rings, bolts and tiles are the previous banner's own artwork (numerals in the tiles replaced by pictograms).

Build scripts: `game-banners-v3/Fsrc/build_{dr,gh,kk,si,ss}.py` (+ `lib3.py`, `sim.py`).

### Library banners, batch G (Daily Puzzles, House Always Wins, Laundry Sort, Neon Driftway, Temple of Joy)

#### Attributions: game banners v3 (daily-puzzles, house-always-wins, laundry-sort, neon-driftway, temple-of-joy)

No new third-party assets were downloaded for this round. Every sourced asset below was already credited in the earlier files
(`game-art-v2/ATTRIBUTIONS-daily-puzzles.md`, `ATTRIBUTIONS-neon-driftway.md`, `ATTRIBUTIONS-temple-of-joy.md`, `ATTRIBUTIONS.md`).
All are public domain / CC0 / SIL OFL. The vector scenes (cards, globe, arch, car, skyline, clouds, smileys, bubbles) are original work drawn procedurally (SVG / numpy).

##### Reused, already credited
- daily-puzzles: "Cross Word Puzzle Book, 1st series" (1924), Internet Archive `crosswordpuzzleb00unse`, public domain. Used only as a faint violet line plate (numerals and header text filtered out, pink black squares tinted) behind the cards. Changes: line extraction, re-tint, low opacity.
- house-always-wins: Carol M. Highsmith, "Neon casino sign, Las Vegas" (LoC LC-DIG-highsm-17922), no known restrictions. Only the lower bulb field (no lettering) is used, as blurred gold bokeh on the left. Changes: crop, highlight threshold, blur, gradient map.
- laundry-sort: "1919 advertisement for Voss washing machine" (Flickr, Matthew Paul Argall, Public Domain Mark 1.0). Only the tubs, taps, wringer and basket are used, as a pale navy line plate on the left; the "HOT/COLD" and brand lettering are cropped out. Changes: crop, tint, 17% opacity, feathered mask.
- temple-of-joy: Classic Veracruz "Smiling figure (Sonriente)", The Met, object 313386, CC0. Reuses the existing die-cut tritone figure layer (`_w_temple/fig.png`) and the card's paper texture (`_w_temple/paper.png`, procedural). Changes: rescaled, shadow added.
- neon-driftway: no photo layer used in the banner (the card's rawpixel long-exposure plate was evaluated and left out); the scene is fully procedural.

##### Fonts (SIL OFL, Google Fonts, from `game-art-v2/_fonts`)
- Alfa Slab One: the small "CASINO" marquee prop above the arch (house-always-wins, already credited).
- Fredoka: the "7" on the calendar prop (daily-puzzles). New to the banner set, OFL.

### Library banners, batch H (Velum 2099, Versecraft, Void Breaker, Nightrail)

#### Attributions: game banners v3 (velum2099, versecraft, void-breaker, nightrail)

No new third-party assets were downloaded for this batch. Everything is re-composited from sources already credited in earlier attribution files (`game-art-v2/ATTRIBUTIONS-temple-of-joy.md`, `ATTRIBUTIONS-neon-driftway.md`, `jack/ATTRIBUTIONS.md`). No game title, wordmark or tagline appears in any banner.

- **velum2099**: "Alone in Tokyo III" (Wikimedia Commons, CC0 1.0), the same photo as the card. Already credited in `ATTRIBUTIONS-temple-of-joy.md`. Changes for the banner: re-cropped to a wide format, placed right, regraded and re-screened as the card's cyan/magenta riso halftone (cell 7 px); left side is the same photo mirrored, blurred and inked faintly; registration target and corner bracket drawn by us.
- **void-breaker**: Cat's Eye Nebula, NASA / ESA / HEIC / Hubble Heritage Team, NASA id `GSFC_20171208_Archive_e002155` (public domain). Already credited in `ATTRIBUTIONS-temple-of-joy.md`. Changes: obsidian-to-gold halftone re-rendered at banner scale (arena disc and a wide glow field, one faint mirrored copy on the left); rings, ticks, shards, ship, enemies, hazard stripes and hex grid drawn by us.
- **nightrail**: Chicago and North Western rail yard at night, FSA/OWI, Library of Congress, LC-USW3-012681-D (no known restrictions). Already credited in `ATTRIBUTIONS-neon-driftway.md`. Changes: crop inside the film rebate (frame number and rebate excluded), same black-plum/violet/amber/cream tritone as the card, placed right with a soft left feather into a matching plum sky, amber bloom on the lamps, paper texture and grain. The small lettering on the boxcar is part of the photograph.
- **versecraft**: the owner's illustrated figure, cut out earlier for the banner (`jack/work/vc_fig.png`, from the original card art `oldcards/versecraft.webp`); alpha edge eroded about 2 px to remove a sky fringe, otherwise unaltered, face and body untouched. The out-of-focus hedge on the left is a crop of the same card's painted garden (no text in the crop). Palms, house, pool and sky are our own vector drawing (as in the previous banner), shaded and re-lit.

Fonts: none used (no text in any banner). Tools: Python (PIL, numpy, OpenCV), headless Chromium via Playwright. Build scripts: `game-banners-v3/scripts/`.

### Banner redo (v4), apps: batch A

#### Attributions: v4 banners, batch A (new third-party assets only)

Everything listed in `../../app-art-v3/A/ATTRIBUTIONS.md` still applies (same face imagery, same fonts, same NASA/LoC/Commons sources). The v4 banners add the following.

| Asset (exact title) | Creator / source | URL | Licence | Used in | Changes |
|---|---|---|---|---|---|
| NASA image GRC-1956-C-41394 (Rolls Royce Avon RA-14 Engine in the Altitude Wind Tunnel, 1956) | NASA Lewis (Glenn) Research Center | https://images-assets.nasa.gov/image/GRC-1956-C-41394/GRC-1956-C-41394~medium.jpg | NASA media, public domain (credit NASA) | rmh-tf2-hud banner, left side | Greyscale, red duotone, faded with a mask, dimmed, grain |
| NASA image GRC-1950-C-26414 (Noise Suppression Addition to the 8- by 6-Foot Supersonic Wind Tunnel, 1950) | NASA Lewis (Glenn) Research Center | https://images-assets.nasa.gov/image/GRC-1950-C-26414/GRC-1950-C-26414~medium.jpg | NASA media, public domain (credit NASA) | rmh-tf2-hud banner, right side | Greyscale, blue duotone, faded with a mask, grain |
| NASA image GRC-1951-C-27174 (NACA Computer at the Lewis Flight Propulsion Laboratory, 1951) | NASA Lewis (Glenn) Research Center | https://images-assets.nasa.gov/image/GRC-1951-C-27174/GRC-1951-C-27174_medium.jpg (via images-assets.nasa.gov/image/GRC-1951-C-27174) | NASA media, public domain (credit NASA) | rmhcalculator banner (taped print "Friden, 1951") | Cropped to the Friden calculator only (the person in the photo is cut out of frame), blue duotone, dimmed |
| Compass rose from "Sanborn Fire Insurance Map from Boston, Suffolk County, Massachusetts" (East Boston sheet 5, 1900) | Sanborn Map Company, Library of Congress | https://www.loc.gov/item/sanborn03693_012/ | Public domain (LoC Sanborn Maps Collection) | rmhhomes banner | Cropped from the sheet, inverted to cream-on-transparent, dimmed |

New in-house drawn elements: house elevation line drawing, route line, circular stamp, ghost HUD panels, slide-rule scale, plotted curves, bib and print props. Fonts are unchanged from v3 (all SIL OFL 1.1, Google Fonts).

### Banner redo (v4), apps: batch C

#### Attributions: batch C v4 banners
No new third-party assets were added in v4. The banners reuse the v3 batch C assets, all documented with title, creator, URL,
licence and changes in `../../app-art-v3/C/ATTRIBUTIONS.md` (copies live in `_assets/`; fonts in `fonts/`, all SIL OFL 1.1):
- rmhtube: LOC c1926 projectionist photo (no known restrictions), "Old Film Projector" (CC0), owner's existing face portrait.
- rmhconnections: "Cork board texture" (CC0), "Old map" (CC0).
- rmhdle: "Crosswords newspaper", "Crossword game" tiles (CC0).
- rmhstudio: "Mixing console" (freestocks.org, CC0), Nagra reel-to-reel (Smithsonian, CC0), LOC Voice of America control room (no known restrictions).
New in v4 but generated, not third-party: VU meters, LED columns, crossword grid, polaroid/index-card props, film-strip frames.

### Banner redo (v4), apps: batch D

#### v4 banners: attributions for NEW third-party assets
Everything else (Met map, knight, manuscript strip; rope-core and PCB photos; cardboard texture; LoC crate board; the owner's face cut-outs; fonts) is unchanged from `app-art-v3/D/ATTRIBUTIONS.md`.

- **Queen Chess Piece**, 13th century, whale ivory, The Metropolitan Museum of Art, Pfeiffer Fund, 2012, object 479682. https://www.metmuseum.org/art/collection/search/479682 (image DP285164). Licence: Met Open Access, CC0. Changes: cut out from the grey backdrop (GrabCut), feathered; used full-colour mid-ground and dimmed/sepia-toned as receding "shadow pieces" in the rmhstrategies banner.
- **[Trademark registration by Alfred Joseph Warne-Browne for W.B. brand Packing Boxes and Cases]**, 1910, Library of Congress Prints & Photographs Division, TRADEMARKS no. 79175. https://www.loc.gov/item/2026706247/ (file https://tile.loc.gov/storage-services/service/pnp/trmk/1t70000/1t79000/1t79100/1t79175v.jpg). LoC rights: "No known restrictions on publication." Changes: only the engraved fish emblem was cropped, thresholded to an ink-only alpha layer and tinted RMH blue as a ghosted, tone-on-tone mark in the rmhbox banner.
- **[Trademark registration by Trusweve Package Manufacturing Company for Insuloid brand Woven Slat Packing Cases]**, 1911, Library of Congress Prints & Photographs Division, TRADEMARKS no. 80818. https://www.loc.gov/item/2026707861/ (file https://tile.loc.gov/storage-services/service/pnp/trmk/1t80000/1t80000/1t80800/1t80818v.jpg). LoC rights: "No known restrictions on publication." Changes: only the hand-cut stencil word was cropped, thresholded to an ink-only alpha layer and tinted blue as a ghosted background mark (historic ephemera, low contrast; not a claim of any brand association).
- Fonts used in v4 are the same OFL families as v3 (Almendra, IM Fell DW Pica, VT323, Martian Mono, Stardos Stencil, Black Ops One, all SIL OFL 1.1 from google/fonts).
- Code panels, terminal text, stamps, tape, pins and thread are original drawings/typesetting.

### Banner redo (v4), games: batch E

#### Game banners v4 (E): attributions

Open licences only: NASA media and US Government works are public domain; Library of Congress items carry no known restrictions; the Met item is CC0; Kenney assets are CC0. Nothing from Valve is used. No fonts are rendered as part of any game name (micro-type only: Space Mono, Courier Prime, Share Tech Mono, DM Mono, all SIL OFL, already used in game-art-v2).

##### NEW assets (not credited in earlier files)
| Banner | Asset | Creator / source | Licence | Changes |
|---|---|---|---|---|
| altair | "Skylab" (NASA id 0102625): engineers testing the twin-pole sunshade at the Skylab mockup, MSFC Building 4619, May 1973 | NASA / Marshall Space Flight Center. https://images.nasa.gov/details/0102625 (file `0102625~orig.jpg`) | NASA media, public domain | Mirrored to fill, softened, cyan duotone, darkened as the receding backdrop |
| half-life-2 | HAER NY-289-1, grain elevators along the water, Buffalo NY (photo file `350072pv`; exact record title not retrieved) | Historic American Engineering Record, Library of Congress, Prints & Photographs Division | US Government work, public domain | Cropped inside the film border, mirrored to fill, black and orange halftone plates, burned and desaturated on the left |
| portal | "Clean Room in the Zero Gravity Research Facility" (NASA id GRC-1968-C-02344), 1968 | NASA Glenn (Lewis) Research Center. https://images.nasa.gov/details/GRC-1968-C-02344 | NASA media, public domain | Halftone observation window; also a ghosted wall texture |
| portal | "Clean Room Facility" (NASA id GRC-2016-C-02363), 2016 | NASA Glenn Research Center. https://images.nasa.gov/details/GRC-2016-C-02363 | NASA media, public domain | Flipped, blue halftone duotone observation window |
| portal | "Dawn Spacecraft Processing" (NASA id KSC-07PD-0862), 2007-04-10 | NASA Kennedy Space Center. https://images.nasa.gov/details/KSC-07PD-0862 | NASA media, public domain | Cropped, orange halftone duotone observation window |

##### Already credited earlier (one line each)
- altair: NASA/MSFC "Ben Franklin" PX-15 interior, id 6900903 (game-art-v2/ATTRIBUTIONS.md): re-cropped large, cyan duotone, magenta misregistration, amber door and echo figure drawn.
- csgo: LoC Matson Collection "Jerusalem, Damascus Gate", 15028u.tif (game-art-v2/ATTRIBUTIONS.md): full-bleed black, orange and blue halftone plates on paper, mirrored on the left.
- half-life-2: LoC / HAER "Standard Elevator, Buffalo", 350161pv (game-art-v2/ATTRIBUTIONS.md): the card's tower plate, re-cropped.
- portal: NASA/KSC "Dawn Spacecraft Processing", KSC-07PD-0861 (game-art-v2/ATTRIBUTIONS.md): the two portal windows.
- hearthworks: Kenney "Isometric Landscape" and "Isometric Miniature Farm" islets, recoloured (hearthworks-brand/ATTRIBUTIONS.md); the Met Open Access "Bird's-Eye View of a French Chateau and Formal Garden", object 913662 (game-art-v2/ATTRIBUTIONS-temple-of-joy.md), used as the full-bleed engraved teal plan.

Everything else (rings, lambda disc, crosshair, figures, labels, barcodes, clouds, grids, grain, scanlines) is drawn procedurally in `scripts/`.

### Banner redo (v4), games: batch F

#### Attributions: game banners v4 (dream-rift, gabriels-horn, kowloon-knockout, slice-it, synapse-storm)

No NEW third-party assets. Every source was already downloaded and credited for the cards in `game-art-v2/ATTRIBUTIONS*.md`
(all CC0 / public domain); the banners re-process them at a larger scale. Two Wikimedia Commons CC0 Hong Kong night photos
(Wilfredor) were looked at for kowloon-knockout but the download was rate-limited (HTTP 429), so they are NOT used.

- dream-rift: Utagawa Hiroshige, "Wild Geese Flying under the Full Moon", c. 1833, The Met (CC0, object 36742), rotated 90 degrees and re-coloured (violet night, lilac moon, cyan wing patches, pink seals), pixel-dissolved toward the left. Bullets and micro-type are own drawing.
- gabriels-horn: Jusepe de Ribera, "Saint Jerome Hearing the Trumpet of the Last Judgment", etching c. 1621, The Met (CC0, object 397952), full-bleed gold foil with lilac under-print. Horn, dice and sunburst from the previous banner art.
- kowloon-knockout: Wonderlane, Hong Kong 1990 street (Flickr, CC0 1.0), pink + yellow halftone plates. Neon fighters and kanji signs from the previous banner art (decorative scene props).
- slice-it: William P. Gottlieb, Sid Catlett, c. 1947, Library of Congress (public domain per the photographer); cymbal/drum-kit area only, no face, as cyan and pink line-screens cut by the laser.
- synapse-storm: S. Ramon y Cajal, Histologie du systeme nerveux (Paris 1909), Fig. 60, Internet Archive `b21270879_001` (public domain by age); rawpixel "lightning bolt storm" (CC0 / public domain).
- Fonts (SIL OFL, already credited): Silkscreen, DotGothic16, Share Tech Mono, IBM Plex Mono, IM Fell English / English SC, IM Fell Pica Italic.

Scripts: `game-banners-v4/Fsrc/build_{dr4,gh4,kk4,si4,ss4}.py`, `lib4.py`, `sim.py`.

### Banner redo (v4), games: batch G

#### Attributions: game banners v4 (daily-puzzles, house-always-wins, laundry-sort, neon-driftway, temple-of-joy)

Only open licences. Everything is re-printed (halftone / riso plates / tritone maps, cropped, grained); nothing is used as found.

##### New in v4
- **"Highway light trains at night (Unsplash)"**, Wikimedia Commons, https://commons.wikimedia.org/wiki/File:Highway_light_trains_at_night_(Unsplash).jpg . Licence: CC0 (as listed in the Commons file search; the Commons description page was not re-fetched because the API rate-limited the follow-up request, so the photographer's name is not recorded here). Used in neon-driftway as the main photo layer. Changes: mirrored, cropped, split into a cyan plate (white trails) and a pink plate (red trails), re-printed as 6.5 px AM halftones with 2-3 px misregistration, screen-blended on near-black stock.
- **"Fragmentary Smiling Figure" (Remojadas, 6th-9th c.)**, The Metropolitan Museum of Art, object 312773, https://www.metmuseum.org/art/collection/search/312773 (image `1979.206.577`). Licence: Met Open Access, CC0. Used in temple-of-joy twice: as a large tone-on-tone brown halftone ghost on the left, and as a die-cut tritone cutout on the right. Changes: cut from the grey backdrop with GrabCut, re-mapped to a brown/gold tritone, shadow halftone, cream die-cut border. (It was already downloaded for the v2 card work, in `_a_temple/`, but was not used there.)
- Fonts (SIL OFL, from `game-art-v2/_fonts` or the earlier `_tools/fonts`): IBM Plex Mono (micro-type on neon-driftway, house-always-wins, temple-of-joy, daily-puzzles), Gloock (the "$1,000,000" marker on house-always-wins), Instrument Serif Italic (loaded, not shown), Racing Sans One (the "88" speed-limit sign), Fredoka, Abril Fatface, Alfa Slab One, Anton, Rozha One (daily-puzzles tiles), Shrikhand and Space Mono (laundry-sort labels).

##### Downloaded for evaluation, NOT used (in `game-banners-v4/dl/`)
- Highsmith, "Neon sign of the old Lucky Motel" (LoC 2023697166), "Neon sign of the Ambassador Hotel" (LoC 2023697164), "Fremont East District sign" (LoC 2023697163): Library of Congress, Carol M. Highsmith, public-domain dedication. Not used.
- Commons "Tel aviv panoramapublic domain 4.jpg" (CC0) and "Schlossbergtunnel in Tübingen bei Nacht 2019 001.jpg" (CC0): not used.

##### Reused, already credited in earlier files (`game-art-v2/ATTRIBUTIONS*.md`)
- daily-puzzles: 1924 "Cross Word Puzzle Book" page (Internet Archive `crosswordpuzzleb00unse`, public domain) via the card's grid plate `daily-puzzles/work/grid.png`, mirrored to run full width.
- house-always-wins: Carol M. Highsmith "Neon casino sign, Las Vegas" (LoC LC-DIG-highsm-17922) as the full-width canopy plate and bokeh; Highsmith "Vintage slot machine at the Casino Legends Hall of Fame" (LoC 2011631860), previously downloaded but NOT used on the card, is now used as a cut-out hero prop (no known restrictions; Highsmith public-domain dedication).
- laundry-sort: F. E. Church "Laundry Hung Out to Dry" (Cooper Hewitt, Smithsonian Open Access, CC0); 1919 Voss washing-machine ad (Flickr, Matthew Paul Argall, Public Domain Mark); Wells' Smoke Shop postcard "Wash-Day at a Mountain Home, Asheville" (Flickr, PDM; downloaded earlier, now used as the navy halftone on the left).
- temple-of-joy: Met 313386 "Smiling figure (Sonriente)", CC0, via the card's die-cut `_w_temple/fig.png` and paper texture.
- All vector scenes (cards, globe, arch, dealer silhouette, chips, dice, playing cards, skyline, smileys, plinth, speed-limit sign) are original procedural work.

### Banner redo (v4), games: batch H

#### Attributions: game banners v4 (velum2099, versecraft, void-breaker, nightrail)

No new third-party asset was downloaded for this batch; everything is re-composited from sources already credited in earlier files (`game-art-v2/ATTRIBUTIONS-temple-of-joy.md`, `ATTRIBUTIONS-neon-driftway.md`, `jack/ATTRIBUTIONS.md`). Only open licences. No game name appears in any banner. (The Ring Nebula, GSFC_20171208_Archive_e001464, was considered and left out: its credit line includes ground-based data from a third party.)

- **velum2099**: Wikimedia Commons CC0 photo "Alone in Tokyo III" (47956673191, the same photo as the card), already credited. Changes: re-cropped and placed right at a larger scale; a mirrored, defocused copy of its upper street/neon area continues the scene leftwards; cyan/magenta riso halftone (7 px cell, misregistered magenta plate), cool rim light on the courier, bloom and light leaks. The courier slip, red stamp (kanji for "out for delivery"), HUD brackets and route text are our own typesetting (fonts OFL: Dela Gothic One, DotGothic16, IBM Plex Mono). A second Commons photo (a tunnel, 50318810096) was tried and removed because its licence could not be re-verified (Commons API rate-limited).
- **void-breaker**: NASA / ESA / HEIC / Hubble Heritage Team, Cat's Eye Nebula, id `GSFC_20171208_Archive_e002155` (public domain), already credited. Changes: gold halftone re-rendered at banner scale (arena disc, wide field, two faint rotated copies on the left); rings, ticks, shards, ship, enemies, hazard stripes, hex grid and micro-type drawn by us (IBM Plex Mono, OFL).
- **nightrail**: Library of Congress FSA/OWI, LC-USW3-012681-D (no known restrictions), already credited. Changes: crop inside the rebate, card tritone, enlarged; the right-hand half of the same frame mirrored and darkened to continue the yard to the left; amber bloom, paper texture, film grain. Timetable strip, tape, stamp and waybill text are our own (IBM Plex Mono, OFL). Lettering on the boxcar is part of the photograph.
- **versecraft**: the owner's illustrated card art (`oldcards/versecraft.webp`) with the owner's figure untouched, scaled 1.26x and placed right; the left of the scene continues the same painting (mirrored garden strip from the card's own left edge, defocused and shaded), plus soft light rays and grain. No text.

Tools: Python (PIL, numpy, OpenCV), headless Chromium via Playwright. Scripts: `game-banners-v4/scripts/`.

## Art round 4 (2026-11-05): 2x cards, banners and icons

Every card (1600 px wide), banner (3840x1280) and icon (1024x1024) was re-rendered at twice the earlier resolution, with higher-resolution masters re-fetched where the source offered them. The RMHcode and RMHbox cards were not changed (only their banners and icons). Sources that were only available at lower resolution are upscaled with Lanczos and a mild unsharp, with grain carrying the texture; each batch says which. The earlier rounds' attributions above still apply to the assets they list; the entries below add the newly fetched masters.

### 2x batch A (apps: Dunesday, TF2 Hub, Calculator, Homes)

#### Attributions: hires-v5, batch A

All sources, licences, fonts and the face provenance from `../../app-art-v3/A/ATTRIBUTIONS.md` and `../../app-art-v4/A/ATTRIBUTIONS.md` still apply. This pass re-renders at 2x using higher-resolution versions of the same works. No new works were added.

Higher-resolution files used (same works, same licences):
| Work | File now used | Source URL |
|---|---|---|
| The Active Dunes of Nili Patera (PIA18244), NASA/JPL-Caltech/Univ. of Arizona | `~orig.jpg` 2880x1800 (was 1280x800) | https://images-assets.nasa.gov/image/PIA18244/PIA18244~orig.jpg |
| GRC-1956-C-41394, GRC-1950-C-26414, GRC-1951-C-27174, GRC-1955-C-39782 (NASA Glenn/Lewis) | `~orig.jpg` 2048x1536 (were 1280x960) | https://images-assets.nasa.gov/image/<id>/<id>~orig.jpg |
| LRC-1957-B701_P-00959 (NASA Langley) | `~large.jpg` 1920x1378 (no larger public derivative was fetched) | https://images-assets.nasa.gov/image/LRC-1957-B701_P-00959/LRC-1957-B701_P-00959~large.jpg |
| LoC LC-USZ62-29325 (Elphinstone), LC-USZ62-33733 (Dorando), LC-USZ62-111275 (Brooklyn marathon), Bain Collection; "No known restrictions on publication" | LoC master TIFFs (1258x1536, 1536x1154, 4096x3291; were 524x640, 640x481, 640x514) | https://tile.loc.gov/storage-services/master/pnp/cph/3a30000/3a30000/3a30000/3a30001u.tif ; https://tile.loc.gov/storage-services/master/pnp/cph/3a30000/3a34000/3a34200/3a34239u.tif ; https://cdn.loc.gov/master/pnp/cph/3c10000/3c11000/3c11200/3c11275u.tif |
| Sanborn Fire Insurance Map, Boston (East Boston), 1900, sheet 5; LoC, public domain | Native-resolution (5583x7987) IIIF regions cut for card/banner/icon/compass rose | https://tile.loc.gov/image-services/iiif/service:gmd:gmd376m:g3764m:g3764bm:g03693190005:03693_05_1900-0005/ |
| HP 9100A Calculator 1968.jpg (Swtpc6800, Commons, public domain) | original 1305x1125 (already the full size on Commons) | https://commons.wikimedia.org/wiki/File:HP_9100A_Calculator_1968.jpg |

Changes are as in v3/v4 (crop, greyscale, gradient-map/duotone, grain), now done on the 2x grid with Lanczos and a mild unsharp when a source is enlarged. Output webps carry a very light (sigma 0.9 level) dither before encoding to avoid banding.

### 2x batch B (apps: Ladder, Music, Study, Type)

#### Attributions: batch B (RMH Ladder, RMH Music, RMH Study, RMH Type), hi-res v5 (2x) re-render

Everything below was downloaded to `_assets/<name>/` (each with a `meta.json` holding the licence data returned by the
source API) and treated as image data only. Only public-domain / CC0 material is used. All assets were fetched on
2026-11-05 through the Wikimedia Commons API and the Metropolitan Museum Open Access API.

##### Face imagery (owner's own, not third party)
Every face is derived from the owner's existing "Marlon Jack" cards (`scratchpad/oldcards/`, previous cut-outs in
`game-art-v2/jack/work/`). Nothing was generated or invented.
- rmhladder: GrabCut photo cut-out (`face_photo_cut.png`, from the owner's rmhcode card), re-treated as a violet/lime
  halftone (badge, banner) and a 3-level posterised version (icon).
- rmhmusic: the owner's watercolour portrait from the original rmhmusic card, multiplied onto new paper/wash backgrounds.
- rmhstudy: the line-art face from the owner's original rmhstudy card, re-extracted (4x, thresholded to a clean ink mask,
  dial ticks removed) and recoloured navy.
- rmhtype: the line-art face from the owner's original rmhtype card, re-extracted the same way and recoloured black.

##### Third-party assets

| # | Title | Creator / source | URL | Licence | Used in | Changes |
|---|-------|------------------|-----|---------|---------|---------|
| 1 | "The Ladder" (salted paper print, April 1844) | William Henry Fox Talbot; The Metropolitan Museum of Art, Bequest of Maurice B. Sendak, 2012 (obj. 306335) | https://www.metmuseum.org/art/collection/search/306335 | CC0 (Met Open Access, public domain) | rmhladder card + banner | Cropped to the ladder, converted to a violet tritone duotone with grain; level labels (STAFF ... INTERN) and leader lines added on top. |
| 2 | "Sailors or Laborers Wanted" for Washington Navy Yard, City of Washington Gazette, 1 Dec 1819 | Newspaper advertisement (1819), Library of Congress scan, via Wikimedia Commons | https://commons.wikimedia.org/wiki/File:%22Sailors_or_Laborers_Wanted%22_for_Washington_Navy_Yard,_City_of_Washington_Gazette_1_Dec_1819.jpg | Public domain (Commons) | rmhladder card | Recoloured to deep violet ink on cream paper; placed as a taped clipping with a new caption. |
| 3 | "Palm Tree, Nassau" (watercolour, 1898) | Winslow Homer; The Met, Amelia B. Lazarus Fund, 1910 (obj. 11131) | https://www.metmuseum.org/art/collection/search/11131 | CC0 (Met Open Access) | rmhmusic card + banner | Palm crown cut from the sky by darkness mask, slightly saturated, mirrored/rotated and multiplied into the washes. |
| 4 | Church sonata K. 274, autograph score, f. 1r | Wolfgang Amadeus Mozart; Staatsbibliothek zu Berlin, via Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Mozart_-_Church_sonata_K._274_-_autograph,_Staatsbibliothek_zu_Berlin,_f._1r.png | Public domain (Commons) | rmhmusic card + banner | Cropped, desaturated and lifted to a faint manuscript texture under procedurally generated watercolour washes. |
| 5 | 12in-Vinyl-LP-Record-Angle.jpg | Evan-Amos, via Wikimedia Commons | https://commons.wikimedia.org/wiki/File:12in-Vinyl-LP-Record-Angle.jpg | Public domain (Commons) | rmhmusic card, banner, icon | Cut out as a disc, recoloured to blue, groove contrast boosted, yellow label repainted; used as a pale record behind the portrait and as the icon's record. |
| 6 | "Fleurs Tropicales et Palmiers (Tropical Flowers and Palm Trees)" (block-printed cotton, 1787) | Oberkampf Manufactory; The Met, Rogers Fund, 1937 (obj. 226246) | https://www.metmuseum.org/art/collection/search/226246 | CC0 (Met Open Access) | rmhmusic card | Cropped to a strip, mapped to a navy/sky duotone, faded into the bottom edge. |
| 7 | Stoppuhr hanhart.jpg (mechanical stopwatch) | Stefan (StefanPohl), via Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Stoppuhr_hanhart.jpg | Public domain (released by the author, Commons) | rmhstudy card + banner | Cut out of its background, mapped to a navy cyanotype tone, case clipped to a circle; the centre of the dial (including the maker's logo) is covered by the owner's face dial; amber second hand added. |
| 8 | 2ND DECK CASEMATE, ADDITIONAL DECK PROTECTION, 3 DEC. 1925 (blueprint, battleship Texas) | US Navy (Thompson), via Wikimedia Commons | https://commons.wikimedia.org/wiki/File:2ND_DECK_CASEMATE,_ADDITIONAL_DECK_PROTECTION,_3_DEC._1925.jpg | Public domain (Commons) | rmhstudy card + banner | Two crops, recoloured to the app's navy and pale-blue, darkened under a veil so it acts only as texture. |
| 9 | Underwood Standard Typewriter No. 5 (colored) | Anonymous advertisement illustration (Motion Picture Magazine), via Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Underwood_Standard_Typewriter_No._5_(colored).jpg | Public domain (Commons) | rmhtype card + banner | Cropped to the key rows only (no brand lettering), converted to graphite monochrome, edge-masked. |

##### Fonts (all from Google Fonts, https://github.com/google/fonts)

| Font | Designer | Licence | Used for |
|------|----------|---------|----------|
| Big Shoulders Display | Patric King | SIL OFL 1.1 (`ofl/bigshouldersdisplay`) | rmhladder chips, badge role, level labels, logo |
| Big Shoulders Stencil Display | Patric King | SIL OFL 1.1 (`ofl/bigshouldersstencildisplay`) | rmhstudy "STUDY" and CTA |
| Anton | Vernon Adams | SIL OFL 1.1 (`ofl/anton`) | rmhladder and rmhstudy card titles |
| Instrument Serif (Italic) | Rodrigo Fuenzalida, Jordan Egstad | SIL OFL 1.1 (`ofl/instrumentserif`) | rmhmusic tagline |
| IBM Plex Mono | Mike Abbink, Bold Monday | SIL OFL 1.1 (`ofl/ibmplexmono`) | body/data text across the batch |
| DM Mono | Colophon Foundry | SIL OFL 1.1 (`ofl/dmmono`) | rmhmusic time stamps and sub-line |
| Tourney | Tyler Finck, ETC | SIL OFL 1.1 (`ofl/tourney`) | rmhstudy logo |
| Yellowtail | Brian J. Bonislawsky (Astigmatic) | Apache License 2.0 (`apache/yellowtail`) | rmhmusic title and logo |
| Special Elite | Brian J. Bonislawsky (Astigmatic) | Apache License 2.0 (`apache/specialelite`) | rmhtype title, typed text, key legends, logo |

Yellowtail and Special Elite are published by Google Fonts under Apache 2.0 rather than the OFL; both permit use and
embedding in artwork. No other fonts are used in the finished images (extra files in `fonts/` are loaded but unused).

##### Tools
Python (PIL, numpy, OpenCV GrabCut/threshold), headless Chromium via Playwright for layout and type. All noise, paper
grain, watercolour washes, halftone dots, keycaps, badge, ladder and chart/UI shapes are generated by `scripts/`.


##### Hi-res v5 additions
No new third-party assets were added. One asset was re-fetched at higher resolution:
- 12in-Vinyl-LP-Record-Angle.jpg (Evan-Amos, Wikimedia Commons, public domain): https://commons.wikimedia.org/wiki/File:12in-Vinyl-LP-Record-Angle.jpg, now fetched at 3840 px (was 1920 px), cut to the disc and recoloured as before.
The Met originals (Talbot "The Ladder", 3416 px; Homer "Palm Tree, Nassau", 2800 px full crop, no downsizing) are used at full size.
All other photo assets are unchanged from the sections above (the larger Commons originals for the blueprint, Underwood typewriter and Mozart score could not be fetched: Wikimedia rate-limited the proxy).

### 2x batch C (apps: Tube, Connections, RMHdle, Studio)

#### Attributions: batch C hi-res (v5) — rmhtube, rmhconnections, rmhdle, rmhstudio
Earlier-version attributions (all other assets, fonts) remain in `../../app-art-v3/C/ATTRIBUTIONS.md`. Assets re-fetched at higher resolution for v5:

| Asset | Title / creator / URL | Licence | Resolution used | Changes |
|---|---|---|---|---|
| projector | "Old Film Projector", Gary Lee Todd, Ph.D. (Flickr original, `_o`), https://www.flickr.com/photos/101561334@N08/17028682361 | CC0 1.0 | 3456x5184 | cut-out (mask upscaled+smoothed), red duotone |
| mixer | "Mixing console", freestocks.org (Flickr original), https://www.flickr.com/photos/135396164@N05/25668265836 | CC0 1.0 | 5416x3611 | cyan/violet duotone, orange kept |
| loc_proj | "[Motion picture projectionist operating new sound projector in theater projection booth]", c1926, LC-USZ62-49229, Library of Congress, https://www.loc.gov/pictures/item/2006686775/ (master TIFF) | LOC: no known restrictions on publication | 1536x1195 | red duotone, halftone, film-strip frames |
| loc_voa | "[Men seated in control room at the Voice of America radio broadcasting studio]", 28 May 1976, Warren K. Leffler, LC-DIG-ppmsca-86224, https://www.loc.gov/pictures/item/2024630431/ (master TIFF) | LOC: no known restrictions on publication | 3619x5316 | crop, blur, blue duotone |
| brain | "Brain: dissection showing the gyri, seen from above. Coloured line engraving by W.H. Lizars, ca. 1826", Wellcome Collection (V0008410), https://wellcomecollection.org/works/fk5bnkpq (IIIF full image) | Public Domain Mark | 2244x3231 | spline cut-out, indigo/cream ink remap (replaces the rawpixel copy of the same plate) |
| cork, map, news, tiles, nagra_rp | rawpixel CC0 items as listed in the v3 file, fetched at the largest public size (`image_1300`) | CC0 1.0 (per Openverse/rawpixel) | 1300 px max | as v3; wood-tile face now = photo patch colour + procedural grain |
| face | owner's existing vector portrait (`public/images/games/rmhtube.webp`, via `oldcards`) | owner's own imagery | 330x382 source | cleaned/traced to crisp tone plates at 8x (bilateral + k-means posterise), re-screenprinted at 2x |

Fonts unchanged (SIL OFL 1.1, Google Fonts; see v3 file). Procedural parts (halftone, grain, scanlines, wood fibres, waveforms, notes, threads) generated by `scripts/`.

### 2x batch D (apps: Strategies; RMHcode and RMHbox banners and icons)

#### hires-v5 (2x) attributions
Same sources as app-art-v3/D and app-art-v4/D ATTRIBUTIONS.md (Met Open Access CC0: Sauthier map obj 384833, Knight 464233, Queen 479682, manuscript 24880; Wikimedia CC0: rope-core board, Pi Pico macro, cardboard texture; LoC "no known restrictions": crate board LCCN 2010651505, trademarks 2026706247 (W.B. fish) and 2026707861 (Insuloid stencil)). Owner's own card imagery for faces and the Sahur figure.

New in this pass:
- LoC master TIFFs re-fetched at full size (cdn.loc.gov/master/pnp/...): crate board 4926x1962, W.B. trademark 4134x6141, Insuloid trademark 4117x6216. Same rights statement and same changes as before (cropped, ink-only tinted marks, duotone planks).
- Met originals: the previously downloaded Met JPEGs were already full size (Sauthier 3071x4000, Queen 4000x3900, Knight 2000x1532, manuscript 2706x4000).
- Fonts (SIL OFL 1.1, google/fonts): Almendra, Cormorant SC, IM Fell Pica Italic (ofl/imfellpica; this REPLACES the IM Fell DW Pica listed in v3/v4, whose files had failed to download so the browser had silently fallen back to a system serif), VT323, Unbounded, Martian Mono, Stardos Stencil, Black Ops One.

### 2x batch E (games: Hearthworks, Altair, Counter-Strike, Half-Life 2, Portal)

#### hires-v5 / E: attributions (2x re-render of banners, cards, icons)

All sources are open: NASA media and US Government works are public domain, Library of Congress items carry no known restrictions, the Met item is CC0, Kenney tiles are CC0, fonts are SIL OFL. No Valve art is used (csgo, half-life-2 and portal stay drawn-from-scratch mimic-the-look).

##### Re-downloaded full-resolution masters (same works as before, higher resolution)
- Standard Elevator, 1 Saint Clair Street, Buffalo, NY (HAER NY-241), photo 350161: LoC master TIFF https://tile.loc.gov/storage-services/master/pnp/habshaer/ny/ny1600/ny1669/photos/350161pu.tif (3608x5000, was 739x1024). Item https://www.loc.gov/item/ny1669/. US Government work, public domain.
- Buffalo Grain Elevators, Buffalo, Erie County, NY (HAER NY-289), photo 350072: LoC master TIFF https://tile.loc.gov/storage-services/master/pnp/habshaer/ny/ny1600/ny1667/photos/350072pu.tif (5000x3632, was 1024x744). Item https://www.loc.gov/item/ny1667/. US Government work, public domain. (This also gives the exact record title that was missing in the v4 notes.)
- NASA "orig" files from https://images-assets.nasa.gov/image/<id>/<id>~orig.jpg: Skylab 0102625 (3000x2375), Clean Room in the Zero Gravity Research Facility GRC-1968-C-02344 (2048x1536, was 1280x960), Clean Room Facility GRC-2016-C-02363 (3000x2250, was 1280x960), Dawn Spacecraft Processing KSC-07PD-0861 (2349x3000) and KSC-07PD-0862 (2000x3008). Public domain.

##### Unchanged sources (already credited in earlier files)
- altair: NASA/MSFC Ben Franklin PX-15 interior id 6900903 (3000x2300 original). csgo: LoC Matson "Jerusalem, Damascus Gate" 15028u.tif (5785x4241 master). hearthworks: the Met Open Access object 913662 (2912x4000 original), Vilmorin-Andrieux engravings (Internet Archive, 1920, public domain), Kenney Isometric Landscape and Miniature Farm (CC0), Fredoka and Fraunces, DM Mono (OFL).

### 2x batch F (games: Dream Rift, Gabriel's Horn, Kowloon Knockout, Slice It, Synapse Storm)

#### Attributions: hires-v5 batch F (dream-rift, gabriels-horn, kowloon-knockout, slice-it, synapse-storm)

No new licences. Same sources as `game-art-v2/ATTRIBUTIONS*.md` and `game-banners-v4/F/ATTRIBUTIONS.md`; only the files were re-fetched at higher resolution.

Full-resolution masters re-downloaded this round (used as image data only):
- slice-it: W. P. Gottlieb, "Portrait of Sid Catlett", Library of Congress item 2023867522 (public domain per the photographer), IIIF full JPEG 5548x5642 (`tile.loc.gov/.../musgottlieb-01181:0001/full/pct:100.0/0/default.jpg`) replaces the earlier 2360 px derivative.
- kowloon-knockout: Wonderlane, Hong Kong 1990 (Flickr 14469754044, CC0 1.0), original `_o.jpg` 2747x4075 replaces the earlier 690x1024 copy.

Limited-resolution sources (upscaled Lanczos + mild unsharp; grain/halftone carries the texture):
- synapse-storm lightning: rawpixel "lightning bolt storm" (CC0), only a 1024x678 copy reachable (rawpixel is behind a Cloudflare challenge; Wikimedia Commons downloads were rate-limited, HTTP 429). Bolt cores are tightened in processing; the orb rings and bolts in the banner are redrawn procedurally at 2x.
- synapse-storm / Cajal plate: Internet Archive page image max 2086x3393 (`n204`), used as-is.
- dream-rift: Met original 1344x3873 (already the master). gabriels-horn: Met original 2710x3579 (already the master).
- Previous banner art (neon fighters, horn sprite, dice) exists only at 1x: upscaled 2x with Lanczos + unsharp.

### 2x batch G (games: Daily Puzzles, House Always Wins, Laundry Sort, Neon Driftway, Temple of Joy)

#### Attributions: hires-v5 (daily-puzzles, house-always-wins, laundry-sort, neon-driftway, temple-of-joy)

Open licences only. Everything is re-printed (halftone / riso plates, tritone maps), cropped and grained; nothing is used as found.

##### Higher-resolution originals used in this pass (same works as before, no new credits needed beyond these notes)
- Carol M. Highsmith, "Neon casino sign, Las Vegas" (LoC LC-DIG-highsm-17922, https://www.loc.gov/item/2011636116/): LoC master TIFF 6168x4867 (`.../master/pnp/highsm/17900/17922u.tif`). Public-domain dedication / no known restrictions. Used for the house-always-wins card strip, icon and banner canopy/bokeh.
- Carol M. Highsmith, "Vintage slot machine at the Casino Legends Hall of Fame" (LoC LC-DIG-highsm-13666, item 2011631860): LoC master TIFF 5422x6871. Same terms. Cut out as the hero prop in the house-always-wins banner.
- Internet Archive `crosswordpuzzleb00unse` (1924 Cross Word Puzzle Book), page n30, 2883x3523 (largest derivative the archive serves). Public domain.
- The Met Open Access (CC0), "original" files: object 313386 (DP104829.jpg, 1693x1901), 312773 (1979.206.577.jpg, 2227x2347). Used for the temple-of-joy card, icon and banner (the Met serves no larger image).
- Wikimedia Commons "Highway light trains at night (Unsplash).jpg", CC0 (https://commons.wikimedia.org/wiki/File:Highway_light_trains_at_night_(Unsplash).jpg), 3840x2400 (the largest size the proxy returned; the Commons rate limit blocked fetching the file-page metadata, so the photographer is not recorded). Neon-driftway banner only.

##### Resolution-limited sources (upscaled with Lanczos + unsharp, texture carried by halftone/grain)
- neon-driftway card: rawpixel "Long exposure traffic line night" 683x1024 (CC0 via Openverse; rawpixel blocks downloads, so no larger copy). ~2.3x upscale into halftone plates.
- laundry-sort: F. E. Church "Laundry Hung Out to Dry" 1500x723 (Smithsonian IDS serves max 1280 px; 1500 px copy used); 1919 Voss ad 1024x1024 (Flickr, PDM, only copy); Asheville postcard 1024x664 (Flickr PDM). The Voss line art is the weakest: the icon and the card machine are 2-4x upscales, re-thresholded to keep ink edges crisp.

##### Reused, already credited in earlier files (`game-art-v2/ATTRIBUTIONS*.md`, `game-banners-v4/G/ATTRIBUTIONS.md`)
Fonts (SIL OFL): Abril Fatface, Alfa Slab One, Anton, Rozha One, Fredoka, IBM Plex Mono, Gloock, Racing Sans One, Shrikhand, Space Mono, Ultra, UnifrakturMaguntia, Instrument Serif, Exo 2, Playfair Display, Special Elite, Courier Prime. All vector scenes are original procedural work.

### 2x batch H (games: Velum 2099, Versecraft, Void Breaker, Nightrail)

#### Attributions: hi-res v5 (velum2099, versecraft, void-breaker, nightrail)

Only open licences. No new licence class; two sources were re-fetched at higher resolution.

- **nightrail** (card, banner, icon): Library of Congress FSA/OWI, LC-USW3-012681-D (negative OWI-12681-D), https://www.loc.gov/item/2017836467/. "Public domain and free to use and reuse" (LoC rights statement for the FSA/OWI B&W negatives). NEW in this batch: the **master TIFF** `8d11258u.tif` (12904 x 9976 px, from tile.loc.gov) replaces the 1024 px service JPEG used earlier. Changes: crop inside the film rebate, black-plum/violet/amber/cream tritone, grain; card, banner and icon re-composed at 2x. Fonts (SIL OFL): Big Shoulders Display (title, now un-cropped), IBM Plex Mono.
- **velum2099**: Wikimedia Commons CC0 photo "Alone in Tokyo III" (47956673191), already credited. NEW: the 1920 x 2880 Commons derivative (was 960 px). Changes as in earlier files (riso cyan/magenta halftone, misregistration, bloom). Fonts (OFL): Dela Gothic One, DotGothic16, IBM Plex Mono.
- **void-breaker**: NASA / ESA / HEIC / Hubble Heritage Team, Cat's Eye Nebula, `GSFC_20171208_Archive_e002155` (NASA media, public domain). Already credited; the 1417 px `~orig.jpg` was already the full original. Fonts (OFL): Big Shoulders Stencil Display, Chakra Petch, IBM Plex Mono.
- **versecraft**: the owner's illustrated card art, figure untouched; no third-party asset.

Source resolution limits: see the report (Wikimedia would only serve up to 1920 px wide; the Hubble original is 1417 px; versecraft's card art exists only at 800 px).

---

## Altair "Outpost 13" visual pass (2026-11-07)

No new third-party art was added in this pass. The in-game sprite sheets in `public/sprites/altair/` are the existing CC0 sheets (Ninja Adventure, 16x16 DungeonTileset II) graded to the Altair card palette by `scripts/altair/grade-sprites.ts`; the untouched originals live in `scripts/altair/sprite-src/` and the script never writes there, so it can be re-run safely. Palette roles: cyan = allies, magenta = hostiles, amber = loot and hazards, dark teal = floor and props. The UI uses Michroma, Jost and IBM Plex Mono (SIL OFL 1.1, already in `components/shared/game-fonts/`); MedievalSharp was removed.

Candidates checked and rejected for this pass: OpenGameArt "Spacers" (CC0, but side-view platformer frames, not top-down) and OpenGameArt "Sci-fi platform tiles" (CC0, side-view). Several itch.io top-down sci-fi packs were found, but their licences are paid or unstated, so none were used.

## Altair menu scene (2026-11-07)

The main-menu backdrop is original work with no third-party art: `lib/altair/menu/corridor-scene.ts` draws the corridor procedurally, and the Echo and the security drone are hand-authored pixel sprites in `lib/altair/menu/menu-sprites.ts` (text frames over the Outpost 13 palette). Nothing was downloaded for it.

### Altair player characters, enemies, bosses and the Echo ally (original)

The eight player-character sheets in `public/sprites/altair/characters/`, the sixteen enemy sheets in `public/sprites/altair/enemies/`, the four boss sheets in `public/sprites/altair/bosses/` (32x32 frames) and the Echo ally sheet (`characters/echo.png`) are original: they are generated by `scripts/altair/sprites/` (one shared 16x16 figure with a four-frame walk cycle in four directions, plus per-class palette and silhouette accessories) and contain no third-party pixels. The earlier CC0-derived character and enemy sources were removed from `scripts/altair/sprite-src/`, along with the boss sources; tiles, props, pickups, projectiles and icons are still the graded CC0 sheets. Regenerate with `pnpm exec tsx scripts/altair/sprites/build-characters.ts`; output is deterministic.
