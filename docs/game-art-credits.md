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
