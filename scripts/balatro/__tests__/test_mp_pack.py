"""Unit tests for scripts/balatro/import-mp-assets.py and the mp half of
build-game-pack.py. Run through scripts/balatro/__tests__/pack.test.ts (pnpm
test:balatro), or directly:

    python3 -I -m unittest discover -s scripts/balatro/__tests__ -p 'test_*.py'

Needs only the standard library and lua5.1 (LUA51=… to override): fontTools and
oxipng are imported lazily by the scripts and are not touched here.
"""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPTS = HERE.parent


def load(name: str, file: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / file)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


imp = load('import_mp_assets', 'import-mp-assets.py')
bld = load('build_game_pack', 'build-game-pack.py')
LUA = os.environ.get('LUA51') or 'lua5.1'


def solid(w: int, h: int, rgba: tuple[int, int, int, int]) -> 'imp.Image':
    return imp.Image(w, h, bytearray(bytes(rgba) * (w * h)))


def pixel(img, x: int, y: int) -> tuple[int, ...]:
    d = (y * img.w + x) * 4
    return tuple(img.px[d : d + 4])


class PngTests(unittest.TestCase):
    def test_round_trip(self):
        img = imp.Image(3, 2, bytearray(range(24)))
        back = imp.png_decode(imp.png_encode(img))
        self.assertEqual((back.w, back.h), (3, 2))
        self.assertEqual(back.px, img.px)
        self.assertEqual(imp.png_size(imp.png_encode(img)), (3, 2))

    def test_decodes_every_filter_type(self):
        # Hand-built 2x2 RGBA, one scanline per filter (Sub, Up), then Average and Paeth.
        import zlib

        rows = [
            bytes([1, 10, 20, 30, 255, 5, 5, 5, 0]),  # Sub: second pixel = first + delta
            bytes([2, 1, 1, 1, 0, 2, 2, 2, 0]),  # Up
            bytes([3, 0, 0, 0, 0, 0, 0, 0, 0]),  # Average
            bytes([4, 0, 0, 0, 0, 0, 0, 0, 0]),  # Paeth
        ]
        raw = b''.join(rows)

        def chunk(t: bytes, b: bytes) -> bytes:
            return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b) & 0xFFFFFFFF)

        png = (
            b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', 2, 4, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw))
            + chunk(b'IEND', b'')
        )
        img = imp.png_decode(png)
        self.assertEqual(pixel(img, 0, 0), (10, 20, 30, 255))
        self.assertEqual(pixel(img, 1, 0), (15, 25, 35, 255))
        self.assertEqual(pixel(img, 0, 1), (11, 21, 31, 255))
        self.assertEqual(pixel(img, 1, 1), (17, 27, 37, 255))
        # Average of left (0) and up: up >> 1.
        self.assertEqual(pixel(img, 0, 2), (5, 10, 15, 127))
        # Paeth with a = left, b = up, c = up-left.
        self.assertEqual(pixel(img, 0, 3), (5, 10, 15, 127))

    def test_rejects_unsupported(self):
        img = imp.png_encode(imp.Image(1, 1))
        bad = bytearray(img)
        bad[24] = 16  # bit depth
        with self.assertRaises(ValueError):
            imp.png_decode(bytes(bad))
        with self.assertRaises(ValueError):
            imp.png_decode(b'not a png')


