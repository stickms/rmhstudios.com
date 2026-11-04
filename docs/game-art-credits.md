# Game card pack: attributions

All 19 cards, icons and banners are original vector artwork drawn in SVG by `scripts/` (rendered with headless Chromium). The only third-party assets are open-licensed fonts from Google Fonts (SIL Open Font License 1.1), downloaded from https://github.com/google/fonts (path `ofl/<family>/...`, raw files at https://raw.githubusercontent.com/google/fonts/main/ofl/<family>/). The OFL permits commercial use and embedding in artwork; no attribution is required.

No official Valve / Counter-Strike / Half-Life / Portal files are used. The three ports (csgo, half-life-2, portal) mimic the franchise look only (orange/black lambda, sand-and-orange Dust II look, white Aperture-style test chamber with orange and blue portal rings), all drawn from scratch. Steam key art was looked at for reference during planning but was neither used nor shipped; nothing from it is in any output.

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
| slice-it | Audiowide, Jost | audiowide/Audiowide-Regular.ttf | Neon glow |
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