class ComposeTests(unittest.TestCase):
    def sheet(self, scale: int):
        """A 10×10 sheet of cells, each filled with (x, y, scale, 255)."""
        cw, ch = 71 * scale, 95 * scale
        img = imp.Image(cw * 10, ch * 10)
        for cy in range(10):
            for cx in range(10):
                img.paste(solid(cw, ch, (cx, cy, scale, 255)), cx * cw, cy * ch)
        return img

    def test_misc_takes_the_echo_deck_and_extra_credit_cells(self):
        for scale in (1, 2):
            out = imp.compose_misc(self.sheet(scale), scale)
            self.assertEqual((out.w, out.h), (142 * scale, 95 * scale))
            self.assertEqual(pixel(out, 0, 0), (2, 0, scale, 255))  # Echo Deck (2,0) → (0,0)
            self.assertEqual(pixel(out, 71 * scale - 1, 95 * scale - 1), (2, 0, scale, 255))
            self.assertEqual(pixel(out, 71 * scale, 0), (1, 1, scale, 255))  # EC sticker (1,1) → (1,0)
            self.assertEqual(pixel(out, 142 * scale - 1, 95 * scale - 1), (1, 1, scale, 255))

    def test_tag_is_padded_into_a_vanilla_cell(self):
        for scale in (1, 2):
            out = imp.pad_tag(solid(32 * scale, 32 * scale, (9, 9, 9, 255)), scale)
            self.assertEqual((out.w, out.h), (34 * scale, 34 * scale))
            self.assertEqual(pixel(out, 0, 0), (0, 0, 0, 0))
            self.assertEqual(pixel(out, scale - 1, scale - 1), (0, 0, 0, 0))
            self.assertEqual(pixel(out, scale, scale), (9, 9, 9, 255))
            self.assertEqual(pixel(out, 33 * scale - 1, 33 * scale - 1), (9, 9, 9, 255))
            self.assertEqual(pixel(out, 34 * scale - 1, 34 * scale - 1), (0, 0, 0, 0))
        with self.assertRaises(ValueError):
            imp.pad_tag(solid(34, 34, (0, 0, 0, 0)), 1)

    def test_crop_bounds(self):
        with self.assertRaises(ValueError):
            imp.Image(4, 4).crop(2, 2, 3, 1)
        with self.assertRaises(ValueError):
            imp.Image(4, 4).paste(imp.Image(2, 2), 3, 0)


class ClassifyTests(unittest.TestCase):
    def test_prune_list(self):
        for dead in ('release_jokers.png', 'j_copycat.png', 'alt_t_web.png', 'modicon.png', 'sticker_nemesis.png'):
            self.assertEqual(imp.classify(dead), 'drop', dead)
        for kept in ('Trap.png', 'j_pizza.png', 'c_asteroid_ru.png', 'blind_col.png', 'pvp_title.png'):
            self.assertEqual(imp.classify(kept), 'keep', kept)
        self.assertEqual(imp.classify('ec_other_sandbox.png'), 'compose')
        self.assertEqual(imp.classify('brand_new_sheet.png'), 'unknown')

    def test_registry_keys(self):
        self.assertEqual(imp.registry_entry('j_pacifist.png')[0], 'mp_j_pacifist')
        key, entry = imp.registry_entry('player_blind_row.png')
        self.assertEqual(key, 'mp_player_blind_chip')
        self.assertEqual(entry['frames'], 21)
        self.assertEqual(imp.registry_entry('c_asteroid.png')[1]['variants'], {'ru': 'c_asteroid_ru.png'})


@unittest.skipIf(shutil.which(LUA) is None and not Path(LUA).exists(), 'lua5.1 missing (pack.test.ts fails loudly instead)')
class LocalizationConverterTests(unittest.TestCase):
    def convert(self, src: str | bytes):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'xx.lua'
            path.write_bytes(src if isinstance(src, bytes) else src.encode('utf-8'))
            return imp.run_lua_dump(path)

    def test_plain_table(self):
        got = self.convert(
            'return { descriptions = { Joker = { j_x = { name = "Ünï", text = { "a\\n\\"b\\"", "{C:mult}+#1#{}" } } } },'
            ' misc = { dictionary = { k = "日本語" }, n = 3, f = 1.5, b = true } }'
        )
        self.assertEqual(
            got,
            {
                'descriptions': {'Joker': {'j_x': {'name': 'Ünï', 'text': ['a\n"b"', '{C:mult}+#1#{}']}}},
                'misc': {'dictionary': {'k': '日本語'}, 'n': 3, 'f': 1.5, 'b': True},
            },
        )

    def test_comments_and_locals_are_fine(self):
        self.assertEqual(self.convert('-- hi\nlocal t = { a = "x" }\nreturn t'), {'a': 'x'})

    def test_no_globals_reach_the_chunk(self):
        for src in ('os.exit(1) return {}', 'return { x = io.open("/etc/passwd") }', 'require("x") return {}'):
            with self.assertRaises(ValueError, msg=src):
                self.convert(src)

    def test_rejects_code_and_odd_tables(self):
        for src in (
            'return { f = function() end }',
            'return "not a table"',
            'return { [true] = 1 }',
            'return { 1, 2, x = 3 }',
            'return { [0.5] = 1 }',
            'return { x = 1/0 }',
        ):
            with self.assertRaises(ValueError, msg=src):
                self.convert(src)

    def test_rejects_bytecode(self):
        with self.assertRaises(ValueError):
            self.convert(b'\x1bLua\x51\x00rest')

    def test_instruction_budget(self):
        with self.assertRaises(ValueError):
            self.convert('while true do end')


class LocBuilderTests(unittest.TestCase):
    EN = {
        'descriptions': {'Joker': {'j_a': {'name': 'A', 'text': ['+#1# Mult']}, 'j_b': {'name': 'B', 'text': ['x']}}},
        'misc': {'dictionary': {'k_one': 'One', 'k_two': 'Two'}, 'v_text': {'ch_c_x': ['line #1#']}},
    }

    def test_prune_keeps_matching_entries_only(self):
        report: list[str] = []
        tr = {
            'descriptions': {
                'Joker': {
                    'j_a': {'name': 'Ä', 'text': ['+#1# Multi']},  # kept
                    'j_b': {'name': 'B', 'text': ['#2#']},  # placeholder English lacks → English
                    'j_gone': {'name': 'G', 'text': ['g']},  # not in English → dropped
                }
            },
            'misc': {'dictionary': {'k_one': 'Eins', 'k_two': ['wrong shape']}, 'stray': 'x'},
        }
        got = bld.prune_translation(self.EN, tr, 'de', report)
        self.assertEqual(
            got,
            {'descriptions': {'Joker': {'j_a': {'name': 'Ä', 'text': ['+#1# Multi']}}}, 'misc': {'dictionary': {'k_one': 'Eins'}}},
        )
        self.assertIn('placeholder de.descriptions.Joker.j_b', report)
        self.assertIn('unused de.descriptions.Joker.j_gone', report)
        self.assertIn('shape de.misc.dictionary.k_two', report)
        self.assertIn('unused de.misc.stray', report)

    def test_extras_merge_and_collide(self):
        merged = bld.merge_extras(self.EN, {'$comment': 'x', 'misc': {'dictionary': {'rmh_mp_x': 'X'}}})
        self.assertEqual(merged['misc']['dictionary']['rmh_mp_x'], 'X')
        self.assertEqual(merged['misc']['dictionary']['k_one'], 'One')
        self.assertNotIn('$comment', merged)
        with self.assertRaises(SystemExit):
            bld.merge_extras(self.EN, {'misc': {'dictionary': {'k_one': 'clash'}}})

    def test_dead_content_is_dropped(self):
        t = {
            'descriptions': {
                'Joker': {'j_mp_8ball_release': {'name': 'x'}, 'j_mp_baron': {'name': 'x'}, 'j_mp_pizza': {'name': 'P'}},
                'Stake': {'stake_mp_plastic': {'name': 'x'}, 'stake_mp_planet': {'name': 'Planet'}},
            }
        }
        self.assertEqual(
            bld.drop_dead(t),
            {'descriptions': {'Joker': {'j_mp_pizza': {'name': 'P'}}, 'Stake': {'stake_mp_planet': {'name': 'Planet'}}}},
        )

    def test_fallback_glyphs_only_where_missing(self):
        covered = {ord(c) for c in "abc'"}
        self.assertEqual(bld.with_fallback_glyphs({'k': ['a’b', 'c…']}, covered), {'k': ["a'b", 'c...']})
        self.assertEqual(bld.with_fallback_glyphs('a’', covered | {0x2019}), 'a’')

    @unittest.skipIf(shutil.which(LUA) is None and not Path(LUA).exists(), 'lua5.1 missing')
    def test_lua_literal_round_trips_through_lua51(self):
        data = {
            'end': ['quote " back \\ nl \n tab \t bell \x07', 'ünï 日本'],
            'k-ey': {'and': 1, 'ok_2': 2.5, 'b': False},
            'list': [[1, 2], ['x']],
        }
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 't.lua'
            path.write_bytes(bld.lua_module('test', data))
            luac = shutil.which('luac5.1')
            if luac:
                self.assertEqual(subprocess.run([luac, '-p', str(path)]).returncode, 0)
            self.assertEqual(imp.run_lua_dump(path), data)

    def test_lua_literal_rejects_non_data(self):
        for bad in (None, float('nan'), float('inf'), object()):
            with self.assertRaises(ValueError):
                bld.lua_value({'x': bad})


class CorePatchTests(unittest.TestCase):
    def test_anchor_must_occur_once(self):
        patch = [('a.lua', 'X', 'Y X')]
        self.assertEqual(bld.apply_patches('a.lua', b'1 X 2', patch), b'1 Y X 2')
        self.assertEqual(bld.apply_patches('b.lua', b'X X', patch), b'X X')
        for src in (b'none', b'X and X'):
            with self.assertRaises(SystemExit):
                bld.apply_patches('a.lua', src, patch)

    def test_eval_row_patch_applies_to_the_shipped_source_on_one_line(self):
        path = SCRIPTS.parents[1] / 'data' / 'balatro' / 'functions' / 'common_events.lua'
        src = path.read_bytes()
        out = bld.apply_patches('functions/common_events.lua', src)
        self.assertIn(b'RMH_MP.eval_row_label(config, left_text, scale, num_dollars)', out)
        self.assertEqual(out.count(b'\n'), src.count(b'\n'))


class GlyphBitmapTests(unittest.TestCase):
    def test_format(self):
        blob = bld.glyph_bitmap(
            [('resources/fonts/a.ttf', {0x41, 0x42, 0x3042}), ('resources/fonts/b.ttf', set())],
            {'en-us': 0, 'ja': 1},
        )
        self.assertEqual(blob[:4], b'RMHG')
        self.assertEqual(tuple(blob[4:8]), (1, 2, 2, 0))
        o = 8
        fonts = []
        for _ in range(2):
            n = blob[o]
            name = blob[o + 1 : o + 1 + n].decode()
            o += 1 + n
            (length,) = struct.unpack('<I', blob[o : o + 4])
            bits = blob[o + 4 : o + 4 + length]
            o += 4 + length
            fonts.append((name, {cp for cp in range(length * 8) if bits[cp >> 3] >> (cp & 7) & 1}))
        self.assertEqual(fonts, [('resources/fonts/a.ttf', {0x41, 0x42, 0x3042}), ('resources/fonts/b.ttf', set())])
        langs = {}
        for _ in range(2):
            n = blob[o]
            key = blob[o + 1 : o + 1 + n].decode()
            langs[key] = blob[o + 1 + n]
            o += 2 + n
        self.assertEqual(langs, {'en-us': 0, 'ja': 1})
        self.assertEqual(o, len(blob))


class GameFontsTests(unittest.TestCase):
    def test_reads_languages_and_fonts_from_game_lua(self):
        files, langs = bld.game_fonts()
        self.assertEqual(files[0], 'resources/fonts/m6x11plus.ttf')
        self.assertEqual(files[langs['ja']], 'resources/fonts/NotoSansJP-Bold.ttf')
        self.assertEqual(files[langs['ru']], 'resources/fonts/NotoSans-Bold.ttf')
        self.assertNotIn('all1', langs)
        self.assertEqual(len(langs), 15)


class ShippedDataTests(unittest.TestCase):
    """The committed data the importer wrote."""

    def test_localization_files_are_sorted_json(self):
        for path in sorted((SCRIPTS.parents[1] / 'data' / 'balatro-mp' / 'localization').glob('*.json')):
            text = path.read_text(encoding='utf-8')
            self.assertEqual(text, imp.dump_json(json.loads(text)), path.name)


if __name__ == '__main__':
    unittest.main()
